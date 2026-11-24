import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  linkedSignal,
  model,
  PLATFORM_ID,
} from '@angular/core';
import {
  outcomes,
  QitsEntity,
  QitsField,
  qitsMutation,
  QitsTriggers,
  stay,
  type QitsResourceRef,
} from '@qits/angular';
import type { ArtifactVersionStatus } from '$core/maintenance/maintenance.consumes';
import { MAINTENANCE_INGEST_SBOM } from '$core/maintenance/maintenance.operations';
import {
  explainReread,
  isRoleRefusal,
  sbomStatusLabel,
  sbomStatusTone,
} from '$core/maintenance/sbom-status';
import { formatInstant } from '$core/release-requests/release-request-model';
import { Chip } from '$ui/components/chip/chip';

/** Where this row's re-read stands: none asked, on its way, queued (202), or not sent. */
type Reread = 'idle' | 'sending' | 'queued' | 'failed';

/**
 * One version's SBOM status as qits-maintenance holds it (qits-2490), in a package page's version
 * table (the npm and the maven package page, so it knows no package type): a chip (Pending,
 * Ingested, Missing, Failed; a FAILED read's `sbomError` under it and in its `title`, an INGESTED
 * one's `ingestedAt` in its `title`) and **Re-read SBOM**, which asks maintenance to read the
 * version's SBOM again now (`ingestArtifactSbom` `{ ecosystem, name, version }` through
 * `qitsMutation`, `online-only`: a re-read is never queued offline or sent again by itself). A
 * version maintenance does not know (`status` undefined) shows nothing at all: no chip, no action.
 *
 * After the 202 the row says the re-read was queued and the page's versions read (`source`) is read
 * again (the mutation's `affects`), which shows the version PENDING; no event says when
 * maintenance's worker has read it, and nothing polls (qits-1270): Refresh shows how it went. A 403 says which roles may and sets `refused`, which the page binds two-way for every row,
 * so the action is gone from the whole table; any other failure is said on this row and the button
 * stays. The cell declares the interaction itself (`reread-artifact-sbom`, app-wide like any
 * pattern's), one for both pages: the browser specs of the pages cannot show a row maintenance
 * knows (no recording of the two providers names the same artifact), its own can.
 *
 * Marks (qits-2141): the status is a join, an entry of the page's versions read (`source`) by
 * `version` inside the version's row; the chip is derived from `sbomStatus`, the line under it is
 * `sbomError`.
 */
@Component({
  selector: 'app-sbom-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, QitsEntity, QitsField, QitsTriggers],
  host: { class: 'block' },
  template: `
    @if (status(); as status) {
      <div [qitsEntity]="status" entityKey="version" [entitySource]="source()" data-sbom-status>
        <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ui-chip
            [label]="label(status.sbomStatus)"
            [tone]="tone(status.sbomStatus)"
            [attr.title]="title(status)"
            [fieldOf]="status"
            [qitsField]="marks.status"
          />
          @if (!refused()) {
            <button
              type="button"
              class="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold whitespace-nowrap text-fg-soft hover:bg-surface-muted disabled:opacity-60"
              [attr.aria-label]="'Re-read the SBOM of ' + version()"
              [disabled]="reread() === 'sending'"
              [qitsTriggers]="[rereading.queued, rereading.failed]"
              (click)="send()"
            >
              {{ reread() === 'sending' ? 'Re-reading…' : 'Re-read SBOM' }}
            </button>
          }
        </span>
        @if (status.sbomError) {
          <span
            class="mt-1 block text-xs wrap-anywhere text-danger-strong"
            [fieldOf]="status"
            qitsField="sbomError"
            data-sbom-error
            >{{ status.sbomError }}</span
          >
        }
        @if (reread() === 'queued') {
          <span role="status" class="mt-1 block text-xs text-fg-muted" data-reread-queued>
            Re-read queued; Refresh shows how it went.
          </span>
        } @else if (reread() === 'failed') {
          <span role="alert" class="mt-1 block text-xs text-danger-strong" data-reread-failed>
            {{ note() }}
          </span>
        }
      </div>
    }
  `,
})
export class SbomStatus {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The artifact's ecosystem as maintenance keys it (`maven`, `npm`). */
  readonly ecosystem = input.required<string>();
  /** The artifact's name in `mt_pin` spelling (`groupId:artifactId`, `@scope/name`). */
  readonly name = input.required<string>();
  /** The release version of this row. */
  readonly version = input.required<string>();
  /** This version's row in maintenance's versions read; undefined when maintenance has none. */
  readonly status = input<ArtifactVersionStatus | undefined>();
  /** The page's versions read: the join's source, and what a re-read reads again. */
  readonly source = input.required<Pick<QitsResourceRef<unknown>, 'operation' | 'reload'>>();
  /** A re-read was refused for the viewer's roles (403): the action is gone from every row. */
  readonly refused = model(false);

  /** A re-read queued (202), or not: the page stays either way. */
  protected readonly rereading = outcomes('reread-artifact-sbom', {
    queued: stay(),
    failed: stay(),
  });

  /** This row's re-read; back to idle when the row shows another version. */
  protected readonly reread = linkedSignal<string, Reread>({
    source: () => `${this.ecosystem()}/${this.name()}/${this.version()}`,
    computation: () => 'idle',
  });

  /** What the failed re-read came to. */
  protected readonly note = linkedSignal<string, string>({
    source: () => `${this.ecosystem()}/${this.name()}/${this.version()}`,
    computation: () => '',
  });

  protected readonly marks = MARKS;
  protected readonly label = sbomStatusLabel;
  protected readonly tone = sbomStatusTone;

  /**
   * The re-read: sent now or not at all, never kept in an outbox. Its 202 reads the page's versions
   * again (`affects`): the version is PENDING again until maintenance's worker has read it.
   */
  private readonly ingesting = qitsMutation(MAINTENANCE_INGEST_SBOM, {
    offline: 'online-only',
    affects: () => [this.source()],
  });

  /** The chip's title: a FAILED read's reason, an INGESTED one's instant; none otherwise. */
  protected title(status: ArtifactVersionStatus): string | null {
    if (status.sbomError) return status.sbomError;
    if (status.sbomStatus === 'INGESTED' && status.ingestedAt) {
      return `Ingested ${formatInstant(status.ingestedAt)}`;
    }
    return null;
  }

  /**
   * Asks maintenance to read this version's SBOM again. A 202 reads the versions again (the
   * mutation's `affects`); a refusal is said on the row (a 403 for every row).
   */
  protected async send(): Promise<void> {
    if (!this.browser || this.reread() === 'sending') return;
    this.reread.set('sending');
    try {
      await this.ingesting.run({
        body: { ecosystem: this.ecosystem(), name: this.name(), version: this.version() },
      });
      this.reread.set('queued');
      this.rereading.queued.reach();
    } catch (error) {
      this.note.set(explainReread(error));
      this.reread.set('failed');
      if (isRoleRefusal(error)) this.refused.set(true);
      this.rereading.failed.reach();
    }
  }
}

/** The data marks of what the cell derives (a class constant, as the rule reads). */
const MARKS = {
  status: { derived: ['sbomStatus', 'ingestedAt', 'sbomError'] },
} as const;
