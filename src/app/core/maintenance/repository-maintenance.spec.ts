import { goldenMaster, maintenanceGoldenMaster } from '../../../testing/golden-masters';
import type { RepositoryReleaseRequest } from '$core/release-requests/repository-release-requests.consumes';
import {
  adoptionSummary,
  artifactGroups,
  namesRepository,
  releasedVersions,
  repositoryStatusTone,
} from './repository-maintenance';

describe('a repository’s maintenance helpers', () => {
  it('rates each dependent against its artifact’s latest, behind first', () => {
    const [group] = artifactGroups(
      maintenanceGoldenMaster('a repository with pins and bumps', 'listRepositoryDependents'),
    );
    expect(group.rows.map((row) => [row.repository, row.currency])).toEqual([
      ['contract-daemon', 'behind'],
      ['contract-service', 'current'],
    ]);
  });

  it('takes an event naming the repository, or naming none by name; not another', () => {
    const event = (payload: object) => ({ name: 'SCMRelease', payload: JSON.stringify(payload) });
    expect(namesRepository(event({ repository: 'a' }), 'a')).toBe(true);
    expect(namesRepository(event({ repositoryName: 'a' }), 'a')).toBe(true);
    expect(namesRepository(event({ repository: 'b' }), 'a')).toBe(false);
    expect(namesRepository(event({ releaseRequestId: 'r' }), 'a')).toBe(true);
    expect(namesRepository({ name: 'BuildSuccessful' }, 'a')).toBe(true);
  });

  it('gives OK an ok chip and any other status a neutral one', () => {
    expect(repositoryStatusTone('OK')).toBe('ok');
    expect(repositoryStatusTone('ABSENT')).toBe('neutral');
    expect(repositoryStatusTone('SOMETHING_NEW')).toBe('neutral');
  });

  it('keeps the released and finalized requests with a version, newest first', () => {
    const { requests } = goldenMaster(
      'a repository with a release not merged to main',
      'listRepositoryReleaseRequests',
    );
    expect(releasedVersions(requests).map((r) => r.version)).toEqual([
      '2026.101.100400',
      '2026.101.100100',
    ]);
  });

  it('lists at most ten releases, and none without a version', () => {
    const requests: RepositoryReleaseRequest[] = [
      { state: 'RELEASED' },
      ...Array.from({ length: 12 }, (_, i) => ({ state: 'FINALIZED', version: `v${i}` })),
    ];
    const kept = releasedVersions(requests);
    expect(kept).toHaveLength(10);
    expect(kept[0].version).toBe('v0');
  });

  it('counts the downstream repositories carrying the release', () => {
    const { adopters } = maintenanceGoldenMaster(
      'a release some consumers adopted',
      'getAdoptionByRelease',
    );
    const adopted = adopters.filter((a: { state: string }) => a.state === 'ADOPTED').length;
    expect(adoptionSummary(adopters, '2026.1.1')).toBe(
      `${adopted} of ${adopters.length} downstream carry 2026.1.1`,
    );
    expect(adoptionSummary([], '2026.1.1')).toBe('Nothing is downstream of 2026.1.1.');
  });
});
