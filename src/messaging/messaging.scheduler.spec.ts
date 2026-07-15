import { MessagingScheduler } from './messaging.scheduler';

describe('MessagingScheduler', () => {
  it('logs when scheduled notifications produce work', async () => {
    const messaging = {
      runScheduledNotifications: jest.fn(() =>
        Promise.resolve({
          dueAccounts: 1,
          emailsSent: 1,
          emailFailures: 0,
          whatsappTriggered: true,
          whatsappSummaries: [
            { cicloId: '1', weekNumber: 1, sent: 1, failed: 0, skipped: 0 },
          ],
        }),
      ),
    };
    const scheduler = new MessagingScheduler(messaging as never);
    await expect(
      scheduler.handleScheduledNotifications(),
    ).resolves.toBeUndefined();
    expect(messaging.runScheduledNotifications).toHaveBeenCalled();
  });

  it('swallows notification runner errors', async () => {
    const messaging = {
      runScheduledNotifications: jest.fn(() =>
        Promise.reject(new Error('provider down')),
      ),
    };
    const scheduler = new MessagingScheduler(messaging as never);
    await expect(
      scheduler.handleScheduledNotifications(),
    ).resolves.toBeUndefined();
  });

  it('skips overlapping ticks while a run is in progress', async () => {
    let resolveRun!: () => void;
    const messaging = {
      runScheduledNotifications: jest.fn(
        () =>
          new Promise<{
            dueAccounts: number;
            emailsSent: number;
            emailFailures: number;
            whatsappTriggered: boolean;
            whatsappSummaries: [];
          }>((resolve) => {
            resolveRun = () =>
              resolve({
                dueAccounts: 0,
                emailsSent: 0,
                emailFailures: 0,
                whatsappTriggered: false,
                whatsappSummaries: [],
              });
          }),
      ),
    };
    const scheduler = new MessagingScheduler(messaging as never);
    const first = scheduler.handleScheduledNotifications();
    const second = scheduler.handleScheduledNotifications();
    resolveRun();
    await Promise.all([first, second]);
    expect(messaging.runScheduledNotifications).toHaveBeenCalledTimes(1);
  });
});
