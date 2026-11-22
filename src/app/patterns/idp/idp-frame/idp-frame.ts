import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { PlatformOrigins } from '$core/platform/platform-origins';

/** An admin page of qits-idp-frontend, under `<idp origin>/idp/`. */
export type IdpAdminPage = 'clients' | 'users' | 'devices';

/**
 * One of the idp's admin pages (qits-idp-frontend) in a frame that fills the main slot
 * (qits-2481). Those pages draw no navigation of their own: this app's sidebar is theirs.
 *
 * The frame is `https://idp.<domain>/idp/<page>`. The idp and this app's door, `qits.<domain>`,
 * are the same site, so the idp's session cookie goes with the frame's requests and the page opens
 * signed in. The idp sends no `X-Frame-Options` or `frame-ancestors`, so the frame is allowed.
 *
 * On the server render the idp's origin is not known (`''`), so there is no frame until the
 * browser draws one.
 */
@Component({
  selector: 'app-idp-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (src(); as url) {
      <!-- As tall as the window below the top bar: from 768px up that is the main slot. -->
      <iframe
        class="block h-[calc(100dvh-var(--app-header-h))] w-full border-0 bg-surface"
        [src]="url"
        [title]="title()"
      ></iframe>
    }
  `,
})
export class IdpFrame {
  /** Which admin page to show. */
  readonly page = input.required<IdpAdminPage>();

  /** The frame's accessible name. */
  readonly title = input.required<string>();

  private readonly origin = inject(PlatformOrigins).page('idp');
  private readonly sanitizer = inject(DomSanitizer);

  /** The page's address; `null` while the idp's origin is not known (the server render). */
  protected readonly src = computed((): SafeResourceUrl | null =>
    this.origin
      ? // A fixed path on the idp's origin, never input from a person or a backend.
        this.sanitizer.bypassSecurityTrustResourceUrl(`${this.origin}/idp/${this.page()}`)
      : null,
  );
}
