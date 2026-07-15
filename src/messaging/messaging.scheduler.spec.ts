import { MessagingScheduler } from './messaging.scheduler';
import { MessagingService } from './messaging.service';

describe('MessagingScheduler', () => {
  it('logs successful weekly dispatch summaries', async () => {
    const messaging = {
      runWeeklyStatusDispatch: jest.fn(async () => [
        { cicloId: '1', weekNumber: 1, sent: 1, failed: 0, skipped: 0 },
      ]),
    } as unknown as MessagingService;
    const scheduler = new MessagingScheduler(messaging);
    await expect(scheduler.handleWeeklyStatusQuery()).resolves.toBeUndefined();
  });

  it('swallows configuration errors so cron does not crash', async () => {
    const messaging = {
      runWeeklyStatusDispatch: jest.fn(async () => {
        throw new Error('WhatsApp messaging is not configured');
      }),
    } as unknown as MessagingService;
    const scheduler = new MessagingScheduler(messaging);
    await expect(scheduler.handleWeeklyStatusQuery()).resolves.toBeUndefined();
  });
});
