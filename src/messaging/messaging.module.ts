import { DynamicModule, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { getEvolutionConfig } from '../config/environment';
import { getMongoUri } from '../mongo/mongo.config';
import { EvolutionClient } from './evolution.client';
import { MessagingController } from './messaging.controller';
import { MessagingScheduler } from './messaging.scheduler';
import {
  CICLO_MODEL,
  MESSAGE_DISPATCH_MODEL,
  MESSAGE_TEMPLATE_MODEL,
  WHATSAPP_CONTACT_MODEL,
  WORK_STATUS_MODEL,
  cicloSchema,
  messageDispatchSchema,
  messageTemplateSchema,
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
        ]),
      ],
      controllers: [MessagingController],
      providers: [
        MessagingService,
        MessagingScheduler,
        {
          provide: EvolutionClient,
          useFactory: () => new EvolutionClient(getEvolutionConfig()),
        },
      ],
    };
  }
}
