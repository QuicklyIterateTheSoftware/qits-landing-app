import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { PROJECT_LIST } from '$core/projects/projects.operations';
import { PAGE_RELOAD, queryLocalNetwork } from '$core/platform/local-network-permission';
import { PrivateApps } from '$core/platform/private-apps';
import { Toast, type ToastTone } from '$ui/components/toast/toast';

/** A notice as drawn: its words, its button (empty for none) and its tone. */
interface Notice {
  readonly message: string;
  readonly action: string;
  readonly tone: ToastTone;
}

/** The notice for each permission state that needs one; `granted` needs none. */
export const LOCAL_NETWORK_NOTICES: Readonly<Record<'prompt' | 'denied', Notice>> = {
  prompt: {
    message:
      'The platform’s apps are on the private network (the tunnel), so your browser asks for ' +
      'local network access. Choose Allow.',
    action: 'Allow access',
    tone: 'note',
  },
  denied: {
    message:
      'Local network access is blocked for this site, so the platform’s apps on the private ' +
      'network cannot load. Chrome on a desktop: click the site settings icon left of the ' +
      'address, set Local network access to Allow, then reload. Chrome on Android: ⋮ → Settings → ' +
      'Site settings → Local network access, then allow this site.',
    action: '',
    tone: 'error',
  },
};

/**
 * Says why the browser asks for local network access, and how to allow it again (qits-2297).
 *
 * Some platform apps answer on the private network (`PrivateApps`, read from the edge once the
 * person is signed in), and Chrome asks once per site before this public page may call them. The
 * notice follows the permission (`navigator.permissions.query({ name: 'local-network' })`, and its
 * `change` event):
 *
 * - `prompt`: the browser will ask; Allow access sends one call to a private app (the project list,
 *   `PROJECT_LIST`, through the app's `HttpClient` and its bearer), so Chrome's prompt follows the
 *   press.
 * - `denied`: how to turn it back on, in Chrome on a desktop and on Android.
 * - `granted`: nothing; a change to `granted` while the page is open hides the notice and reloads
 *   the page (`PAGE_RELOAD`), so every read that failed is made again.
 *
 * Nothing shows on the server, with no private app, or where the browser has no such permission
 * (every browser but Chrome, an older Chrome): the query fails, and the calls go out as before.
 * In the shell, near the board's toasts, at the bottom left of the window so the two never cover
 * each other; drawn with `ui-toast`.
 */
@Component({
  selector: 'app-local-network-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Toast],
  host: { class: 'contents' },
  template: `
    <div
      class="pointer-events-none fixed bottom-4 left-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col [&>*]:pointer-events-auto"
      aria-live="polite"
    >
      @if (notice(); as n) {
        <ui-toast
          data-testid="local-network-notice"
          [message]="n.message"
          [action]="n.action"
          [tone]="n.tone"
          (act)="allow()"
        />
      }
    </div>
  `,
})
export class LocalNetworkNotice {
  private readonly apps = inject(PrivateApps);
  private readonly reload = inject(PAGE_RELOAD);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The permission's state; null until known, and where the browser has none. */
  private readonly state = signal<PermissionState | null>(null);
  private queried = false;

  protected readonly notice = computed((): Notice | null => {
    if (this.apps.origins().length === 0) return null;
    const state = this.state();
    return state === 'prompt' || state === 'denied' ? LOCAL_NETWORK_NOTICES[state] : null;
  });

  constructor() {
    if (!this.browser) return;
    const destroyRef = inject(DestroyRef);
    // Asked once, as soon as the edge names a private app.
    effect(() => {
      if (this.queried || this.apps.origins().length === 0) return;
      this.queried = true;
      void queryLocalNetwork().then((status) => {
        if (!status || destroyRef.destroyed) return;
        this.state.set(status.state);
        const changed = () => {
          this.state.set(status.state);
          if (status.state === 'granted') this.reload();
        };
        status.addEventListener('change', changed);
        destroyRef.onDestroy(() => status.removeEventListener('change', changed));
      });
    });
  }

  /** Sends one call to a private app, so Chrome's prompt follows the person's press. */
  protected allow(): void {
    // Its answer does not matter: the permission's `change` event says what the person chose.
    void PROJECT_LIST.fetch({}).catch(() => undefined);
  }
}
