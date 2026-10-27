import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationError, Router, type Event as RouterEvent } from '@angular/router';
import { Subject } from 'rxjs';
import {
  CHUNK_RELOAD_KEY,
  isFailedImport,
  provideChunkReloadReset,
  reloadOnFailedImport,
} from './chunk-reload';

const CHROMIUM = new TypeError(
  'Failed to fetch dynamically imported module: https://qits.example/chunk-GONE.js',
);

describe('reloadOnFailedImport', () => {
  let assign: ReturnType<typeof vi.fn>;
  let routerEvents: Subject<RouterEvent>;

  function setUp(platform = 'browser'): void {
    sessionStorage.clear();
    assign = vi.fn();
    routerEvents = new Subject();
    const document = { location: { assign }, defaultView: { sessionStorage } };
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: DOCUMENT, useValue: document },
        { provide: Router, useValue: { events: routerEvents } },
        provideChunkReloadReset(),
      ],
    });
    TestBed.inject(Router);
  }

  const fail = (url: string, error: unknown = CHROMIUM) =>
    TestBed.runInInjectionContext(() => reloadOnFailedImport(new NavigationError(1, url, error)));

  it('loads the target URL as a full page when a lazy file failed to load', () => {
    setUp();
    fail('/projects/qits/work');
    expect(assign).toHaveBeenCalledWith('/projects/qits/work');
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('/projects/qits/work');
  });

  it('reloads only once for the same URL', () => {
    setUp();
    fail('/projects/qits/work');
    fail('/projects/qits/work');
    expect(assign).toHaveBeenCalledOnce();
  });

  it('may reload again after a navigation that worked', () => {
    setUp();
    fail('/projects/qits/work');
    TestBed.inject(Router);
    routerEvents.next(new NavigationEnd(2, '/projects/qits/work', '/projects/qits/work'));
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
    fail('/projects/qits/work');
    expect(assign).toHaveBeenCalledTimes(2);
  });

  it('leaves other navigation errors alone', () => {
    setUp();
    fail('/projects', new Error('guard said no'));
    expect(assign).not.toHaveBeenCalled();
  });

  it('does nothing on the server', () => {
    setUp('server');
    fail('/projects');
    expect(assign).not.toHaveBeenCalled();
  });

  it('knows each browser’s failed import', () => {
    expect(isFailedImport(CHROMIUM)).toBe(true);
    expect(
      isFailedImport(new TypeError('error loading dynamically imported module: /chunk-A.js')),
    ).toBe(true);
    expect(isFailedImport(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isFailedImport(new Error('Http failure response'))).toBe(false);
  });
});
