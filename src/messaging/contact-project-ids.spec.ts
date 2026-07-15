import {
  contactBelongsToAnyProject,
  mergeContactProjectIds,
  normalizeContactProjectIds,
} from './contact-project-ids';

describe('contact-project-ids', () => {
  it('prefers projectIds over singular projectId', () => {
    expect(
      normalizeContactProjectIds({
        projectId: 'legacy',
        projectIds: ['proj_a', 'proj_b'],
      }),
    ).toEqual(['proj_a', 'proj_b']);
  });

  it('falls back to singular projectId', () => {
    expect(normalizeContactProjectIds({ projectId: 'proj_a' })).toEqual([
      'proj_a',
    ]);
  });

  it('merges membership without duplicates', () => {
    expect(
      mergeContactProjectIds(['proj_a'], 'proj_b', ['proj_a', 'proj_c']),
    ).toEqual(['proj_a', 'proj_b', 'proj_c']);
  });

  it('ignores blank, null, and empty array parts while merging', () => {
    expect(
      mergeContactProjectIds('  ', null, undefined, ['', '  ', 'proj_a'], ''),
    ).toEqual(['proj_a']);
    expect(normalizeContactProjectIds({ projectIds: ['', '  '] })).toEqual([]);
    expect(normalizeContactProjectIds({ projectId: '   ' })).toEqual([]);
  });

  it('matches when any membership intersects allowed', () => {
    expect(
      contactBelongsToAnyProject(
        { projectIds: ['proj_a', 'proj_b'] },
        new Set(['proj_b']),
      ),
    ).toBe(true);
    expect(
      contactBelongsToAnyProject(
        { projectIds: ['proj_a', 'proj_b'] },
        new Set(['proj_c']),
      ),
    ).toBe(false);
  });
});
