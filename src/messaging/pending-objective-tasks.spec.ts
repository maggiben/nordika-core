import {
  extractPendingObjectiveTasks,
  isPendingObjectiveAvance,
} from './pending-objective-tasks';

describe('pending-objective-tasks', () => {
  it('treats missing or sub-100 avance as pending', () => {
    expect(isPendingObjectiveAvance(undefined)).toBe(true);
    expect(isPendingObjectiveAvance(40)).toBe(true);
    expect(isPendingObjectiveAvance(100)).toBe(false);
    expect(isPendingObjectiveAvance(101)).toBe(false);
  });

  it('extracts pending objective tasks and skips completed ones', () => {
    const pending = extractPendingObjectiveTasks({
      tareas_con_objetivo: [
        { id: 'a', label: 'colocacion carpinterias', avance_base: 40 },
        { id: 'b', label: 'hecho', avance_base: 100 },
        { id: 'c', label: 'sin avance' },
      ],
    });
    expect(pending).toEqual([
      {
        taskId: 'a',
        label: 'colocacion carpinterias',
        avanceBase: 40,
      },
      { taskId: 'c', label: 'sin avance', avanceBase: null },
    ]);
  });

  it('caps the pending list', () => {
    const tareas = Array.from({ length: 25 }, (_, i) => ({
      id: `t${i}`,
      label: `Tarea ${i}`,
      avance_base: 0,
    }));
    expect(
      extractPendingObjectiveTasks({ tareas_con_objetivo: tareas }, 20),
    ).toHaveLength(20);
  });

  it('returns empty for invalid payloads', () => {
    expect(extractPendingObjectiveTasks(null)).toEqual([]);
    expect(
      extractPendingObjectiveTasks({ tareas_con_objetivo: 'nope' }),
    ).toEqual([]);
    expect(
      extractPendingObjectiveTasks({
        tareas_con_objetivo: [null, 'x', { label: 'ok', avance_base: 1 }],
      }),
    ).toEqual([
      { taskId: 'task-1', label: 'Task 1', avanceBase: null },
      { taskId: 'task-2', label: 'Task 2', avanceBase: null },
      { taskId: 'task-3', label: 'ok', avanceBase: 1 },
    ]);
  });
});
