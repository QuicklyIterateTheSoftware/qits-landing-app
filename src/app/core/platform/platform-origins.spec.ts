import { DOCUMENT, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DomainPlatformOrigins,
  HOST_LABELS,
  HostPlatformOrigins,
  type PlatformApp,
  type PlatformOrigins,
} from './platform-origins';

const APPS = Object.keys(HOST_LABELS) as PlatformApp[];

describe('HostPlatformOrigins', () => {
  function origins(platform: string): HostPlatformOrigins {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: DOCUMENT, useValue: { location: { hostname: 'qits.wohlben.eu' } } },
        HostPlatformOrigins,
      ],
    });
    return TestBed.inject(HostPlatformOrigins);
  }

  it("answers every application under the page's hostname, for calls and pages alike", () => {
    const host = origins('browser');
    expect(host.api('projects')).toBe('https://projects.qits.wohlben.eu');
    expect(host.api('idp')).toBe('https://idp.qits.wohlben.eu');
    expect(host.page('workspaces')).toBe('https://workspaces.qits.wohlben.eu');
    for (const app of APPS) expect(host.api(app)).toBe(host.page(app));
  });

  it('answers nothing on the server', () => {
    const host = origins('server');
    for (const app of APPS) {
      expect(host.api(app)).toBe('');
      expect(host.page(app)).toBe('');
    }
  });
});

describe('DomainPlatformOrigins', () => {
  const origins: PlatformOrigins = new DomainPlatformOrigins('qits.wohlben.eu');

  it('answers every application under the stated domain, for calls and pages alike', () => {
    expect(origins.api('projects')).toBe('https://projects.qits.wohlben.eu');
    expect(origins.page('workspaces')).toBe('https://workspaces.qits.wohlben.eu');
    for (const app of APPS) expect(origins.api(app)).toBe(origins.page(app));
  });
});
