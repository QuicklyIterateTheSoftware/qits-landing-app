import type { Provider } from '@angular/core';
import { PlatformOrigins, type PlatformApp } from '$core/platform/platform-origins';

/** Fixed answers for {@link PlatformOrigins}; an application not named answers `''`. */
export class TestPlatformOrigins extends PlatformOrigins {
  constructor(
    private readonly apis: Partial<Record<PlatformApp, string>> = {},
    private readonly pages: Partial<Record<PlatformApp, string>> = {},
  ) {
    super();
  }

  api(app: PlatformApp): string {
    return this.apis[app] ?? '';
  }

  page(app: PlatformApp): string {
    return this.pages[app] ?? '';
  }
}

/** Provides {@link TestPlatformOrigins} with these answers. Configuration, not backend data. */
export function provideTestPlatformOrigins(
  apis: Partial<Record<PlatformApp, string>> = {},
  pages: Partial<Record<PlatformApp, string>> = {},
): Provider {
  return { provide: PlatformOrigins, useValue: new TestPlatformOrigins(apis, pages) };
}
