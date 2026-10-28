import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WorkStore, type PendingFinish } from '$core/work/work.store';
import { Toast, ToastStack } from '$ui/components/toast/toast';

/** One toast as drawn. */
interface FinishToast {
  readonly id: string;
  readonly message: string;
  readonly action: string;
  readonly failed: boolean;
}

/** A finish with something left to show: `sending` has no button and must not stay up. */
type ShowableFinish = PendingFinish & { phase: 'waiting' | 'failed' };

function showable(pending: PendingFinish): pending is ShowableFinish {
  return pending.phase !== 'sending';
}

function toast(id: string, pending: ShowableFinish): FinishToast {
  const name = pending.entry.qualifiedId ?? 'The item';
  switch (pending.phase) {
    case 'waiting':
      return { id, message: `${name} finished`, action: 'Undo', failed: false };
    case 'failed':
      return {
        id,
        message: `${name} could not be finished. It is back in Acceptance.`,
        action: 'Dismiss',
        failed: true,
      };
  }
}

/**
 * A toast for each finish the Acceptance list asked for and not settled (`WorkStore.pendingFinishes`):
 * "<id> finished" with Undo while it waits, and the failure with Dismiss if the move to DONE failed.
 * A toast lasts exactly the Undo window: once sending starts Undo no longer works, so the toast has
 * nothing left to offer, and its life must not depend on how long the network call takes (qits-1684).
 * In the layout, so a toast stays while the user moves to another page.
 */
@Component({
  selector: 'app-finish-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Toast, ToastStack],
  host: { class: 'contents' },
  template: `
    <ui-toast-stack>
      @for (t of toasts(); track t.id) {
        <ui-toast
          [message]="t.message"
          [action]="t.action"
          [tone]="t.failed ? 'error' : 'note'"
          (act)="act(t)"
        />
      }
    </ui-toast-stack>
  `,
})
export class FinishToasts {
  private readonly store = inject(WorkStore);

  protected readonly toasts = computed(() =>
    Object.entries(this.store.pendingFinishes()).flatMap(([id, pending]) =>
      showable(pending) ? [toast(id, pending)] : [],
    ),
  );

  protected act(t: FinishToast): void {
    if (t.failed) this.store.dismissFinish(t.id);
    else this.store.undoFinish(t.id);
  }
}
