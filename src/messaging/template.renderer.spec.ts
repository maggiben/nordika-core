import {
  computeWeekNumber,
  formatDateOnly,
  isDateWithinCiclo,
  renderTemplateText,
} from './template.renderer';

describe('template.renderer', () => {
  it('replaces known placeholders and drops unknown ones to empty', () => {
    expect(
      renderTemplateText(
        'Week {{week}}: {{percent}}% — {{avance}} {{unknown}}',
        {
          percent: '30',
          duration: '2w',
          avance: 'cimiento',
          ciclo_inicio: '2026-07-01',
          ciclo_fin: '2026-09-30',
          week: '3',
          ciclo_name: 'C1',
          notes: '',
        },
      ),
    ).toBe('Week 3: 30% — cimiento ');
  });

  it('computes 1-based week numbers from ciclo_inicio', () => {
    expect(
      computeWeekNumber(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-01T12:00:00Z')),
    ).toBe(1);
    expect(
      computeWeekNumber(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-08T00:00:00Z')),
    ).toBe(2);
    expect(
      computeWeekNumber(new Date('2026-07-01T00:00:00Z'), new Date('2026-06-30T00:00:00Z')),
    ).toBe(0);
  });

  it('checks inclusive ciclo date bounds on UTC days', () => {
    expect(
      isDateWithinCiclo(
        new Date('2026-07-01T00:00:00Z'),
        new Date('2026-07-31T00:00:00Z'),
        new Date('2026-07-15T15:00:00Z'),
      ),
    ).toBe(true);
    expect(
      isDateWithinCiclo(
        new Date('2026-07-01T00:00:00Z'),
        new Date('2026-07-31T00:00:00Z'),
        new Date('2026-08-01T00:00:00Z'),
      ),
    ).toBe(false);
  });

  it('formats YYYY-MM-DD in UTC', () => {
    expect(formatDateOnly(new Date('2026-07-14T23:30:00Z'))).toBe('2026-07-14');
  });
});
