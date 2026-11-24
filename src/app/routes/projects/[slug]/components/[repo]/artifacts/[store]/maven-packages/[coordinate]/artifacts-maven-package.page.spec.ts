import type { HttpTestingController } from '@angular/common/http/testing';
import { client as artifactsClient } from '../../../../../../../../../api/artifacts/client.gen';
import { provideHeyApiClient as provideArtifactsClient } from '../../../../../../../../../api/artifacts/client/client.gen';
import { client as maintenanceClient } from '../../../../../../../../../api/maintenance/client.gen';
import { provideHeyApiClient as provideMaintenanceClient } from '../../../../../../../../../api/maintenance/client/client.gen';
import type { ComponentFixture } from '@angular/core/testing';
import {
  artifactsGoldenMaster,
  configurePackagePage,
  created,
  INGEST,
  settle,
  STATUSES,
  statusesUnder,
  text,
  ticked,
} from '../../../../../../../../../../testing/package-page-statuses';
import { ArtifactsMavenPackagePage } from './artifacts-maven-package.page';

const SBOMMED = 'a maven coordinate with an sbom on one of two versions';
const REPO = 'maven';
const COORDINATE = 'eu.wohlben.qits:contract-maven';

/**
 * The maven package page's SBOM status column (qits-2490) on derived answers: the coordinate's
 * versions and SBOMs as qits-artifacts recorded them ("a maven coordinate with an sbom on one of two
 * versions": 2100.2.0 and 2100.1.0), and qits-maintenance's recorded versions ("an artifact
 * released in several versions") with its FAILED row put under 2100.2.0 and its INGESTED row
 * under 2100.1.0 (`statusesUnder`: the two providers record unrelated artifacts), its PENDING and
 * MISSING rows left on versions the store does not hold. Also maintenance knowing none of them,
 * its read refused (403: no column) or failed (500: a Retry), and Re-read SBOM refused for the
 * viewer's roles. The page's other states are its browser spec's.
 */
