import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input, PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as maintenanceClient } from '../../../api/maintenance/client.gen';
import { provideHeyApiClient } from '../../../api/maintenance/client/client.gen';
import type { ArtifactVersionStatus } from '$core/maintenance/maintenance.consumes';
import { MAINTENANCE_ARTIFACT_VERSIONS } from '$core/maintenance/maintenance.operations';
import { maintenanceGoldenMaster } from '../../../../testing/golden-masters';
import { SbomStatus } from './sbom-status';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const SEVERAL = 'an artifact released in several versions';
const PINNING = 'manifests that pin artifacts';
const INGEST = '/maintenance/api/artifacts/ingest';

/** The artifact "an artifact released in several versions" recorded (its provider-state params). */
const ARTIFACT = { ecosystem: 'maven', name: 'eu.wohlben.qits:contract-core' };

/** The page's read, as the cell sees it: its operation and a `reload` the spec counts. */
const source = { operation: MAINTENANCE_ARTIFACT_VERSIONS, reload: vi.fn() };

/** A version table of maintenance's rows, each through the cell, sharing one `refused`. */
@Component({
  imports: [SbomStatus],
  template: `
    <table>
      <tbody>
        @for (row of rows(); track row.version) {
          <tr [attr.data-version]="row.version">
            <td>
              <app-sbom-status
                [ecosystem]="ecosystem"
                [name]="name"
                [version]="row.version ?? ''"
                [status]="known() ? row : undefined"
                [source]="source"
                [(refused)]="refused"
              />
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
class Table {
  readonly rows = input.required<readonly ArtifactVersionStatus[]>();
  readonly known = input(true);
  protected readonly ecosystem = ARTIFACT.ecosystem;
  protected readonly name = ARTIFACT.name;
  protected readonly source = source;
  readonly refused = signal(false);
}

/**
 * The SBOM status cell (qits-2490) on qits-maintenance's recorded versions ("an artifact released
 * in several versions": PENDING, INGESTED, FAILED with its reason, MISSING): each chip, a FAILED
 * read's reason, Re-read SBOM's request and what each answer comes to (the 202 recorded in
 * "manifests that pin artifacts"; a 403, a 500 as statuses only), and a version maintenance does
 * not know. Its screenshots are its browser spec's.
 */
describe('SbomStatus', () => {
  let http: HttpTestingController;
  const rows = maintenanceGoldenMaster<ArtifactVersionStatus[]>(SEVERAL, 'listArtifactVersions');

  beforeEach(() => {
    source.reload.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(maintenanceClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function shown(known = true) {
    const fixture = TestBed.createComponent(Table);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('known', known);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const row = (version: string) =>
      element.querySelector<HTMLElement>(`[data-version="${version}"]`)!;
    const button = (version: string) =>
      row(version).querySelector<HTMLButtonElement>(
        `button[aria-label="Re-read the SBOM of ${version}"]`,
      );
    return { fixture, element, row, button };
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('shows each version’s status as a chip, a failed read’s reason under it', () => {
    const { row, element } = shown();
    expect(rows.map((r) => text(row(r.version!).querySelector('ui-chip')))).toEqual([
      'Pending',
      'Ingested',
      'Failed',
      'Missing',
    ]);
    const failed = row('2026.1020.1');
    expect(text(failed.querySelector('[data-sbom-error]'))).toBe(
      'the sbom answer is not a CycloneDX document',
    );
    expect(failed.querySelector('ui-chip')?.getAttribute('title')).toBe(
      'the sbom answer is not a CycloneDX document',
    );
    expect(row('2026.1101.2').querySelector('ui-chip')?.getAttribute('title')).toMatch(
      /^Ingested /,
    );
    expect(row('2026.1104.1').querySelector('ui-chip')?.hasAttribute('title')).toBe(false);
    expect(element.querySelectorAll('[data-sbom-error]')).toHaveLength(1);
    expect(element.querySelectorAll('button')).toHaveLength(rows.length);
  });

  it('shows nothing for a version maintenance does not know', () => {
    const { element } = shown(false);
    expect(element.querySelectorAll('[data-sbom-status]')).toHaveLength(0);
    expect(element.querySelectorAll('button')).toHaveLength(0);
  });

  it('re-reads a version’s SBOM, then reads the versions again', async () => {
    const { fixture, row, button } = shown();
    button('2026.1020.1')!.click();
    fixture.detectChanges();
    expect(text(button('2026.1020.1'))).toBe('Re-reading…');
    expect(button('2026.1020.1')!.disabled).toBe(true);
    await settle();
    const request = http.expectOne(INGEST);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ ...ARTIFACT, version: '2026.1020.1' });
    request.flush(maintenanceGoldenMaster(PINNING, 'ingestArtifactSbom'), {
      status: 202,
      statusText: 'Accepted',
    });
    await settle();
    fixture.detectChanges();
    expect(text(row('2026.1020.1').querySelector('[data-reread-queued]'))).toBe(
      'Re-read queued; Refresh shows how it went.',
    );
    expect(text(button('2026.1020.1'))).toBe('Re-read SBOM');
    expect(source.reload).toHaveBeenCalledTimes(1);
  });

  it('takes Re-read SBOM off every row when a re-read is refused for the viewer’s roles', async () => {
    const { fixture, element, row, button } = shown();
    button('2026.1104.1')!.click();
    await settle();
    http.expectOne(INGEST).flush(null, { status: 403, statusText: 'Forbidden' });
    await settle();
    fixture.detectChanges();
    expect(fixture.componentInstance.refused()).toBe(true);
    expect(element.querySelectorAll('button')).toHaveLength(0);
    expect(text(row('2026.1104.1').querySelector('[role="alert"]'))).toBe(
      'Re-reading an SBOM needs qits:admin, qits:admin-agent, qits:desk-admin, qits:desk or qits:system.',
    );
    // The chips stay.
    expect(element.querySelectorAll('ui-chip')).toHaveLength(rows.length);
    expect(source.reload).not.toHaveBeenCalled();
  });

  it('says on its row that a re-read failed, and keeps the button', async () => {
    const { fixture, row, button } = shown();
    button('2026.1001.1')!.click();
    await settle();
    http.expectOne(INGEST).flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    fixture.detectChanges();
    expect(text(row('2026.1001.1').querySelector('[data-reread-failed]'))).toBe(
      'The SBOM could not be re-read (500).',
    );
    expect(button('2026.1001.1')).not.toBeNull();
    expect(button('2026.1104.1')).not.toBeNull();
    expect(fixture.componentInstance.refused()).toBe(false);
    expect(source.reload).not.toHaveBeenCalled();
  });
});
