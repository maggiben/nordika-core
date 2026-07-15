import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { getPort } from './config/environment';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const validationLogger = new Logger('ValidationPipe');
  app.enableCors({
    credentials: true,
    origin: process.env.APP_URL ?? 'http://localhost:3001',
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      // Strip unknown fields instead of 400 — Railway env redeploys can briefly
      // run GitHub builds that lag local DTO changes (e.g. test-send `language`).
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((error) =>
          error.constraints ? Object.values(error.constraints) : [],
        );
        validationLogger.warn(
          `Validation failed: ${messages.join('; ') || 'unknown'}`,
        );
        return new BadRequestException(
          messages.length > 0 ? messages : 'Validation failed',
        );
      },
    }),
  );
  await app.listen(getPort());
}
void bootstrap();
