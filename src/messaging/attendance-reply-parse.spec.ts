import {
  ATTENDANCE_CATALOG_TAG,
  isAttendanceCatalogMessage,
  parseAttendanceReply,
  upsertAttendanceMarksForDate,
} from './attendance-reply-parse';

describe('attendance-reply-parse', () => {
  const reports = [
    { id: 'r1', name: 'Ana Pérez', role: 'operario' as const },
    { id: 'r2', name: 'Luis Gómez', role: 'jornalero' as const },
  ];

  it('detects attendance catalog by tag or title', () => {
    expect(isAttendanceCatalogMessage({ tags: [ATTENDANCE_CATALOG_TAG] })).toBe(
      true,
    );
    expect(
      isAttendanceCatalogMessage({
        tags: [null as unknown as string, '  '],
        title: 'Team attendance — Jul 19',
      }),
    ).toBe(true);
    expect(
      isAttendanceCatalogMessage({
        body: "Please report today's attendance",
      }),
    ).toBe(true);
    expect(
      isAttendanceCatalogMessage({
        title: 'Asistencia',
        body: 'Marcá día completo o faltó',
      }),
    ).toBe(true);
    expect(isAttendanceCatalogMessage({ title: 'Performance' })).toBe(false);
  });

  it('parses per-line statuses for known reports', () => {
    const marks = parseAttendanceReply({
      date: '2026-07-19',
      reports,
      replyBody: ['1. Ana Pérez - Día completo', '2. Luis Gómez: faltó'].join(
        '\n',
      ),
    });
    expect(marks).toEqual(
      expect.arrayContaining([
        { reportId: 'r1', date: '2026-07-19', status: 'full_day' },
        { reportId: 'r2', date: '2026-07-19', status: 'absent' },
      ]),
    );
    expect(marks).toHaveLength(2);
  });

  it('parses half day and upserts without wiping other dates', () => {
    const marks = parseAttendanceReply({
      date: '2026-07-19',
      reports,
      replyBody: 'Ana media jornada, Luis half day',
    });
    expect(marks).toEqual(
      expect.arrayContaining([
        { reportId: 'r1', date: '2026-07-19', status: 'half_day' },
        { reportId: 'r2', date: '2026-07-19', status: 'half_day' },
      ]),
    );
    expect(marks).toHaveLength(2);
    const merged = upsertAttendanceMarksForDate(
      [{ reportId: 'r1', date: '2026-07-18', status: 'full_day' }],
      marks,
    );
    expect(merged).toEqual(
      expect.arrayContaining([
        { reportId: 'r1', date: '2026-07-18', status: 'full_day' },
        ...marks,
      ]),
    );
    expect(upsertAttendanceMarksForDate(merged, [])).toEqual(merged);
  });

  it('returns empty for invalid inputs and unmatched text', () => {
    expect(
      parseAttendanceReply({ date: 'bad', reports, replyBody: 'Ana faltó' }),
    ).toEqual([]);
    expect(
      parseAttendanceReply({ date: '2026-07-19', reports: [], replyBody: 'x' }),
    ).toEqual([]);
    expect(
      parseAttendanceReply({
        date: '2026-07-19',
        reports,
        replyBody: '   ',
      }),
    ).toEqual([]);
    expect(
      parseAttendanceReply({
        date: '2026-07-19',
        reports,
        replyBody: 'Todo bien en obra',
      }),
    ).toEqual([]);
  });

  it('parses justified leave and ignores duplicate first names as shortcuts', () => {
    const twinReports = [
      { id: 'a1', name: 'Juan A', role: 'operario' as const },
      { id: 'a2', name: 'Juan B', role: 'jornalero' as const },
    ];
    expect(
      parseAttendanceReply({
        date: '2026-07-19',
        reports: twinReports,
        replyBody: 'Juan justificada',
      }),
    ).toEqual([]);
    expect(
      parseAttendanceReply({
        date: '2026-07-19',
        reports: [{ id: 'r9', name: 'Sofía', role: 'otro' as const }],
        replyBody: 'Sofía licencia',
      }),
    ).toEqual([{ reportId: 'r9', date: '2026-07-19', status: 'justified' }]);
  });

  it('matches English presente/absent wording', () => {
    expect(
      parseAttendanceReply({
        date: '2026-07-19',
        reports: [{ id: 'r1', name: 'Ana', role: 'operario' as const }],
        replyBody: 'Ana presente',
      }),
    ).toEqual([{ reportId: 'r1', date: '2026-07-19', status: 'full_day' }]);
  });

  it('skips blank report names and names without a status', () => {
    expect(
      parseAttendanceReply({
        date: '2026-07-19',
        reports: [
          { id: 'blank', name: '   ', role: 'otro' as const },
          { id: 'r1', name: 'Ana', role: 'operario' as const },
        ],
        replyBody: 'Ana está ok hoy',
      }),
    ).toEqual([]);
  });

  it('detects todays attendance heuristic and replaces same-day marks', () => {
    expect(
      isAttendanceCatalogMessage({ body: 'todays attendance checklist' }),
    ).toBe(true);
    const existing = [
      { reportId: 'r1', date: '2026-07-19', status: 'absent' as const },
      { reportId: 'r1', date: '2026-07-18', status: 'full_day' as const },
    ];
    const next = [
      { reportId: 'r1', date: '2026-07-19', status: 'full_day' as const },
    ];
    expect(upsertAttendanceMarksForDate(existing, next)).toEqual([
      { reportId: 'r1', date: '2026-07-18', status: 'full_day' },
      { reportId: 'r1', date: '2026-07-19', status: 'full_day' },
    ]);
  });
});
