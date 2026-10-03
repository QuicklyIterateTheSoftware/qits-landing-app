import { bootstrapApplication } from '@angular/platform-browser';
import { initQitsIntegration } from '@qits/angular';
import { appConfig } from './app/app.config';
import { App } from './app/app';

/**
 * Browser telemetry first: it reads `api/config.json` from this app's own server and is on only
 * when that server's telemetry is. It must finish before the bootstrap, because Angular's fetch
 * backend keeps the `fetch` it finds first, and the instrumentation has to have wrapped it.
 */
initQitsIntegration()
  .catch(() => undefined)
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));
