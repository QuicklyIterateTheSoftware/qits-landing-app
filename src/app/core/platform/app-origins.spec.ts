import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppOrigins, NAVIGATION_PATH, SAME_ORIGIN_APIS } from './app-origins';

/**
 * The part of `/main-navigation` `AppOrigins` reads, spelled as the live edge served it on
 * 2026-10-03 (maintenance and idp still under their old `qits-platform-…` names).
 */
const NAVIGATION = {
  environment: 'dev',
  origin: 'https://qits.example',
  applications: {
    'qits-projects': { origin: 'https://projects.qits.example', apiDocs: '/projects/q/swagger-ui' },
    'qits-githost': { origin: 'https://githost.qits.example' },
    'qits-events': { origin: 'https://events.qits.example/' },
    'qits-platform-maintenance': { origin: 'https://maintenance.qits.example' },
    'qits-platform-idp': { origin: 'https://idp.qits.example' },
  },
};

describe('AppOrigins', () => {
  function service(platform = 'browser', sameOrigin = false) {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: SAME_ORIGIN_APIS, useValue: sameOrigin },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    return {
      origins: TestBed.inject(AppOrigins),
      http: TestBed.inject(HttpTestingController),
    };
  }

  it("reads each backend's origin from the navigation", async () => {
    const { origins, http } = service();
    const loaded = origins.load();
    http.expectOne(NAVIGATION_PATH).flush(NAVIGATION);
    await loaded;
    expect(origins.origin('projects')).toBe('https://projects.qits.example');
    expect(origins.origin('githost')).toBe('https://githost.qits.example');
    expect(origins.origin('events')).toBe('https://events.qits.example');
    expect(origins.origin('maintenance')).toBe('https://maintenance.qits.example');
    expect(origins.origin('idp')).toBe('https://idp.qits.example');
    expect(origins.failed()).toBe(false);
    http.verify();
  });

  it('names a backend the navigation does not, and calls that a failure', async () => {
    const { origins, http } = service();
    const loaded = origins.load();
    const { 'qits-githost': _githost, ...rest } = NAVIGATION.applications;
    http.expectOne(NAVIGATION_PATH).flush({ ...NAVIGATION, applications: rest });
    await loaded;
    expect(origins.origin('githost')).toBe('');
    expect(origins.missing()).toEqual(['githost']);
    expect(origins.failed()).toBe(true);
  });

  it('fails visibly, and never throws, when the navigation does not answer', async () => {
    const { origins, http } = service();
    const loaded = origins.load();
    http.expectOne(NAVIGATION_PATH).flush(null, { status: 502, statusText: 'Bad Gateway' });
    await loaded;
    expect(origins.failed()).toBe(true);
    expect(origins.missing()).toEqual(['projects', 'githost', 'events', 'maintenance', 'idp']);
    expect(origins.origin('projects')).toBe('');
  });

  it('asks nothing under `ng serve`: every backend stays on this origin', async () => {
    const { origins, http } = service('browser', true);
    await origins.load();
    http.expectNone(NAVIGATION_PATH);
    expect(origins.origin('projects')).toBe('');
    expect(origins.failed()).toBe(false);
  });

  it('asks nothing on the server, which calls no backend', async () => {
    const { origins, http } = service('server');
    await origins.load();
    http.expectNone(NAVIGATION_PATH);
    expect(origins.failed()).toBe(false);
  });
});
