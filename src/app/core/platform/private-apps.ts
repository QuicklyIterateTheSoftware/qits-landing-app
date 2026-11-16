import { isPlatformBrowser } from '@angular/common';
import {
  inject,
  Injectable,
  PLATFORM_ID,
  provideEnvironmentInitializer,
  signal,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { CALLBACK_PATH } from '@qits/angular';
import { filter, take } from 'rxjs';
import type { NavigationApplications } from '$core/edge/edge.consumes';
import { MAIN_NAVIGATION } from '$core/edge/edge.operations';
import { setPrivateOrigins } from './local-network';

/** The origins of the applications the navigation marks `exposure: 'private'`, sorted. */
export function privateOriginsOf(applications: NavigationApplications): string[] {
  const origins = Object.values(applications).flatMap((app) =>
    app.exposure === 'private' && app.origin ? [app.origin] : [],
  );
  return [...new Set(origins)].sort();
}

/**
 * Which platform apps answer on the private network (the tunnel), from the edge's navigation
 * (`MAIN_NAVIGATION`, the page's own origin; qits-2297).
 *
 * The public edge lists a private app only to a caller it admits, so the read waits until the
 * person is signed in: the first navigation that ends anywhere but the sign-in's callback page
 * (every other route is behind `qitsSignedInGuard`). It reads once, in the browser only, and hands
 * the origins to `setPrivateOrigins` (`local-network.ts`), so every later call to one of them is
 * marked for Chrome's Local Network Access, and holds them for the shell's notice
 * (`app-local-network-notice`). A failed read marks nothing and shows nothing.
 *
 * Staleness: none. Where an app answers changes with a deployment of the edge's route table, which
 * sends no event this app follows; a reload reads it again.
 */
@Injectable({ providedIn: 'root' })
export class PrivateApps {
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly held = signal<readonly string[]>([]);
  private started = false;

  /** The private apps' origins; empty until read, and when the read failed. */
  readonly origins = this.held.asReadonly();

  /** Reads the navigation once the person is signed in; a second call does nothing. */
  start(): void {
    if (this.started || !this.browser) return;
    this.started = true;
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        filter((event) => !event.urlAfterRedirects.startsWith(CALLBACK_PATH)),
        take(1),
      )
      .subscribe(() => void this.read());
  }

  /** Reads the navigation now and keeps its private origins; a failure keeps what was there. */
  async read(): Promise<void> {
    const answer = await MAIN_NAVIGATION.fetch({}).catch(() => undefined);
    const applications = answer?.data?.applications;
    if (!applications) return;
    const origins = privateOriginsOf(applications);
    setPrivateOrigins(origins);
    this.held.set(origins);
  }
}

/** Starts {@link PrivateApps} with the app (`app.config.ts`). */
export function providePrivateApps() {
  return provideEnvironmentInitializer(() => inject(PrivateApps).start());
}
