import { AccountController } from './account.controller';

describe('AccountController', () => {
  const accounts = {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
  };
  const auth = {
    changePassword: jest.fn(),
  };
  const controller = new AccountController(accounts as never, auth as never);

  beforeEach(() => {
    accounts.getSettings.mockReset();
    accounts.updateSettings.mockReset();
    auth.changePassword.mockReset();
  });

  it('delegates settings reads', async () => {
    accounts.getSettings.mockResolvedValue({ email: 'person@example.com' });
    await expect(
      controller.getSettings({ user: { subject: 'account-id' } } as never),
    ).resolves.toEqual({ email: 'person@example.com' });
  });

  it('delegates settings updates including language', async () => {
    accounts.updateSettings.mockResolvedValue({ ok: true });
    const dto = {
      language: 'es' as const,
      enabled: true,
      frequency: 'weekly' as const,
      daysOfWeek: [1],
      dayOfMonth: 1,
      sendTime: '09:00',
    };
    await expect(
      controller.updateSettings(
        { user: { subject: 'account-id' } } as never,
        dto,
      ),
    ).resolves.toEqual({ ok: true });
    expect(accounts.updateSettings).toHaveBeenCalledWith('account-id', dto);
  });

  it('changes passwords for the authenticated account', async () => {
    auth.changePassword.mockResolvedValue(undefined);
    await expect(
      controller.changePassword({ user: { subject: 'account-id' } } as never, {
        currentPassword: 'old-password-12',
        newPassword: 'new-password-12',
      }),
    ).resolves.toEqual({ ok: true });
    expect(auth.changePassword).toHaveBeenCalledWith(
      'account-id',
      'old-password-12',
      'new-password-12',
    );
  });
});
