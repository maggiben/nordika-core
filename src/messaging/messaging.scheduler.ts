import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MessagingService } from './messaging.service';

/**
 * Minute poller for account-driven schedules.
 *
 * @deprecated Fixed `WHATSAPP_WEEKLY_CRON` / `WHATSAPP_TIMEZONE` are no longer
 * used. Sends follow the per-account `emailNotificationSchedule` (timezone,
 * days, time) instead.
 */
@Injectable()
export class MessagingScheduler {
  private readonly logger = new Logger(MessagingScheduler.name);
  private running = false;

  constructor(private readonly messaging: MessagingService) {}

  /** Every minute: claim due account slots, email digests, WhatsApp weekly. */
  @Cron('* * * * *')
  async handleScheduledNotifications(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const result = await this.messaging.runScheduledNotifications();
      if (result.emailsSent > 0 || result.whatsappTriggered) {
        this.logger.log(
          `Scheduled notifications finished: ${JSON.stringify(result)}`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown scheduler error';
      this.logger.warn(`Scheduled notifications skipped: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
