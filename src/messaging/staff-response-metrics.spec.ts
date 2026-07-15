import {
  computeResponseLatencyMs,
  responseStatusFromLatencyMs,
  responseStatusWhileWaiting,
} from './staff-response-metrics';

describe('staff-response-metrics', () => {
  it('computes latency and traffic-light bands (1d green / 2d yellow / 3d+ red)', () => {
    const sent = new Date('2026-07-01T00:00:00.000Z');
    const replied = new Date('2026-07-02T00:00:00.000Z');
    const latency = computeResponseLatencyMs(sent, replied);
    expect(latency).toBe(24 * 60 * 60 * 1000);
    expect(responseStatusFromLatencyMs(latency)).toBe('green');
    expect(responseStatusFromLatencyMs(1.5 * 24 * 60 * 60 * 1000)).toBe(
      'yellow',
    );
    expect(responseStatusFromLatencyMs(2 * 24 * 60 * 60 * 1000)).toBe('yellow');
    expect(responseStatusFromLatencyMs(3 * 24 * 60 * 60 * 1000)).toBe('red');
    expect(responseStatusFromLatencyMs(null)).toBe('pending');
  });

  it('marks waiting sends by silent age', () => {
    const sent = new Date('2026-07-10T00:00:00.000Z');
    const now = new Date('2026-07-11T12:00:00.000Z');
    expect(responseStatusWhileWaiting(sent, now)).toBe('yellow');
    expect(
      responseStatusWhileWaiting(sent, new Date('2026-07-13T00:00:00.000Z')),
    ).toBe('red');
  });
});
