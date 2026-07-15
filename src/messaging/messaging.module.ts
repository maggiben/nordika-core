import { DynamicModule, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ACCOUNT_MODEL, accountSchema } from '../auth/auth.schema';
import { LocaleService } from '../i18n/locale.service';
import { getMongoUri } from '../mongo/mongo.config';
import { EvolutionClient } from './evolution.client';
import { MessagingController } from './messaging.controller';
import { getMessagingModelDefinitions } from './messaging.models';
import { MessagingScheduler } from './messaging.scheduler';
import { MessagingWebhookController } from './messaging.webhook.controller';
import { MessagingService } from './messaging.service';

@Module({})
export class MessagingModule {
  static register(): DynamicModule {
    if (!getMongoUri()) {
      return { module: MessagingModule };
    }

    const models = getMessagingModelDefinitions();

    return {
      module: MessagingModule,
      imports: [
        ScheduleModule.forRoot(),
        MongooseModule.forFeature([
          ...models,
          { name: ACCOUNT_MODEL, schema: accountSchema },
        ]),
      ],
      controllers: [MessagingController, MessagingWebhookController],
      providers: [
        LocaleService,
        EvolutionClient,
        MessagingService,
        MessagingScheduler,
      ],
    };
  }
}
