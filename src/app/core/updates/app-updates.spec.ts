import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationStart, Router, type Event as RouterEvent } from '@angular/router';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { AppUpdates, DEPLOYMENT_EVENTS, isLandingDeployment } from './app-updates';

const deployment = (applicationName: string, name = 'DeploymentActive'): DomainEvent =>
  ({ name, payload: JSON.stringify({ applicationName, version: '2026.1027.1' }) }) as DomainEvent;

describe('AppUpdates', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<{ type: 'UNRECOVERABLE_STATE'; reason: string }>;
  let routerEvents: Subject<RouterEvent>;
  let domainEvents: Subject<DomainEvent>;
  let checkForUpdate: ReturnType<typeof vi.fn>;
  let on: ReturnType<typeof vi.fn>;
  let location: { assign: ReturnType<typeof vi.fn>; reload: ReturnType<typeof vi.fn> };
  let visibility: DocumentVisibilityState;
  let listeners: Map<string, () => void>;

  function start(enabled = true, platform = 'browser'): void {
    versionUpdates = new Subject();
    unrecoverable = new Subject();
    routerEvents = new Subject();
    domainEvents = new Subject();
    checkForUpdate = vi.fn(async () => true);
    on = vi.fn(() => domainEvents);
    location = { assign: vi.fn(), reload: vi.fn() };
    visibility = 'visible';
    listeners = new Map();
    const document = {
      location,
      get visibilityState() {
        return visibility;
      },
      addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: DOCUMENT, useValue: document },
        {
          provide: SwUpdate,
          useValue: { isEnabled: enabled, versionUpdates, unrecoverable, checkForUpdate },
        },
        { provide: Router, useValue: { events: routerEvents } },
        { provide: DomainEvents, useValue: { on } },
      ],
    });
    TestBed.inject(AppUpdates).start();
  }

  it('checks for a new version when this app is deployed', () => {
    start();
    expect(on).toHaveBeenCalledWith(DEPLOYMENT_EVENTS);
    domainEvents.next(deployment('qits-ci'));
    expect(checkForUpdate).not.toHaveBeenCalled();
    domainEvents.next(deployment('qits-landing'));
    expect(checkForUpdate).toHaveBeenCalledOnce();
  });

  it('checks for a new version when the tab becomes visible again', () => {
    start();
    visibility = 'hidden';
    listeners.get('visibilitychange')!();
    expect(checkForUpdate).not.toHaveBeenCalled();
    visibility = 'visible';
    listeners.get('visibilitychange')!();
    expect(checkForUpdate).toHaveBeenCalledOnce();
  });

  it('loads the next navigation as a full page once a new version is ready', () => {
    start();
    routerEvents.next(new NavigationStart(1, '/projects'));
    expect(location.assign).not.toHaveBeenCalled();
    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    });
    routerEvents.next(new NavigationStart(2, '/projects/qits/work'));
    expect(location.assign).toHaveBeenCalledWith('/projects/qits/work');
  });

  it('reloads when the worker cannot serve this version any more', () => {
    start();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'gone' });
    expect(location.reload).toHaveBeenCalledOnce();
  });

  it('does nothing when the worker is off', () => {
    start(false);
    expect(on).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it('does nothing on the server', () => {
    start(true, 'server');
    expect(on).not.toHaveBeenCalled();
  });

  it('knows a deployment of this app by its application name', () => {
    expect(isLandingDeployment(deployment('qits-landing', 'DeploymentFailed'))).toBe(true);
    expect(isLandingDeployment(deployment('qits-projects'))).toBe(false);
    expect(isLandingDeployment({ name: 'DeploymentActive' } as DomainEvent)).toBe(false);
  });
});
