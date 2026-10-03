import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  AppOrigins,
  NAVIGATION_PATH,
  PAGE_HOSTNAME,
  SAME_ORIGIN_APIS,
  trustedOrigin,
} from './app-origins';

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
    'qits-workspaces': { origin: 'https://workspaces.qits.example' },
  },
};

describe('AppOrigins', () => {
  function service(platform = 'browser', sameOrigin = false, hostname = 'qits.example') {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: SAME_ORIGIN_APIS, useValue: sameOrigin },
        { provide: PAGE_HOSTNAME, useValue: hostname },
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
    expect(origins.origin('workspaces')).toBe('https://workspaces.qits.example');
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
    expect(origins.backendsFailed()).toBe(true);
  });

  it("counts an origin outside https on this page's domain as missing", async () => {
    const { origins, http } = service();
    const loaded = origins.load();
    http.expectOne(NAVIGATION_PATH).flush({
      ...NAVIGATION,
      applications: {
        ...NAVIGATION.applications,
        'qits-projects': { origin: 'http://projects.qits.example' },
        'qits-githost': { origin: 'https://githost.evil.example' },
        'qits-events': { origin: 'https://events.qits.example.evil.example' },
        'qits-workspaces': { origin: 'javascript:alert(1)' },
      },
    });
    await loaded;
    expect(origins.missing()).toEqual(['projects', 'githost', 'events', 'workspaces']);
    expect(origins.origin('projects')).toBe('');
    expect(origins.origin('workspaces')).toBe('');
  });

  it('a missing page application fails the page but not the backends', async () => {
    const { origins, http } = service();
    const loaded = origins.load();
    const { 'qits-workspaces': _workspaces, ...rest } = NAVIGATION.applications;
    http.expectOne(NAVIGATION_PATH).flush({ ...NAVIGATION, applications: rest });
    await loaded;
    expect(origins.missing()).toEqual(['workspaces']);
    expect(origins.failed()).toBe(true);
    expect(origins.backendsFailed()).toBe(false);
  });

  it('fails visibly, and never throws, when the navigation does not answer', async () => {
    const { origins, http } = service();
    const loaded = origins.load();
    http.expectOne(NAVIGATION_PATH).flush(null, { status: 502, statusText: 'Bad Gateway' });
    await loaded;
    expect(origins.failed()).toBe(true);
    expect(origins.missing()).toEqual([
      'projects',
      'githost',
      'events',
      'maintenance',
      'idp',
      'workspaces',
    ]);
    expect(origins.origin('projects')).toBe('');
  });

  it('under `ng serve` keeps every backend on this origin and reads page origins under the stated domain', async () => {
    const { origins, http } = service('browser', true, 'localhost');
    const loaded = origins.load();
    http.expectOne(NAVIGATION_PATH).flush(NAVIGATION);
    await loaded;
    expect(origins.origin('projects')).toBe('');
    expect(origins.origin('idp')).toBe('');
    expect(origins.origin('workspaces')).toBe('https://workspaces.qits.example');
    expect(origins.failed()).toBe(false);
  });

  it('under `ng serve` trusts no page origin when the navigation states no https origin', async () => {
    const { origins, http } = service('browser', true, 'localhost');
    const loaded = origins.load();
    http.expectOne(NAVIGATION_PATH).flush({ ...NAVIGATION, origin: 'http://qits.example' });
    await loaded;
    expect(origins.origin('workspaces')).toBe('');
    expect(origins.missing()).toEqual(['workspaces']);
    expect(origins.backendsFailed()).toBe(false);
  });

  it('under `ng serve` a failed navigation leaves the backends alone', async () => {
    const { origins, http } = service('browser', true, 'localhost');
    const loaded = origins.load();
    http.expectOne(NAVIGATION_PATH).flush(null, { status: 502, statusText: 'Bad Gateway' });
    await loaded;
    expect(origins.missing()).toEqual(['workspaces']);
    expect(origins.backendsFailed()).toBe(false);
  });

  it('asks nothing on the server, which calls no backend', async () => {
    const { origins, http } = service('server');
    await origins.load();
    http.expectNone(NAVIGATION_PATH);
    expect(origins.failed()).toBe(false);
  });
});

describe('trustedOrigin', () => {
  it('accepts https on the domain itself and on names under it', () => {
    expect(trustedOrigin('https://qits.example', 'qits.example')).toBe('https://qits.example');
    expect(trustedOrigin('https://a.b.qits.example/', 'qits.example')).toBe(
      'https://a.b.qits.example',
    );
    expect(trustedOrigin('https://Projects.QITS.example', 'qits.example')).toBe(
      'https://projects.qits.example',
    );
  });

  it('refuses every other scheme, host or shape', () => {
    for (const value of [
      'http://projects.qits.example',
      'javascript:alert(1)',
      'https://evilqits.example',
      'https://qits.example.evil.example',
      'https://evil.example/projects.qits.example',
      '//projects.qits.example',
      'projects.qits.example',
      '',
      null,
      undefined,
    ]) {
      expect(trustedOrigin(value, 'qits.example')).toBeUndefined();
    }
    expect(trustedOrigin('https://projects.qits.example', '')).toBeUndefined();
  });
});
