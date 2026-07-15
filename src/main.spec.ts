const listen = jest.fn().mockResolvedValue(undefined);
const enableCors = jest.fn();
const use = jest.fn();
const useGlobalPipes = jest.fn();
const create = jest.fn().mockResolvedValue({
  enableCors,
  listen,
  use,
  useGlobalPipes,
});

jest.mock('@nestjs/core', () => ({
  NestFactory: { create },
}));

import { bootstrap } from './main';

describe('bootstrap', () => {
  beforeEach(() => {
    create.mockClear();
    listen.mockClear();
    enableCors.mockClear();
    use.mockClear();
    useGlobalPipes.mockClear();
  });

  it('creates the application and listens on the configured port', async () => {
    const originalPort = process.env.PORT;
    process.env.PORT = '4000';

    await bootstrap();

    expect(create).toHaveBeenCalledTimes(1);
    expect(useGlobalPipes).toHaveBeenCalledTimes(1);
    expect(enableCors).toHaveBeenCalledWith(
      expect.objectContaining({ credentials: true }),
    );
    expect(listen).toHaveBeenCalledWith(4000);

    if (originalPort) {
      process.env.PORT = originalPort;
    } else {
      delete process.env.PORT;
    }
  });

  it('uses port 3000 when PORT is unset', async () => {
    const originalPort = process.env.PORT;
    delete process.env.PORT;

    await bootstrap();

    expect(listen).toHaveBeenCalledWith(3000);

    if (originalPort) {
      process.env.PORT = originalPort;
    }
  });
});
