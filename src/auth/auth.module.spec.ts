import { AuthModule } from './auth.module';

describe('AuthModule', () => {
  it('is defined', () => {
    expect(new AuthModule()).toBeInstanceOf(AuthModule);
  });
});
