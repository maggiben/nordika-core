import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const auth = {
    login: jest.fn(),
    logout: jest.fn(),
    refresh: jest.fn(),
    register: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
    verifyEmail: jest.fn(),
  };
  const controller = new AuthController(auth as never);
  const response = {
    clearCookie: jest.fn(),
    cookie: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('stores issued tokens in HTTP-only cookies', async () => {
    const credentials = {
      email: 'person@example.com',
      password: 'a-password-123',
    };
    const token = 'a'.repeat(32);
    const session = {
      accessToken: 'access-token',
      account: { email: credentials.email },
      refreshToken: token,
    };
    auth.register.mockResolvedValue(session);
    auth.login.mockResolvedValue(session);
    auth.refresh.mockResolvedValue(session);

    await controller.register(credentials, response as never);
    await controller.login(credentials, response as never);
    await controller.refresh({ refreshToken: token }, response as never);
    await controller.logout({ refreshToken: token }, response as never);
    await controller.forgotPassword({ email: credentials.email });
    await controller.verifyEmail({ token });
    await controller.resetPassword({ token, password: credentials.password });

    expect(auth.register).toHaveBeenCalledWith(
      credentials.email,
      credentials.password,
    );
    expect(auth.login).toHaveBeenCalledWith(
      credentials.email,
      credentials.password,
    );
    expect(auth.refresh).toHaveBeenCalledWith(token);
    expect(auth.logout).toHaveBeenCalledWith(token);
    expect(auth.requestPasswordReset).toHaveBeenCalledWith(credentials.email);
    expect(auth.verifyEmail).toHaveBeenCalledWith(token);
    expect(auth.resetPassword).toHaveBeenCalledWith(
      token,
      credentials.password,
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'access_token',
      'access-token',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith('refresh_token', {
      path: '/',
    });
  });
});
