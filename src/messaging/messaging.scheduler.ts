import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MessagingService } from './messaging.service';

@Injectable()
export class MessagingScheduler {
  private readonly logger = new Logger(MessagingScheduler.name);

  constructor(private readonly messaging: MessagingService) {}

  /** Default: Mondays at 09:00 America/Argentina/Buenos_Aires (override via cron expression env). */
  @Cron(process.env.WHATSAPP_WEEKLY_CRON ?? '0 9 * * 1', {
    timeZone: process.env.WHATSAPP_TIMEZONE ?? 'America/Argentina/Buenos_Aires',
  })
  async handleWeeklyStatusQuery(): Promise<void> {
    try {
      const summaries = await this.messaging.runWeeklyStatusDispatch();
      this.logger.log(
        `Weekly WhatsApp status dispatch finished: ${JSON.stringify(summaries)}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown scheduler error';
      this.logger.warn(`Weekly WhatsApp status dispatch skipped: ${message}`);
    }
  }
}
