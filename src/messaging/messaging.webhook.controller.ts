import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InboundMessageDto } from './messaging.dto';
import { MessagingService } from './messaging.service';

/**
 * Public Evolution inbound webhook (optional shared secret).
 * No JWT — Evolution cannot authenticate as an app user.
 */
@Controller('messaging/webhooks')
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class MessagingWebhookController {
  constructor(private readonly messaging: MessagingService) {}

  @Post('evolution')
  ingestEvolution(
    @Body() body: Record<string, unknown>,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    this.assertWebhookSecret(secret);
    const inbound = this.messaging.extractInboundFromEvolution(body);
    if (!inbound) {
      return { ok: true, ignored: true };
    }
    return this.messaging.recordInboundMessage(inbound);
  }

  @Post('inbound')
  ingestInbound(
    @Body() dto: InboundMessageDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    this.assertWebhookSecret(secret);
    return this.messaging.recordInboundMessage(dto);
  }

  private assertWebhookSecret(secret: string | undefined): void {
    const expected = process.env.EVOLUTION_WEBHOOK_SECRET?.trim();
    if (!expected) {
      return;
    }
    if (secret !== expected) {
      throw new UnauthorizedException('Invalid webhook secret.');
    }
  }
}
