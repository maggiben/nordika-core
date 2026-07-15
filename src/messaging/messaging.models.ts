import { createRequire } from 'node:module';
import type { ModelDefinition } from '@nestjs/mongoose';
import type { Schema } from 'mongoose';

const requireSchema = createRequire(__filename);

type MessagingSchemaExports = {
  WHATSAPP_CONTACT_MODEL: string;
  MESSAGE_TEMPLATE_MODEL: string;
  CICLO_MODEL: string;
  WORK_STATUS_MODEL: string;
  MESSAGE_DISPATCH_MODEL: string;
  STAFF_MESSAGE_MODEL: string;
  STAFF_CATALOG_MESSAGE_MODEL: string;
  MESSAGE_FLOW_MODEL: string;
  MESSAGE_FLOW_RUN_MODEL: string;
  whatsAppContactSchema: Schema;
  messageTemplateSchema: Schema;
  cicloSchema: Schema;
  workStatusSchema: Schema;
  messageDispatchSchema: Schema;
  staffMessageSchema: Schema;
  staffCatalogMessageSchema: Schema;
  messageFlowSchema: Schema;
  messageFlowRunSchema: Schema;
};

/**
 * Nest `MongooseModule.forFeature` registrations.
 * Loads schemas via `require` so type-aware lint is not blocked when the
 * language service fails to resolve exports from `messaging.schema`.
 */
export function getMessagingModelDefinitions(): ModelDefinition[] {
  const s = requireSchema('./messaging.schema') as MessagingSchemaExports;
  return [
    { name: s.WHATSAPP_CONTACT_MODEL, schema: s.whatsAppContactSchema },
    { name: s.MESSAGE_TEMPLATE_MODEL, schema: s.messageTemplateSchema },
    { name: s.CICLO_MODEL, schema: s.cicloSchema },
    { name: s.WORK_STATUS_MODEL, schema: s.workStatusSchema },
    { name: s.MESSAGE_DISPATCH_MODEL, schema: s.messageDispatchSchema },
    { name: s.STAFF_MESSAGE_MODEL, schema: s.staffMessageSchema },
    {
      name: s.STAFF_CATALOG_MESSAGE_MODEL,
      schema: s.staffCatalogMessageSchema,
    },
    { name: s.MESSAGE_FLOW_MODEL, schema: s.messageFlowSchema },
    { name: s.MESSAGE_FLOW_RUN_MODEL, schema: s.messageFlowRunSchema },
  ];
}
