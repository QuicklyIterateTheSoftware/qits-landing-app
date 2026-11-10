import {
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import {
  provideQitsBearerSignIn,
  provideQitsIntegration,
  qitsBearerInterceptor,
} from '@qits/angular';
import { provideQitsMermaid } from '@qits/ui-components/mermaid';
import { client as artifactsClient } from './api/artifacts/client.gen';
import { client as ciClient } from './api/ci/client.gen';
import { client as eventsClient } from './api/events/client.gen';
import { client as githostClient } from './api/githost/client.gen';
import { client as maintenanceClient } from './api/maintenance/client.gen';
import { client as projectsClient } from './api/projects/client.gen';
import { client as systemClient } from './api/system/client.gen';
import { client as workspacesClient } from './api/workspaces/client.gen';
import { client as workspaceDaemonClient } from './api/workspace-daemon/client.gen';
import { provideHeyApiClient } from './api/projects/client/client.gen';
import { routes } from './app.routes';
import { PlatformOrigins, type PlatformApp } from '$core/platform/platform-origins';
import { provideAppUpdates } from '$core/updates/app-updates';
import { provideChunkReloadReset, reloadOnFailedImport } from '$core/updates/chunk-reload';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { provideWorkReferences } from '$core/work/work-briefs.store';
import { environment } from '../environments/environment';

/**
 * Each generated client and the backend it calls. The workspace daemon is reached through
 * qits-workspaces' container proxy, so it calls qits-workspaces' origin; its store gives each call
 * the container's base (`/workspaces/container/<slot row id>`). qits-artifacts answers on the
 * `registry` host (`HOST_LABELS`).
 */
const CLIENTS = [
  [projectsClient, 'projects'],
  [githostClient, 'githost'],
  [eventsClient, 'events'],
  [maintenanceClient, 'maintenance'],
  [workspacesClient, 'workspaces'],
  [workspaceDaemonClient, 'workspaces'],
  [ciClient, 'ci'],
  [systemClient, 'system'],
  [artifactsClient, 'artifacts'],
] as const satisfies readonly (readonly [unknown, PlatformApp])[];

/**
 * Points each generated client at its backend's origin (`PlatformOrigins.api`), synchronously, as
 * the injector is created and so before any call. No call sends a cookie: `qitsBearerInterceptor`
 * signs each one with the bearer.
 */
function provideBackendOrigins() {
  return provideEnvironmentInitializer(() => {
    const origins = inject(PlatformOrigins);
    for (const [client, app] of CLIENTS) client.setConfig({ baseUrl: origins.api(app) });
    // The docs store reads `site` and `path` with `/` and `@` literal, which the generated client
    // encodes (qits-1951, `docs-paths.ts`).
    if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
      artifactsClient.interceptors.request.use(literalDocsPaths);
    }
  });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // A lazy page whose file a release replaced loads its URL as a full page, once (qits-1686).
    provideRouter(routes, withNavigationErrorHandler(reloadOnFailedImport)),
    provideChunkReloadReset(),
    // The service worker keeps an open tab on a complete version across releases (qits-1686).
    provideAppUpdates(),
    provideClientHydration(),
    // Error records and Navigation spans; dark unless `main.ts` found a telemetry target.
    provideQitsIntegration(),
    // The bearer sign-in (epic qits-543): the idp's authorization code with PKCE, the bearer on
    // every platform call, the event stream through `fetch()`, WebSockets with the bearer as a
    // subprotocol. `auth/callback` is placed in `app.routes.ts`, outside the session guard.
    provideQitsBearerSignIn({
      clientId: environment.signInClientId,
      platformDomain: environment.platformDomain,
      callbackRoute: false,
    }),
    provideHttpClient(withFetch(), withInterceptors([qitsBearerInterceptor])),
    // Each generated client sends its calls through this app's HttpClient.
    provideHeyApiClient(projectsClient),
    provideHeyApiClient(githostClient),
    provideHeyApiClient(eventsClient),
    provideHeyApiClient(maintenanceClient),
    provideHeyApiClient(workspacesClient),
    provideHeyApiClient(workspaceDaemonClient),
    provideHeyApiClient(ciClient),
    provideHeyApiClient(systemClient),
    provideHeyApiClient(artifactsClient),
    provideBackendOrigins(),
    // Work ids in commit subjects (`<qits-commit-message>`, qits-1897): their briefs through the
    // projects client above (`provideQitsWorkBriefs`), their links to this app's work item page.
    provideWorkReferences(),
    // `<qits-mermaid-diagram>` draws with mermaid, loaded lazily on the first diagram (the entity
    // page's ER diagram, qits-2014); without this it shows the definition as text.
    provideQitsMermaid(),
  ],
};
