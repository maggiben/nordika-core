import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { HttpCacheInterceptor } from './cache/http-cache.interceptor';
import { RedisCacheModule } from './cache/redis-cache.module';
import { MessagingModule } from './messaging/messaging.module';
import { MongoModule } from './mongo/mongo.module';
import { SourcesModule } from './sources/sources.module';

@Module({
  imports: [
    MongoModule.register(),
    RedisCacheModule.register(),
    AuthModule.register(),
    AccountModule,
    MessagingModule.register(),
    SourcesModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          limit: 60,
          name: 'default',
          ttl: 60_000,
        },
      ],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpCacheInterceptor,
    },
  ],
})
export class AppModule {}
