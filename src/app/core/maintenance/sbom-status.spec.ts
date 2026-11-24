import { QitsApiError, QitsOfflineError } from '@qits/angular';
import { maintenanceGoldenMaster } from '../../../testing/golden-masters';
import type { ArtifactVersionStatus } from './maintenance.consumes';
import { MAINTENANCE_INGEST_SBOM } from './maintenance.operations';
import {
  explainReread,
  isRoleRefusal,
  sbomStatusLabel,
  sbomStatusTone,
  statusesByVersion,
} from './sbom-status';

const SEVERAL = 'an artifact released in several versions';

/** A refusal as a failed mutation throws it. */
const refusal = (status: number, message?: string) =>
  new QitsApiError(status, message ? { message } : undefined, MAINTENANCE_INGEST_SBOM);

describe('sbom-status', () => {
  it('keys maintenance’s recorded versions by version, the first of a version kept', () => {
    const rows = maintenanceGoldenMaster<ArtifactVersionStatus[]>(SEVERAL, 'listArtifactVersions');
    const index = statusesByVersion(rows);
    expect([...index.keys()]).toEqual(rows.map((row) => row.version));
    expect(index.get('2026.1020.1')?.sbomStatus).toBe('FAILED');
    // A row without a version is left out; a repeated version keeps the first.
    const repeated = statusesByVersion([
      ...rows,
      { version: rows[0].version, sbomStatus: 'X' },
      {},
    ]);
    expect(repeated.size).toBe(rows.length);
    expect(repeated.get(rows[0].version!)?.sbomStatus).toBe(rows[0].sbomStatus);
    expect(statusesByVersion(undefined).size).toBe(0);
  });

  it('says each status as a chip, coloured by how it stands', () => {
    expect(['PENDING', 'INGESTED', 'MISSING', 'FAILED'].map(sbomStatusLabel)).toEqual([
      'Pending',
      'Ingested',
      'Missing',
      'Failed',
    ]);
    expect(['PENDING', 'INGESTED', 'MISSING', 'FAILED'].map(sbomStatusTone)).toEqual([
      'waiting',
      'ok',
      'neutral',
      'failed',
    ]);
    expect(sbomStatusLabel('SOMETHING')).toBe('SOMETHING');
    expect(sbomStatusLabel(undefined)).toBe('unknown');
    expect(sbomStatusTone(null)).toBe('neutral');
  });

  it('says what a re-read that was not queued came to', () => {
    expect(isRoleRefusal(refusal(403))).toBe(true);
    expect(isRoleRefusal(refusal(400))).toBe(false);
    expect(isRoleRefusal(new Error('network'))).toBe(false);
    expect(explainReread(refusal(403))).toBe(
      'Re-reading an SBOM needs qits:admin, qits:admin-agent, qits:desk-admin, qits:desk or qits:system.',
    );
    expect(explainReread(refusal(400, 'an ingest names both a name and a version'))).toBe(
      'Not re-read: 400 an ingest names both a name and a version.',
    );
    expect(explainReread(refusal(502))).toBe('The SBOM could not be re-read (502).');
    expect(explainReread(new Error('network'))).toBe(
      'The SBOM could not be re-read (the service is unreachable).',
    );
    expect(explainReread(new QitsOfflineError('offline'))).toBe(
      'Not sent: this browser is offline, and a re-read is never queued.',
    );
  });
});
