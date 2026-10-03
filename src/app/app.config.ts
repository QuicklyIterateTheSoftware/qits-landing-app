import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { client as eventsClient } from './api/events/client.gen';
import { client as githostClient } from './api/githost/client.gen';
import { client as maintenanceClient } from './api/maintenance/client.gen';
import { client as projectsClient } from './api/projects/client.gen';
import { provideHeyApiClient } from './api/projects/client/client.gen';
import { routes } from './app.routes';
import { AppOrigins, type Backend } from './core/platform/app-origins';

/** Each generated client and the backend it calls. */
const CLIENTS = [
  [projectsClient, 'projects'],
  [githostClient, 'githost'],
  [eventsClient, 'events'],
  [maintenanceClient, 'maintenance'],
] as const satisfies readonly (readonly [unknown, Backend])[];

/**
 * Points each generated client at its backend's origin before the first call: the app waits for
 * initializers before it routes. A cross-origin client sends the session cookie
 * (`credentials: 'include'`); the edge answers credentialed CORS for every host of the platform.
 */
function provideBackendOrigins() {
  return provideAppInitializer(async () => {
    const origins = inject(AppOrigins);
    await origins.load();
    for (const [client, backend] of CLIENTS) {
      const baseUrl = origins.origin(backend);
      client.setConfig(baseUrl ? { baseUrl, credentials: 'include' } : { baseUrl });
    }
  });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    // Each generated client sends its calls through this app's HttpClient.
    provideHeyApiClient(projectsClient),
    provideHeyApiClient(githostClient),
    provideHeyApiClient(eventsClient),
    provideHeyApiClient(maintenanceClient),
    provideBackendOrigins(),
  ],
};
