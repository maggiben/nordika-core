import { AppModule } from './app.module';

describe('AppModule', () => {
  it('is defined', () => {
    expect(new AppModule()).toBeInstanceOf(AppModule);
  });
});
