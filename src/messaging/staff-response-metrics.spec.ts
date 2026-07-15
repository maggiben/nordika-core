import {
  computeResponseLatencyMs,
  responseStatusFromLatencyMs,
  responseStatusWhileWaiting,
} from './staff-response-metrics';

describe('staff-response-metrics', () => {
  it('computes latency and traffic-light bands', () => {
    const sent = new Date('2026-07-01T00:00:00.000Z');
    const replied = new Date('2026-07-02T00:00:00.000Z');
    const latency = computeResponseLatencyMs(sent, replied);
    expect(latency).toBe(24 * 60 * 60 * 1000);
    expect(responseStatusFromLatencyMs(latency)).toBe('green');
    expect(responseStatusFromLatencyMs(3 * 24 * 60 * 60 * 1000)).toBe('yellow');
    expect(responseStatusFromLatencyMs(6 * 24 * 60 * 60 * 1000)).toBe('red');
    expect(responseStatusFromLatencyMs(null)).toBe('pending');
  });

  it('marks waiting sends by silent age', () => {
    const sent = new Date('2026-07-10T00:00:00.000Z');
    const now = new Date('2026-07-14T00:00:00.000Z');
    expect(responseStatusWhileWaiting(sent, now)).toBe('yellow');
  });
});
