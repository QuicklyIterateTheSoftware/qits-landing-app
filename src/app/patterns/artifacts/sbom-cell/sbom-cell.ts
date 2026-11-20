import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  PLATFORM_ID,
} from '@angular/core';
import {
  QitsEntity,
  QitsField,
  QitsTriggers,
  type QitsResourceRef,
  type StayOutcome,
} from '@qits/angular';
import { formatBytes } from '$core/artifacts/artifact-listings';
import type { ArtifactSbomVersion } from '$core/artifacts/artifacts.consumes';
import { fetchSbomFile, saveFile } from '$core/artifacts/sbom-download';

/** Where a download stands: none asked, on its way, or failed (a saved one goes back to idle). */
type Download = 'idle' | 'downloading' | 'failed';

/**
 * One version's SBOM, in a package page's version table (qits-2325; the maven package page now,
 * the npm package page with qits-2326, so it knows no package type): "CycloneDX <specVersion> ·
 * <size>" and a **Download** button when the version has one (`sbom`), "—" when it has none,
 * "unknown" when the page's SBOM list could not be read (`unknown`).
 *
 * Download reads the document through the app's client (`fetchSbomFile`: the store wants the
 * bearer, so a bare link cannot) and saves it as `<artifactId>-<version>.cdx.json`, in the browser
 * only. A failed read says so on this row, and the button offers it again. The page declares the
 * interaction and hands its two stays in (`saved`, `failed`), so each page names its own.
 *
 * Marks (qits-2141): the SBOM is a join, an entry of the page's SBOM list (`source`) by `version`
 * inside the version's row; its line is derived from `specVersion` and `sizeBytes`.
 */
@Component({
  selector: 'app-sbom-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsEntity, QitsField, QitsTriggers],
  host: { class: 'block' },
  template: `
    @if (sbom(); as sbom) {
      <span
        class="flex flex-wrap items-center gap-x-2 gap-y-1"
        [qitsEntity]="sbom"
        entityKey="version"
        [entitySource]="source()"
        data-sbom
      >
        <span class="whitespace-nowrap text-fg-soft" [fieldOf]="sbom" [qitsField]="marks.line">{{
          line(sbom)
        }}</span>
        <button
          type="button"
          class="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft hover:bg-surface-muted disabled:opacity-60"
          [attr.aria-label]="'Download the SBOM of ' + version()"
          [disabled]="download() === 'downloading'"
          [qitsTriggers]="[saved(), failed()]"
          (click)="save()"
        >
          {{ download() === 'downloading' ? 'Downloading…' : 'Download' }}
        </button>
      </span>
      @if (download() === 'failed') {
        <span role="alert" class="mt-1 block text-xs text-danger-strong" data-sbom-failed>
          The SBOM could not be downloaded.
        </span>
      }
    } @else if (unknown()) {
      <span class="text-fg-muted italic">unknown</span>
    } @else {
      <span class="text-fg-muted">—</span>
    }
  `,
})
export class SbomCell {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);

  /** The package's type in the SBOM store (`maven`, `npm`). */
  readonly packageType = input.required<string>();
  /** The package's name as the SBOM store keys it (`groupId:artifactId`, `@scope/name`). */
  readonly packageName = input.required<string>();
  /** The release version of this row. */
  readonly version = input.required<string>();
  /** This version's SBOM, from the page's list; undefined when it has none. */
  readonly sbom = input<ArtifactSbomVersion | undefined>();
  /** The page's SBOM list, the read this cell's SBOM joins from. */
  readonly source = input.required<Pick<QitsResourceRef<unknown>, 'operation'>>();
  /** The SBOM list could not be read: whether this version has one is unknown. */
  readonly unknown = input(false);
  /** The page's stay for a saved download. */
  readonly saved = input.required<StayOutcome>();
  /** The page's stay for a failed download. */
  readonly failed = input.required<StayOutcome>();

  /** This row's download; back to idle when the row shows another version. */
  protected readonly download = linkedSignal<string, Download>({
    source: () => `${this.packageType()}/${this.packageName()}/${this.version()}`,
    computation: () => 'idle',
  });

  protected readonly marks = MARKS;

  protected readonly busy = computed(() => this.download() === 'downloading');

  /** `CycloneDX 1.6 · 909 B`. */
  protected line(sbom: ArtifactSbomVersion): string {
    return `CycloneDX ${sbom.specVersion ?? '?'} · ${formatBytes(sbom.sizeBytes)}`;
  }

  /** Reads the document and saves it; a failure stays on the row. Browser only. */
  protected async save(): Promise<void> {
    if (!this.browser || this.busy()) return;
    this.download.set('downloading');
    const file = await fetchSbomFile(this.packageType(), this.packageName(), this.version());
    if (!file) {
      this.download.set('failed');
      this.failed().reach();
      return;
    }
    saveFile(file, this.document);
    this.download.set('idle');
    this.saved().reach();
  }
}

/** The data marks of what the cell derives from the SBOM (a class constant, as the rule reads). */
const MARKS = {
  line: { derived: ['specVersion', 'sizeBytes'] },
} as const;
