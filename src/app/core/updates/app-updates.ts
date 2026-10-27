import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  inject,
  Injectable,
  isDevMode,
  PLATFORM_ID,
  provideEnvironmentInitializer,
} from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { provideServiceWorker, SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { payloadField } from '$core/events/refresh-on';

/** This app's name in the deployment events. */
export const LANDING_APPLICATION = 'qits-landing';

/**
 * The events after which a new version of this app may be on the server: a deployment of it went
 * live, or failed (a failed one can roll back to the earlier version).
 */
export const DEPLOYMENT_EVENTS = ['DeploymentActive', 'DeploymentFailed'] as const;

/** Whether `event` is a deployment of this app. */
export function isLandingDeployment(event: DomainEvent): boolean {
  return payloadField(event, 'applicationName') === LANDING_APPLICATION;
}

/**
 * Keeps an open tab on a complete version of the app across releases (qits-1686).
 *
 * The service worker (`ngsw-config.json`) holds every file of the version the tab loaded, so lazy
 * pages still load after a release replaced the files on the server. This service moves the tab to
 * the new version:
 *
 * - It asks the worker to look for a new version when this app's deployment event arrives through
 *   the one qits-events subscription (`DomainEvents`), and when the tab becomes visible again. No
 *   timer.
 * - When the new version is ready (`VERSION_READY`), the next navigation loads its target as a
 *   full page, which the worker serves from the new version. The visitor sees no notice: the
 *   page they asked for opens, on the new version.
 * - When the worker cannot serve the tab's version any more (`unrecoverable`), it reloads.
 *
 * Does nothing where the worker is off: on the server, under `ng serve` and in the specs.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdates {
  private readonly updates = inject(SwUpdate);
  private readonly router = inject(Router);
  private readonly events = inject(DomainEvents);
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private started = false;
  private ready = false;

  /** Starts watching; a second call does nothing. */
  start(): void {
    if (this.started || !this.browser || !this.updates.isEnabled) return;
    this.started = true;

    this.updates.versionUpdates
      .pipe(filter((event) => event.type === 'VERSION_READY'))
      .subscribe(() => (this.ready = true));
    this.updates.unrecoverable.subscribe(() => this.document.location.reload());

    this.events
      .on(DEPLOYMENT_EVENTS)
      .pipe(filter(isLandingDeployment))
      .subscribe(() => this.check());
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible') this.check();
    });

    this.router.events
      .pipe(filter((event): event is NavigationStart => event instanceof NavigationStart))
      .subscribe((event) => {
        if (this.ready) this.document.location.assign(event.url);
      });
  }

  private check(): void {
    // A failed check (offline, signed out) changes nothing; the next trigger tries again.
    this.updates.checkForUpdate().catch(() => undefined);
  }
}

/**
 * The service worker and {@link AppUpdates}. The worker is registered in production builds only
 * (`isDevMode()` is false), once the app is stable or after 30 s.
 */
export function provideAppUpdates() {
  return [
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideEnvironmentInitializer(() => inject(AppUpdates).start()),
  ];
}
