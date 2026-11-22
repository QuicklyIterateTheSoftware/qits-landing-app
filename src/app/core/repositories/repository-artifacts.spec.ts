import { maintenanceGoldenMasters } from '../../../testing/golden-masters';
import type { ArtifactEntry } from '$core/maintenance/maintenance.consumes';
import { kindLabel, placeOf, repositoryArtifacts } from './repository-artifacts';

/** qits-maintenance's "released artifacts, some behind": five artifacts of four repositories. */
const released = (): ArtifactEntry[] =>
  maintenanceGoldenMasters.body('released artifacts, some behind', 'listArtifacts');

describe('repositoryArtifacts', () => {
  it('keeps the repository’s artifacts, images first, each with its store page', () => {
    const mine = repositoryArtifacts(released(), 'contract-service');
    expect(mine.map((a) => [a.key, a.place])).toEqual([
      ['docker:qits/contract-service', { kind: 'image', store: 'qits', name: 'contract-service' }],
      [
        'maven:eu.wohlben.qits:contract-service-client',
        { kind: 'maven', store: 'maven', name: 'eu.wohlben.qits:contract-service-client' },
      ],
    ]);
    expect(mine.map(kindLabel)).toEqual(['Image', 'Maven package']);
  });

  it('places an npm package and a daemon in their stores', () => {
    expect(repositoryArtifacts(released(), 'contract-frontend')[0]?.place).toEqual({
      kind: 'npm',
      store: 'npm',
      name: '@qits/contract-ui',
    });
    expect(repositoryArtifacts(released(), 'contract-daemon')[0]?.place).toEqual({
      kind: 'daemon',
      store: 'daemons',
      name: 'contract-daemon',
    });
  });

  it('keeps nothing for another repository, or no name', () => {
    expect(repositoryArtifacts(released(), 'no-such-repository')).toEqual([]);
    expect(repositoryArtifacts(released(), '')).toEqual([]);
  });
});

describe('placeOf', () => {
  it('has no page for an image without a namespace, or an ecosystem the store does not hold', () => {
    expect(placeOf({ ecosystem: 'docker', name: 'bare' })).toBeUndefined();
    expect(placeOf({ ecosystem: 'docker', name: 'qits/' })).toBeUndefined();
    expect(placeOf({ ecosystem: 'pypi', name: 'thing' })).toBeUndefined();
    expect(placeOf({ ecosystem: 'npm' })).toBeUndefined();
  });

  it('keeps a nested image path whole after the namespace', () => {
    expect(placeOf({ ecosystem: 'docker', name: 'qits/build-images/node' })).toEqual({
      kind: 'image',
      store: 'qits',
      name: 'build-images/node',
    });
  });
});
