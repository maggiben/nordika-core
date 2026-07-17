import {
  effectiveObjectiveAvance,
  extractPendingObjectiveTasks,
  isPendingObjectiveAvance,
  isTaskInDateWindow,
  parseTaskCalendarDate,
} from './pending-objective-tasks';

const TODAY = '2026-07-17';

function withWindow(
  row: Record<string, unknown>,
  ini = '2026-07-01',
  fin = '2026-07-31',
): Record<string, unknown> {
  return { ...row, ini, fin };
}

describe('pending-objective-tasks', () => {
  it('treats missing or sub-100 avance as pending', () => {
    expect(isPendingObjectiveAvance(undefined)).toBe(true);
    expect(isPendingObjectiveAvance(40)).toBe(true);
    expect(isPendingObjectiveAvance(100)).toBe(false);
    expect(isPendingObjectiveAvance(101)).toBe(false);
  });

  it('prefers live percent over snapshot avance', () => {
    expect(effectiveObjectiveAvance(40, 100)).toBe(100);
    expect(effectiveObjectiveAvance(100, 40)).toBe(40);
    expect(effectiveObjectiveAvance(40, undefined)).toBe(40);
  });

  it('parses calendar dates from snapshot fields', () => {
    expect(parseTaskCalendarDate('2026-07-01')).toBe('2026-07-01');
    expect(parseTaskCalendarDate('2026-07-01T12:00:00Z')).toBe('2026-07-01');
    expect(parseTaskCalendarDate('nope')).toBeNull();
    expect(parseTaskCalendarDate(null)).toBeNull();
    expect(parseTaskCalendarDate('2026-13-01')).toBeNull();
    expect(parseTaskCalendarDate('2026-00-10')).toBeNull();
    expect(parseTaskCalendarDate('2026-07-00')).toBeNull();
    expect(parseTaskCalendarDate('2026-07-32')).toBeNull();
  });

  it('uses utc today when no today option is provided', () => {
    const now = new Date();
    const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    const pending = extractPendingObjectiveTasks({
      tareas_con_objetivo: [
        withWindow({ id: 'a', label: 'hoy', avance_base: 1 }, today, today),
        withWindow(
          { id: 'b', label: 'pasado', avance_base: 1 },
          '2000-01-01',
          '2000-01-02',
        ),
      ],
    });
    expect(pending.map((row) => row.taskId)).toEqual(['a']);
  });

  it('evaluates inclusive ini/fin windows', () => {
    expect(isTaskInDateWindow('2026-07-01', '2026-07-31', TODAY)).toBe(true);
    expect(isTaskInDateWindow('2026-07-17', '2026-07-17', TODAY)).toBe(true);
    expect(isTaskInDateWindow('2026-08-01', '2026-08-31', TODAY)).toBe(false);
    expect(isTaskInDateWindow('2026-06-01', '2026-06-30', TODAY)).toBe(false);
    expect(isTaskInDateWindow(undefined, '2026-07-31', TODAY)).toBe(false);
    expect(isTaskInDateWindow('2026-07-01', undefined, TODAY)).toBe(false);
  });

  it('extracts pending objective tasks and skips completed ones', () => {
    const pending = extractPendingObjectiveTasks(
      {
        tareas_con_objetivo: [
          withWindow({
            id: 'a',
            label: 'colocacion carpinterias',
            avance_base: 40,
          }),
          withWindow({ id: 'b', label: 'hecho', avance_base: 100 }),
          withWindow({ id: 'c', label: 'sin avance' }),
        ],
      },
      { today: TODAY },
    );
    expect(pending).toEqual([
      {
        taskId: 'a',
        label: 'colocacion carpinterias',
        avanceBase: 40,
      },
      { taskId: 'c', label: 'sin avance', avanceBase: null },
    ]);
  });

  it('skips tasks already at 100% from live parsed progress', () => {
    const pending = extractPendingObjectiveTasks(
      {
        tareas_con_objetivo: [
          withWindow({
            id: 'a',
            label: 'colocacion carpinterias',
            avance_base: 40,
          }),
          withWindow({ id: 'b', label: 'pintura', avance_base: 10 }),
        ],
      },
      {
        cap: 20,
        today: TODAY,
        livePercentByTaskId: new Map([
          ['a', 100],
          ['b', 55],
        ]),
      },
    );
    expect(pending).toEqual([
      { taskId: 'b', label: 'pintura', avanceBase: 55 },
    ]);
  });

  it('excludes future, past, and undated tasks from the window', () => {
    const pending = extractPendingObjectiveTasks(
      {
        tareas_con_objetivo: [
          withWindow(
            { id: 'future', label: 'agosto', avance_base: 0 },
            '2026-08-01',
            '2026-08-31',
          ),
          withWindow(
            { id: 'past', label: 'junio', avance_base: 0 },
            '2026-06-01',
            '2026-06-30',
          ),
          { id: 'undated', label: 'sin fechas', avance_base: 0 },
          withWindow({ id: 'now', label: 'julio', avance_base: 0 }),
        ],
      },
      { today: TODAY },
    );
    expect(pending).toEqual([{ taskId: 'now', label: 'julio', avanceBase: 0 }]);
  });

  it('applies the safety cap after the date window filter', () => {
    const tareas = Array.from({ length: 25 }, (_, i) =>
      withWindow({
        id: `t${i}`,
        label: `Tarea ${i}`,
        avance_base: 0,
      }),
    );
    expect(
      extractPendingObjectiveTasks(
        { tareas_con_objetivo: tareas },
        { cap: 20, today: TODAY },
      ),
    ).toHaveLength(20);
  });

  it('returns empty for invalid payloads', () => {
    expect(extractPendingObjectiveTasks(null, { today: TODAY })).toEqual([]);
    expect(
      extractPendingObjectiveTasks(
        { tareas_con_objetivo: 'nope' },
        { today: TODAY },
      ),
    ).toEqual([]);
    expect(
      extractPendingObjectiveTasks(
        {
          tareas_con_objetivo: [
            null,
            'x',
            withWindow({ label: 'ok', avance_base: 1 }),
          ],
        },
        { today: TODAY },
      ),
    ).toEqual([{ taskId: 'task-3', label: 'ok', avanceBase: 1 }]);
  });
});
