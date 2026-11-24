import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { qitsResource } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { commands, page } from 'vitest/browser';
import { client as maintenanceClient } from '../../../api/maintenance/client.gen';
import { provideHeyApiClient } from '../../../api/maintenance/client/client.gen';
import { MAINTENANCE_ARTIFACT_VERSIONS } from '$core/maintenance/maintenance.operations';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { SbomStatus } from './sbom-status';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const SEVERAL = 'an artifact released in several versions';
const PINNING = 'manifests that pin artifacts';
const MAINTENANCE = 'qits-maintenance';
const STATUSES = '/maintenance/api/artifacts/versions';
const INGEST = '/maintenance/api/artifacts/ingest';

/** The artifact "an artifact released in several versions" recorded (its provider-state params). */
const ECOSYSTEM = 'maven';
const NAME = 'eu.wohlben.qits:contract-core';

/**
 * A version table as the package pages draw it, over qits-maintenance's versions read of one
 * artifact: each row its version and its status cell.
 */
@Component({
  imports: [SbomStatus],
  host: { class: 'block w-[40rem] p-4' },
  template: `
    <table class="w-full border-collapse text-left text-sm" aria-label="Versions">
      <tbody>
        @for (row of rows(); track row.version) {
          <tr class="border-b border-line-subtle align-top" [attr.data-version]="row.version">
            <td class="py-1.5 pr-3 font-mono font-medium whitespace-nowrap">{{ row.version }}</td>
            <td class="py-1.5 text-xs">
              <app-sbom-status
                [ecosystem]="ecosystem"
                [name]="name"
                [version]="row.version ?? ''"
                [status]="row"
                [source]="statuses"
                [(refused)]="refused"
              />
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
class VersionTable {
  protected readonly ecosystem = ECOSYSTEM;
  protected readonly name = NAME;
  readonly statuses = qitsResource(MAINTENANCE_ARTIFACT_VERSIONS, () => ({
    query: { ecosystem: ECOSYSTEM, name: NAME },
  }));
  protected readonly rows = computed(() =>
    this.statuses.hasValue() ? (this.statuses.value() ?? []) : [],
  );
  readonly refused = signal(false);
}

/**
 * Screenshots of the SBOM status cell (qits-2490) on qits-maintenance's recorded versions of one
 * artifact ("an artifact released in several versions": PENDING, INGESTED, FAILED with its reason,
 * MISSING with no repository), 40rem wide, light and dark (`statuses`). The package pages' own
 * browser specs cannot show a row maintenance knows: no recording of qits-artifacts and of
 * qits-maintenance names the same artifact, so the chips and Re-read SBOM are shot here.
 *
 * Its outcomes (epic qits-2000) are each reached once: Re-read SBOM (`reread-artifact-sbom`)
 * queued (the 202 recorded in "manifests that pin artifacts", then the versions read again as
 * recorded; `queued`) and failed (a 403, status only: the roles named, the action gone from every
 * row; `refused`).
 */
describe('SbomStatus (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(maintenanceClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Answers the versions read with the recording. */
  async function answerStatuses() {
    await settle();
    TestBed.tick();
    await settle();
    for (const request of http.match((r) => r.url.startsWith(STATUSES))) {
      request.flush(await goldenMaster(SEVERAL, 'listArtifactVersions', MAINTENANCE));
    }
    await settle();
  }

  /** The table over the recorded versions. */
  async function shown() {
    const fixture = TestBed.createComponent(VersionTable);
    fixture.detectChanges();
    await answerStatuses();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, locator: page.elementLocator(element) };
  }

  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('statuses', async () => {
    const { locator } = await shown();
    await expect.element(locator.getByText('Pending')).toBeVisible();
    await expect.element(locator.getByText('Ingested')).toBeVisible();
    await expect.element(locator.getByText('Missing')).toBeVisible();
    await expect
      .element(locator.getByText('the sbom answer is not a CycloneDX document'))
      .toBeVisible();
    expect(locator.getByRole('button', { name: /^Re-read the SBOM of / }).elements()).toHaveLength(
      4,
    );
    await commands.parkPointer();
    await expect.element(locator).toMatchScreenshot('statuses', { kind: 'DATA' });
  });

  it('reread-artifact-sbom queued: a re-read is queued and the versions read again', async () => {
    const { fixture, locator } = await shown();
    const button = locator.getByRole('button', { name: 'Re-read the SBOM of 2026.1020.1' });
    (button.element() as HTMLButtonElement).click();
    await settle();
    const request = http.expectOne(INGEST);
    expect(request.request.body).toEqual({
      ecosystem: ECOSYSTEM,
      name: NAME,
      version: '2026.1020.1',
    });
    request.flush(await goldenMaster(PINNING, 'ingestArtifactSbom', MAINTENANCE), {
      status: 202,
      statusText: 'Accepted',
    });
    await settle();
    // The versions, read again (the mutation's `affects`).
    await answerStatuses();
    fixture.detectChanges();
    await expect
      .element(locator.getByText('Re-read queued; Refresh shows how it went.'))
      .toBeVisible();
    expect(reached()).toEqual(['reread-artifact-sbom:queued']);
    await commands.parkPointer();
    await expect.element(locator).toMatchScreenshot('queued', { kind: 'DATA' });
    fixture.destroy();
  });

  it('reread-artifact-sbom failed: a re-read refused for the viewer’s roles', async () => {
    const { fixture, locator } = await shown();
    const button = locator.getByRole('button', { name: 'Re-read the SBOM of 2026.1104.1' });
    (button.element() as HTMLButtonElement).click();
    await settle();
    http.expectOne(INGEST).flush(null, { status: 403, statusText: 'Forbidden' });
    await settle();
    fixture.detectChanges();
    await expect
      .element(locator.getByRole('alert'))
      .toHaveTextContent(
        'Re-reading an SBOM needs qits:admin, qits:admin-agent, qits:desk-admin, qits:desk or qits:system.',
      );
    expect(locator.getByRole('button').elements()).toHaveLength(0);
    expect(reached()).toEqual(['reread-artifact-sbom:failed']);
    await commands.parkPointer();
    await expect.element(locator).toMatchScreenshot('refused', { kind: 'ERROR' });
  });
});
