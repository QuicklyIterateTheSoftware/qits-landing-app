import { DOCUMENT, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HOST_LABELS,
  HostPlatformOrigins,
  type PlatformApp,
  type PlatformOrigins,
  ProxiedPlatformOrigins,
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

describe('ProxiedPlatformOrigins', () => {
  const proxied: PlatformOrigins = new ProxiedPlatformOrigins('qits.wohlben.eu');

  it("keeps every call on this page's origin, for the proxy", () => {
    for (const app of APPS) expect(proxied.api(app)).toBe('');
  });

  it('opens pages on the stated platform domain', () => {
    expect(proxied.page('workspaces')).toBe('https://workspaces.qits.wohlben.eu');
    expect(proxied.page('githost')).toBe('https://githost.qits.wohlben.eu');
  });
});
