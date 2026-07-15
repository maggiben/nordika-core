import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalJwtSecret) {
      process.env.JWT_SECRET = originalJwtSecret;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  it('returns the subject and string roles from a valid payload', () => {
    process.env.JWT_SECRET = 'test-secret';
    const strategy = new JwtStrategy();

    expect(
      strategy.validate({
        roles: ['source_writer', 1, 'reader'],
        sub: 'user-1',
      }),
    ).toEqual({
      roles: ['source_writer', 'reader'],
      subject: 'user-1',
    });
  });

  it('returns no roles when the payload has no roles array', () => {
    process.env.JWT_SECRET = 'test-secret';
    const strategy = new JwtStrategy();

    expect(strategy.validate({ sub: 'user-1' })).toEqual({
      roles: [],
      subject: 'user-1',
    });
  });

  it('rejects a payload without a subject', () => {
    process.env.JWT_SECRET = 'test-secret';
    const strategy = new JwtStrategy();

    expect(() => strategy.validate({ sub: '' })).toThrow(UnauthorizedException);
  });
});
