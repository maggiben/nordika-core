import { projectIdFromSnapshotContent } from './project-id';

describe('projectIdFromSnapshotContent', () => {
  it('reads meta.projectId', () => {
    expect(
      projectIdFromSnapshotContent({
        meta: { projectId: 'proj_north' },
      }),
    ).toBe('proj_north');
  });

  it('returns null when missing', () => {
    expect(projectIdFromSnapshotContent(null)).toBeNull();
    expect(projectIdFromSnapshotContent({ meta: {} })).toBeNull();
  });
});