describe('ArtifactsMavenPackagePage: maintenance’s SBOM status', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    http = configurePackagePage(
      {
        slug: 'qits',
        repo: 'contract-service',
        store: REPO,
        coordinate: COORDINATE,
      },
      [provideArtifactsClient(artifactsClient), provideMaintenanceClient(maintenanceClient)],
    );
  });

  afterEach(() => http.verify());

  /** The page, the store's two reads answered as recorded and maintenance's by `statuses`. */
  async function shown(
    statuses: (request: ReturnType<HttpTestingController['expectOne']>) => void,
  ): Promise<ComponentFixture<ArtifactsMavenPackagePage>> {
    const fixture = await created(ArtifactsMavenPackagePage);
    const encoded = encodeURIComponent(COORDINATE);
    http
      .expectOne(`/artifacts/api/repositories/${REPO}/maven-packages/${encoded}/versions`)
      .flush(artifactsGoldenMaster(SBOMMED, 'listMavenVersionSummaries'));
    http
      .expectOne(`/artifacts/sboms/maven/${encoded}`)
      .flush(artifactsGoldenMaster(SBOMMED, 'listSbomVersions'));
    const read = http.expectOne((r) => r.url.startsWith(STATUSES));
    const query = new URL(read.request.urlWithParams, 'http://x').searchParams;
    expect(query.get('ecosystem')).toBe('maven');
    expect(query.get('name')).toBe(COORDINATE);
    statuses(read);
    await ticked();
    fixture.detectChanges();
    return fixture;
  }

  const rows = (element: HTMLElement) =>
    [...element.querySelectorAll('table[aria-label="Versions"] tbody tr')] as HTMLElement[];
  const headers = (element: HTMLElement) =>
    [...element.querySelectorAll('table[aria-label="Versions"] th')].map((th) => text(th));

  it('shows maintenance’s status beside each version it knows, a failed read’s reason too', async () => {
    const element = (await shown((r) => r.flush(statusesUnder({ '2100.2.0': 2, '2100.1.0': 1 }))))
      .nativeElement as HTMLElement;
    expect(headers(element)).toContain('SBOM status');
    const [newer, older] = rows(element);
    expect(text(newer.querySelector('ui-chip'))).toBe('Failed');
    expect(text(newer.querySelector('[data-sbom-error]'))).toBe(
      'the sbom answer is not a CycloneDX document',
    );
    expect(text(older.querySelector('ui-chip'))).toBe('Ingested');
    expect(newer.querySelector('button[aria-label="Re-read the SBOM of 2100.2.0"]')).not.toBeNull();
    expect(element.querySelector('[data-statuses-unknown]')).toBeNull();
  });

  it('shows no chip and no action for a version maintenance does not know', async () => {
    const element = (await shown((r) => r.flush([]))).nativeElement as HTMLElement;
    expect(headers(element)).toContain('SBOM status');
    expect(element.querySelectorAll('[data-sbom-status]')).toHaveLength(0);
    expect(element.querySelectorAll('button[aria-label^="Re-read"]')).toHaveLength(0);
  });

  it('leaves the column out when the viewer may not read maintenance’s statuses', async () => {
    const element = (await shown((r) => r.flush(null, { status: 403, statusText: 'Forbidden' })))
      .nativeElement as HTMLElement;
    expect(headers(element)).not.toContain('SBOM status');
    expect(rows(element)).toHaveLength(2);
    expect(element.querySelector('[data-statuses-unknown]')).toBeNull();
  });

  it('says maintenance’s statuses could not be read, keeps the versions, and retries', async () => {
    const fixture = await shown((r) => r.flush(null, { status: 500, statusText: 'Server Error' }));
    const element = fixture.nativeElement as HTMLElement;
    expect(rows(element)).toHaveLength(2);
    expect(text(element.querySelector('[data-statuses-unknown]'))).toContain(
      'Maintenance’s SBOM statuses could not be read',
    );
    element.querySelector<HTMLButtonElement>('[aria-label="Retry the SBOM statuses"]')!.click();
    await ticked();
    http
      .expectOne((r) => r.url.startsWith(STATUSES))
      .flush(statusesUnder({ '2100.2.0': 2, '2100.1.0': 1 }));
    await ticked();
    fixture.detectChanges();
    expect(element.querySelector('[data-statuses-unknown]')).toBeNull();
    expect(element.querySelectorAll('[data-sbom-status]')).toHaveLength(2);
  });

  it('re-reads a version’s SBOM with maintenance’s name for it, and reads the statuses again', async () => {
    const fixture = await shown((r) => r.flush(statusesUnder({ '2100.2.0': 2, '2100.1.0': 1 })));
    const element = fixture.nativeElement as HTMLElement;
    element
      .querySelector<HTMLButtonElement>('[aria-label="Re-read the SBOM of 2100.2.0"]')!
      .click();
    await settle();
    const ingest = http.expectOne(INGEST);
    expect(ingest.request.body).toEqual({
      ecosystem: 'maven',
      name: COORDINATE,
      version: '2100.2.0',
    });
    ingest.flush(
      { id: '00000000-0000-4000-8000-000000000001' },
      { status: 202, statusText: 'Accepted' },
    );
    await ticked();
    http
      .expectOne((r) => r.url.startsWith(STATUSES))
      .flush(statusesUnder({ '2100.2.0': 0, '2100.1.0': 1 }));
    await ticked();
    fixture.detectChanges();
    expect(text(rows(element)[0].querySelector('ui-chip'))).toBe('Pending');
    fixture.destroy();
  });

  it('takes Re-read SBOM off every row when one is refused for the viewer’s roles', async () => {
    const fixture = await shown((r) => r.flush(statusesUnder({ '2100.2.0': 2, '2100.1.0': 1 })));
    const element = fixture.nativeElement as HTMLElement;
    element
      .querySelector<HTMLButtonElement>('[aria-label="Re-read the SBOM of 2100.1.0"]')!
      .click();
    await settle();
    http.expectOne(INGEST).flush(null, { status: 403, statusText: 'Forbidden' });
    await ticked();
    fixture.detectChanges();
    expect(element.querySelectorAll('button[aria-label^="Re-read"]')).toHaveLength(0);
    expect(text(rows(element)[1].querySelector('[role="alert"]'))).toContain(
      'Re-reading an SBOM needs',
    );
  });
});
