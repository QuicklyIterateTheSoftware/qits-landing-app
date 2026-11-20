import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { QitsEntity, QitsField, type QitsResourceRef } from '@qits/angular';
import { formatBytes, plural } from '$core/artifacts/artifact-listings';
import type { CleanupReceipt } from '$core/artifacts/cleanup.consumes';
import { formatInstant } from '$core/release-requests/release-request-model';

/**
 * A sweep's receipt (qits-2329), as the cleanup page shows it in the plan's place: when the run
 * ran; an aborted run's reason (nothing was deleted); else what it deleted, unlinked and reclaimed,
 * what the grace window withheld whole and why, what was refused at the unlink, and a type's
 * error. `source` is the sweep the receipt answered (`ARTIFACTS_CLEANUP_SWEEP`'s `qitsMutation`),
 * which the receipt's mark names.
 */
@Component({
  selector: 'app-cleanup-receipt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsEntity, QitsField],
  host: { class: 'block' },
  template: `
    @let receipt = this.receipt();
    <div [qitsEntity]="receipt" entityKey="repository" [entitySource]="source()">
      <p class="mt-0 mb-3 text-sm text-fg-soft" [fieldOf]="receipt" [qitsField]="marks.executedAt">
        Run at {{ instant(receipt.executedAt) }}.
      </p>
      @if (receipt.aborted) {
        <p
          role="alert"
          class="mt-0 mb-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-fg"
          [fieldOf]="receipt"
          qitsField="aborted"
          data-aborted
        >
          The run was aborted and nothing was deleted: {{ receipt.aborted }}. A run reads its live
          pins before it takes a census, and a source that cannot answer ends it there.
        </p>
      } @else {
        <p
          class="mt-0 mb-2 text-sm text-fg"
          [fieldOf]="receipt"
          [qitsField]="marks.receiptFigures"
          data-receipt-figures
        >
          {{ receiptFigures(receipt) }}
        </p>
        <ul class="mt-0 mb-3 pl-5 text-sm text-fg-soft" data-counters>
          @if (receipt.sweep?.withheldByGraceWindow) {
            <li [fieldOf]="receipt" [qitsField]="marks.receiptWithheld">
              {{ receiptWithheld(receipt) }}
            </li>
          }
          @if (receipt.sweep?.stillReferenced) {
            <li [fieldOf]="receipt" qitsField="sweep.stillReferenced">
              {{ receipt.sweep?.stillReferenced }} refused at the unlink because something still
              named them: the mechanism working, not a failure.
            </li>
          }
          @if (receipt.sweep?.alreadyGone) {
            <li [fieldOf]="receipt" qitsField="sweep.alreadyGone">
              {{ receipt.sweep?.alreadyGone }} had no file left to unlink.
            </li>
          }
        </ul>
        @if (receipt.error) {
          <p
            role="alert"
            class="mt-0 mb-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-fg"
            [fieldOf]="receipt"
            qitsField="error"
          >
            {{ receipt.error }}
          </p>
        }
        @if ((receipt.deleted ?? []).length) {
          <h3 class="mt-0 mb-1 text-sm font-semibold">Deleted</h3>
          <ul class="mt-0 mb-3 pl-5 text-sm" aria-label="Deleted">
            @for (identity of receipt.deleted; track identity.identity) {
              <li [qitsEntity]="identity" entityKey="identity">
                <span class="font-mono" [fieldOf]="identity" qitsField="identity">{{
                  identity.identity
                }}</span>
                —
                <span class="text-fg-soft" [fieldOf]="identity" qitsField="rule">{{
                  identity.rule
                }}</span>
              </li>
            }
          </ul>
        }
        @if ((receipt.withheldByGraceWindow ?? []).length) {
          <h3 class="mt-0 mb-1 text-sm font-semibold">Withheld whole, rows intact</h3>
          <ul class="mt-0 mb-3 pl-5 text-sm" aria-label="Withheld">
            @for (identity of receipt.withheldByGraceWindow; track identity.identity) {
              <li [qitsEntity]="identity" entityKey="identity">
                <span class="font-mono" [fieldOf]="identity" qitsField="identity">{{
                  identity.identity
                }}</span>
                —
                <span class="text-fg-soft" [fieldOf]="identity" qitsField="rule">{{
                  identity.rule
                }}</span>
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
})
export class CleanupReceiptComponent {
  /** The receipt the sweep answered. */
  readonly receipt = input.required<CleanupReceipt>();
  /** The sweep that answered it. */
  readonly source = input.required<Pick<QitsResourceRef<unknown>, 'operation'>>();

  protected readonly marks = MARKS;

  /** `1 identity`, `2 identities`. */
  protected identities(count: number | undefined): string {
    return count === 1 ? '1 identity' : `${count ?? 0} identities`;
  }

  protected instant(iso: string | undefined): string {
    return formatInstant(iso);
  }

  /** `0 identities deleted, 0 blob files unlinked, 0 B reclaimed.` */
  protected receiptFigures(receipt: CleanupReceipt): string {
    return (
      `${this.identities(receipt.deleted?.length)} deleted, ` +
      `${plural(receipt.sweep?.blobsUnlinked, 'blob file')} unlinked, ` +
      `${formatBytes(receipt.sweep?.bytesReclaimed ?? 0)} reclaimed.`
    );
  }

  /** What the grace window withheld at the run. */
  protected receiptWithheld(receipt: CleanupReceipt): string {
    return (
      `${plural(receipt.sweep?.withheldByGraceWindow, 'blob')} ` +
      `(${formatBytes(receipt.sweep?.withheldBytes ?? 0)}) withheld by the ` +
      `${receipt.graceWindow ?? ''} grace window: not lost, and their rows were withheld with ` +
      'them, so a later run takes both.'
    );
  }
}

/** The data marks of what the receipt derives (each a class constant, as the rule reads). */
const MARKS = {
  executedAt: { derived: ['executedAt'] },
  receiptFigures: { derived: ['deleted', 'sweep.blobsUnlinked', 'sweep.bytesReclaimed'] },
  receiptWithheld: {
    derived: ['sweep.withheldByGraceWindow', 'sweep.withheldBytes', 'graceWindow'],
  },
} as const;
