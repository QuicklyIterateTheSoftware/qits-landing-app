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

function toast(id: string, pending: PendingFinish): FinishToast {
  const name = pending.entry.qualifiedId ?? 'The item';
  switch (pending.phase) {
    case 'waiting':
      return { id, message: `${name} finished`, action: 'Undo', failed: false };
    case 'sending':
      return { id, message: `${name} finished`, action: '', failed: false };
    case 'failed':
      return {
        id,
        message: `${name} could not be finished. It is back on the board.`,
        action: 'Dismiss',
        failed: true,
      };
  }
}

/**
 * A toast for each finish the board asked for and that is not settled (`WorkStore.pendingFinishes`):
 * "<id> finished" with Undo while it waits, and the failure with Dismiss if the move to DONE failed.
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
    Object.entries(this.store.pendingFinishes()).map(([id, pending]) => toast(id, pending)),
  );

  protected act(t: FinishToast): void {
    if (t.failed) this.store.dismissFinish(t.id);
    else this.store.undoFinish(t.id);
  }
}
