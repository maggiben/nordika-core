import { normalizeOrgReports } from './org-reports';

describe('normalizeOrgReports', () => {
  it('keeps valid reports and strips roleOther unless role is otro', () => {
    expect(
      normalizeOrgReports([
        { id: 'r1', name: 'Ana', role: 'operario' },
        { id: 'r2', name: 'Bob', role: 'otro', roleOther: 'Capataz' },
        { id: 'r3', name: 'Bad', role: 'operario', roleOther: 'ignored' },
        { id: ' ', name: 'x', role: 'jornalero' },
        null,
      ]),
    ).toEqual([
      { id: 'r1', name: 'Ana', role: 'operario' },
      { id: 'r2', name: 'Bob', role: 'otro', roleOther: 'Capataz' },
      { id: 'r3', name: 'Bad', role: 'operario' },
    ]);
  });

  it('returns empty for non-arrays', () => {
    expect(normalizeOrgReports(null)).toEqual([]);
    expect(normalizeOrgReports({})).toEqual([]);
  });
});
