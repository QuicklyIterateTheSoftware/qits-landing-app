import {
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideQitsIntegration } from '@qits/angular';
import { client as ciClient } from './api/ci/client.gen';
import { client as eventsClient } from './api/events/client.gen';
import { client as githostClient } from './api/githost/client.gen';
import { client as maintenanceClient } from './api/maintenance/client.gen';
import { client as projectsClient } from './api/projects/client.gen';
import { client as workspacesClient } from './api/workspaces/client.gen';
import { provideHeyApiClient } from './api/projects/client/client.gen';
import { routes } from './app.routes';
import { PlatformOrigins, type PlatformApp } from '$core/platform/platform-origins';
import { environment } from '../environments/environment';

/** Each generated client and the backend it calls. */
const CLIENTS = [
  [projectsClient, 'projects'],
  [githostClient, 'githost'],
  [eventsClient, 'events'],
  [maintenanceClient, 'maintenance'],
  [workspacesClient, 'workspaces'],
  [ciClient, 'ci'],
] as const satisfies readonly (readonly [unknown, PlatformApp])[];

/**
 * Points each generated client at its backend's origin (`PlatformOrigins.api`), synchronously, as
 * the injector is created and so before any call. Deployed, a cross-origin client sends the
 * session cookie (`credentials: 'include'`); the edge answers credentialed CORS for every host of
 * the platform. Under `ng serve` it sends no cookie: the bearer interceptor signs each call.
 */
function provideBackendOrigins() {
  return provideEnvironmentInitializer(() => {
    const origins = inject(PlatformOrigins);
    for (const [client, app] of CLIENTS) {
      const baseUrl = origins.api(app);
      client.setConfig(
        baseUrl && environment.sendCookie ? { baseUrl, credentials: 'include' } : { baseUrl },
      );
    }
  });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    // Error records and Navigation spans; dark unless `main.ts` found a telemetry target.
    provideQitsIntegration(),
    provideHttpClient(withFetch(), withInterceptors(environment.interceptors)),
    // Each generated client sends its calls through this app's HttpClient.
    provideHeyApiClient(projectsClient),
    provideHeyApiClient(githostClient),
    provideHeyApiClient(eventsClient),
    provideHeyApiClient(maintenanceClient),
    provideHeyApiClient(workspacesClient),
    provideHeyApiClient(ciClient),
    provideBackendOrigins(),
    // `ng serve` only: the bearer sign-in. Deployed: nothing.
    ...environment.providers,
  ],
};
