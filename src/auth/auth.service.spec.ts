const send = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
}));

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { scrypt } from 'crypto';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const account = {
    _id: { toString: () => 'account-id' },
    email: 'person@example.com',
    identities: [{ provider: 'local', subject: 'person@example.com' }],
    roles: ['source_writer'],
  };
  const accounts = mockModel();
  const credentials = mockModel();
  const sessions = mockModel();
  const actionTokens = mockModel();
  const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') };
  let service: AuthService;

  beforeEach(() => {
    process.env.APP_URL = 'https://bff.example.com';
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM = 'Nodika <auth@example.com>';
    Object.values({ accounts, credentials, sessions, actionTokens, jwt }).forEach(
      (model) => Object.values(model).forEach((fn) => {
        if (typeof fn === 'function') fn.mockReset();
      }),
    );
    accounts.exists.mockResolvedValue(null);
    accounts.create.mockResolvedValue(account);
    credentials.create.mockResolvedValue({});
    sessions.create.mockResolvedValue({});
    actionTokens.create.mockResolvedValue({ _id: 'action-id' });
    actionTokens.deleteOne.mockResolvedValue({});
    send.mockReset().mockResolvedValue({ data: { id: 'email-id' } });
    jwt.signAsync.mockResolvedValue('access-token');
    service = new AuthService(
      accounts as never,
      credentials as never,
      sessions as never,
      actionTokens as never,
      jwt as never,
    );
  });

  it('registers an unverified local account without source-writer JWT claims', async () => {
    const result = await service.register(' Person@Example.com ', 'a-password-123');

    expect(accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'person@example.com',
        identities: [{ provider: 'local', subject: 'person@example.com' }],
        roles: ['source_writer'],
      }),
    );
    expect(credentials.create).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: account._id, salt: expect.any(String) }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['person@example.com'] }),
    );
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'account-id',
      roles: [],
    });
    expect(result.account).toEqual(
      expect.objectContaining({ emailVerified: false, roles: [] }),
    );
  });

  it('does not make registration unusable when email delivery fails', async () => {
    send.mockRejectedValueOnce(new Error('delivery failed'));

    await expect(
      service.register('person@example.com', 'a-password-123'),
    ).resolves.toEqual(expect.objectContaining({ accessToken: 'access-token' }));
    expect(actionTokens.deleteOne).toHaveBeenCalledWith({ _id: 'action-id' });
  });

  it('rejects duplicate registration', async () => {
    accounts.exists.mockResolvedValueOnce({ _id: 'existing' });
    await expect(
      service.register('person@example.com', 'a-password-123'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs in verified accounts with their stored roles', async () => {
    accounts.findOne.mockResolvedValueOnce({
      ...account,
      emailVerifiedAt: new Date(),
    });
    const salt = 'test-salt';
    const hash = await new Promise<Buffer>((resolve, reject) =>
      scrypt('a-password-123', salt, 64, (error, value) =>
        error ? reject(error) : resolve(value),
      ),
    );
    credentials.findOne.mockResolvedValueOnce({
      salt,
      passwordHash: hash.toString('base64url'),
    });

    await service.login('PERSON@example.com', 'a-password-123');
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'account-id',
      roles: ['source_writer'],
    });
  });

  it('rejects unknown, missing-credential, malformed, and wrong-password login attempts', async () => {
    accounts.findOne.mockResolvedValueOnce(null);
    await expect(service.login('person@example.com', 'a-password-123')).rejects.toBeInstanceOf(UnauthorizedException);
    accounts.findOne.mockResolvedValueOnce(account);
    credentials.findOne.mockResolvedValueOnce(null);
    await expect(service.login('person@example.com', 'a-password-123')).rejects.toBeInstanceOf(UnauthorizedException);
    accounts.findOne.mockResolvedValueOnce(account);
    credentials.findOne.mockResolvedValueOnce({ salt: 'salt', passwordHash: 'tiny' });
    await expect(service.login('person@example.com', 'a-password-123')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates refresh sessions and uses current verification status', async () => {
    sessions.findOne.mockResolvedValueOnce({ _id: 'session-id', accountId: account._id });
    accounts.findById.mockResolvedValueOnce({ ...account, emailVerifiedAt: new Date() });
    sessions.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    await service.refresh('a'.repeat(32));
    expect(sessions.updateOne).toHaveBeenCalledWith(
      { _id: 'session-id', revokedAt: { $exists: false } },
      expect.objectContaining({ $set: expect.objectContaining({ replacedByHash: expect.any(String) }) }),
    );
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'account-id', roles: ['source_writer'] });
  });

  it('rejects absent accounts and concurrent refresh reuse', async () => {
    sessions.findOne.mockResolvedValueOnce(null);
    await expect(service.refresh('a'.repeat(32))).rejects.toBeInstanceOf(UnauthorizedException);
    sessions.findOne.mockResolvedValueOnce({ _id: 'session-id', accountId: account._id });
    accounts.findById.mockResolvedValueOnce(null);
    await expect(service.refresh('a'.repeat(32))).rejects.toBeInstanceOf(UnauthorizedException);
    sessions.findOne.mockResolvedValueOnce({ _id: 'session-id', accountId: account._id });
    accounts.findById.mockResolvedValueOnce(account);
    sessions.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
    await expect(service.refresh('a'.repeat(32))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes a logout session and only sends resets for known accounts', async () => {
    await service.logout('a'.repeat(32));
    expect(sessions.updateOne).toHaveBeenCalled();
    accounts.findOne.mockResolvedValueOnce(null);
    await service.requestPasswordReset('unknown@example.com');
    expect(send).not.toHaveBeenCalled();
    accounts.findOne.mockResolvedValueOnce(account);
    await service.requestPasswordReset(account.email);
    expect(send).toHaveBeenCalled();
  });

  it('verifies and resets using single-use action tokens', async () => {
    actionTokens.findOne.mockResolvedValueOnce({ _id: 'verify-id', accountId: account._id });
    actionTokens.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });
    await service.verifyEmail('a'.repeat(32));
    expect(accounts.updateOne).toHaveBeenCalled();
    actionTokens.findOne.mockResolvedValueOnce({ _id: 'reset-id', accountId: account._id });
    actionTokens.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });
    await service.resetPassword('a'.repeat(32), 'a-new-password');
    expect(credentials.updateOne).toHaveBeenCalled();
    expect(sessions.updateMany).toHaveBeenCalled();
  });

  it('rejects missing and already-consumed action tokens', async () => {
    actionTokens.findOne.mockResolvedValueOnce(null);
    await expect(service.verifyEmail('a'.repeat(32))).rejects.toBeInstanceOf(UnauthorizedException);
    actionTokens.findOne.mockResolvedValueOnce({ _id: 'verify-id', accountId: account._id });
    actionTokens.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
    await expect(service.verifyEmail('a'.repeat(32))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function mockModel() {
  return {
    create: jest.fn(),
    deleteOne: jest.fn(),
    exists: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    updateMany: jest.fn(),
    updateOne: jest.fn(),
  };
}
