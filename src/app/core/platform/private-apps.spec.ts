import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, type Event as RouterEvent } from '@angular/router';
import { Subject } from 'rxjs';
import { client as edgeClient } from '../../api/edge/client.gen';
import { provideHeyApiClient } from '../../api/edge/client/client.gen';
import { edgeGoldenMaster } from '../../../testing/golden-masters';
import { currentPrivateOrigins, setPrivateOrigins } from './local-network';
import { PrivateApps, privateOriginsOf } from './private-apps';

const STATE = 'a signed-in caller and a private app';
/** The one application the recording marks private. */
const RECORDED_PRIVATE = ['https://stt.qits.example.com'];

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('privateOriginsOf', () => {
  it('names the origins of the applications marked private, and no other', () => {
    const { applications } = edgeGoldenMaster(STATE, 'getMainNavigation');
    expect(privateOriginsOf(applications)).toEqual(RECORDED_PRIVATE);
  });

  it('leaves out a private application without an origin', () => {
    // The recording's private entry with its origin taken away (null on a name inside no project).
    const { applications } = edgeGoldenMaster(STATE, 'getMainNavigation');
    const stt = applications['qits-stt'];
    expect(privateOriginsOf({ 'qits-stt': { ...stt, origin: null } })).toEqual([]);
  });
});

/** Which platform apps are on the private network, read once signed in (qits-2297). */
describe('PrivateApps', () => {
  let routerEvents: Subject<RouterEvent>;
  let http: HttpTestingController;

  function start(platform = 'browser'): PrivateApps {
    routerEvents = new Subject();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: Router, useValue: { events: routerEvents } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(edgeClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const apps = TestBed.inject(PrivateApps);
    apps.start();
    return apps;
  }

  const navigated = (url: string) => routerEvents.next(new NavigationEnd(1, url, url));

  afterEach(() => {
    http.verify();
    setPrivateOrigins([]);
  });

  it('reads the navigation after the first navigation past the sign-in, and marks its origins', async () => {
    const apps = start();
    navigated('/auth/callback?code=x');
    await settle();
    http.expectNone('/main-navigation');
    navigated('/projects');
    navigated('/projects/qits');
    await settle();
    http.expectOne('/main-navigation').flush(edgeGoldenMaster(STATE, 'getMainNavigation'));
    await settle();
    expect(apps.origins()).toEqual(RECORDED_PRIVATE);
    expect(currentPrivateOrigins()).toEqual(new Set(RECORDED_PRIVATE));
  });

  it('marks nothing when the read fails', async () => {
    const apps = start();
    navigated('/');
    await settle();
    http.expectOne('/main-navigation').flush(null, { status: 503, statusText: 'Unavailable' });
    await settle();
    expect(apps.origins()).toEqual([]);
    expect(currentPrivateOrigins().size).toBe(0);
  });

  it('reads nothing on the server', async () => {
    start('server');
    navigated('/');
    await settle();
    http.expectNone('/main-navigation');
  });
});
