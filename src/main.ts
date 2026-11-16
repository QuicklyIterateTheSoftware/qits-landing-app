import { bootstrapApplication } from '@angular/platform-browser';
import { initQitsIntegration } from '@qits/angular';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { installLocalNetworkFetch } from '$core/platform/local-network';

/**
 * Browser telemetry first: it reads `api/config.json` from this app's own server and is on only
 * when that server's telemetry is. It must finish before the bootstrap, because Angular's fetch
 * backend keeps the `fetch` it finds first, and the instrumentation has to have wrapped it.
 *
 * Then the Local Network Access marking (qits-2297, `core/platform/local-network.ts`), around the
 * telemetry's `fetch` and for the same reason before the bootstrap: a call to a platform app on the
 * private network carries `targetAddressSpace: 'local'`. This file is the browser's entry only;
 * the server (`main.server.ts`) never installs it.
 */
initQitsIntegration()
  .catch(() => undefined)
  .then(() => {
    installLocalNetworkFetch();
    return bootstrapApplication(App, appConfig);
  })
  .catch((err) => console.error(err));
