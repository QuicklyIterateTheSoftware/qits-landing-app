import type { DependencyEntry } from '$core/maintenance/maintenance.consumes';
import {
  artifactPage,
  byEmbeddedVersion,
  dependentsName,
  ecosystemOf,
  inventoryNames,
  pinsGlob,
  pinsOf,
  type PackageDependent,
} from './package-releases';

/** How a mirror package is named in qits-maintenance's inventory (qits-2488). */
describe('package-releases', () => {
  it('maps a cache type to its ecosystem, and nothing else', () => {
    expect(ecosystemOf('npm-proxy')).toBe('npm');
    expect(ecosystemOf('maven-proxy')).toBe('maven');
    expect(ecosystemOf('oci-mirror')).toBe('docker');
    expect(ecosystemOf('something-else')).toBeUndefined();
    expect(ecosystemOf(undefined)).toBeUndefined();
  });

  it('names npm and maven packages as the mirror does', () => {
    expect(inventoryNames('npmjs', 'npm-proxy', 'left-pad')).toEqual(['left-pad']);
    expect(inventoryNames('central', 'maven-proxy', 'org.example:lib')).toEqual([
      'org.example:lib',
    ]);
    expect(pinsGlob('npmjs', 'npm-proxy', 'left-pad')).toBe('left-pad');
  });

  it('names an image as its FROM line may: upstream, cached, or through the mirror', () => {
    expect(inventoryNames('hub', 'oci-mirror', 'library/node')).toEqual([
      'node',
      'library/node',
      'hub/library/node',
    ]);
    expect(inventoryNames('quay', 'oci-mirror', 'quarkus/ubi9')).toEqual([
      'quarkus/ubi9',
      'quay/quarkus/ubi9',
    ]);
    expect(pinsGlob('hub', 'oci-mirror', 'library/node')).toBe('*node');
  });

  it('keeps only the inventory entries that are the package', () => {
    const entries: DependencyEntry[] = [
      { ecosystem: 'npm', name: '@types/node', pins: [] },
      { ecosystem: 'docker', name: 'node', pins: [] },
      { ecosystem: 'docker', name: 'hub/library/node', pins: [] },
      { ecosystem: 'docker', name: 'my-node', pins: [] },
    ];
    expect(pinsOf(entries, 'hub', 'oci-mirror', 'library/node').map((e) => e.name)).toEqual([
      'node',
      'hub/library/node',
    ]);
    expect(dependentsName(entries.slice(1, 2), 'hub', 'oci-mirror', 'library/node')).toBe('node');
    expect(dependentsName([], 'hub', 'oci-mirror', 'library/node')).toBe('node');
  });

  it('groups the dependents by the version they embed, each where it first appears', () => {
    const at = (embeddedVersion: string, artifactName: string): PackageDependent => ({
      embeddedVersion,
      artifactName,
    });
    const groups = byEmbeddedVersion([at('1.2.0', 'a'), at('1.3.0', 'b'), at('1.2.0', 'c')]);
    expect(groups.map((g) => [g.version, g.dependents.map((d) => d.artifactName)])).toEqual([
      ['1.2.0', ['a', 'c']],
      ['1.3.0', ['b']],
    ]);
  });

  it('addresses each artifact’s page in the store by its ecosystem', () => {
    expect(artifactPage({ artifactEcosystem: 'docker', artifactName: 'qits/svc' })).toEqual({
      kind: 'image',
      repo: 'qits',
      image: 'svc',
    });
    expect(artifactPage({ artifactEcosystem: 'npm', artifactName: '@qits/ui' })).toEqual({
      kind: 'npmPackage',
      repo: 'npm',
      package: '@qits/ui',
    });
    expect(artifactPage({ artifactEcosystem: 'maven', artifactName: 'g:a' })).toEqual({
      kind: 'mavenPackage',
      repo: 'maven',
      coordinate: 'g:a',
    });
    expect(artifactPage({ artifactEcosystem: 'daemon', artifactName: 'd' })).toEqual({
      kind: 'daemon',
      repo: 'daemons',
      daemon: 'd',
    });
    expect(artifactPage({ artifactEcosystem: 'other', artifactName: 'x' })).toBeUndefined();
  });
});
