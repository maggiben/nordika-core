import {
  projectIdFromSnapshotContent,
  projectNombreFromSnapshotContent,
} from './project-id';

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

describe('projectNombreFromSnapshotContent', () => {
  it('reads meta.projectNombre', () => {
    expect(
      projectNombreFromSnapshotContent({
        meta: { projectNombre: 'Pier' },
      }),
    ).toBe('Pier');
  });

  it('returns null when missing', () => {
    expect(projectNombreFromSnapshotContent(null)).toBeNull();
    expect(projectNombreFromSnapshotContent({ meta: {} })).toBeNull();
  });
});
