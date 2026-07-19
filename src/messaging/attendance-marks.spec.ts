import {
  dateInYearMonth,
  filterMarksByYearMonth,
  mergeAttendanceMonth,
  normalizeAttendanceMarks,
} from './attendance-marks';

describe('attendance-marks', () => {
  it('normalizes valid marks and drops invalid ones', () => {
    expect(
      normalizeAttendanceMarks([
        { reportId: 'r1', date: '2026-07-01', status: 'full_day' },
        { reportId: 'r1', date: 'bad', status: 'full_day' },
        { reportId: 'r2', date: '2026-07-02', status: 'nope' },
        { reportId: 'r1', date: '2026-07-01', status: 'absent' },
      ]),
    ).toEqual([{ reportId: 'r1', date: '2026-07-01', status: 'full_day' }]);
  });

  it('filters and merges by year-month without touching other months', () => {
    const existing = [
      { reportId: 'r1', date: '2026-06-30', status: 'justified' as const },
      { reportId: 'r1', date: '2026-07-01', status: 'full_day' as const },
    ];
    expect(dateInYearMonth('2026-07-01', '2026-07')).toBe(true);
    expect(filterMarksByYearMonth(existing, '2026-06')).toEqual([existing[0]]);
    const merged = mergeAttendanceMonth(existing, '2026-07', [
      { reportId: 'r1', date: '2026-07-02', status: 'absent' },
      { reportId: 'r1', date: '2026-06-01', status: 'half_day' },
    ]);
    expect(merged).toEqual([
      { reportId: 'r1', date: '2026-06-30', status: 'justified' },
      { reportId: 'r1', date: '2026-07-02', status: 'absent' },
    ]);
  });
});
