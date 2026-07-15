import { DynamicModule, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { getEvolutionConfig } from '../config/environment';
import { getMongoUri } from '../mongo/mongo.config';
import { EvolutionClient } from './evolution.client';
import { MessagingController } from './messaging.controller';
import { MessagingScheduler } from './messaging.scheduler';
import { MessagingWebhookController } from './messaging.webhook.controller';
import {
  CICLO_MODEL,
  MESSAGE_DISPATCH_MODEL,
  MESSAGE_TEMPLATE_MODEL,
  STAFF_CATALOG_MESSAGE_MODEL,
  STAFF_MESSAGE_MODEL,
  WHATSAPP_CONTACT_MODEL,
  WORK_STATUS_MODEL,
  cicloSchema,
  messageDispatchSchema,
  messageTemplateSchema,
  staffCatalogMessageSchema,
  staffMessageSchema,
  whatsAppContactSchema,
  workStatusSchema,
} from './messaging.schema';
import { MessagingService } from './messaging.service';

@Module({})
export class MessagingModule {
  static register(): DynamicModule {
    if (!getMongoUri()) {
      return { module: MessagingModule };
    }

    return {
      module: MessagingModule,
      imports: [
        ScheduleModule.forRoot(),
        MongooseModule.forFeature([
          { name: WHATSAPP_CONTACT_MODEL, schema: whatsAppContactSchema },
          { name: MESSAGE_TEMPLATE_MODEL, schema: messageTemplateSchema },
          { name: CICLO_MODEL, schema: cicloSchema },
          { name: WORK_STATUS_MODEL, schema: workStatusSchema },
          { name: MESSAGE_DISPATCH_MODEL, schema: messageDispatchSchema },
          { name: STAFF_MESSAGE_MODEL, schema: staffMessageSchema },
          {
            name: STAFF_CATALOG_MESSAGE_MODEL,
            schema: staffCatalogMessageSchema,
          },
        ]),
      ],
      controllers: [MessagingController, MessagingWebhookController],
      providers: [
        MessagingService,
        MessagingScheduler,
        {
          provide: EvolutionClient,
          useFactory: (): EvolutionClient =>
            new EvolutionClient(getEvolutionConfig()),
        },
      ],
    };
  }
}
