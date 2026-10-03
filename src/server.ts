import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { telemetryTarget, type TelemetryTarget } from './server/otel-config';
import { otelRoutes } from './server/otel-routes';
import { activeTraceparent, serverSpans, startTelemetry } from './server/otel-sdk';
import { withTraceparentMeta } from './server/trace-meta';

const browserDistFolder = join(import.meta.dirname, '../browser');

/**
 * THE PORT IS 8080 AND THAT IS A CONTRACT, not the scaffold's 4000.
 *
 * `DeploymentSpecParser.DEFAULT_UPSTREAM_PORT` is 8080 — the port every route the edge publishes
 * is forwarded to when `.config/qits/deployments.yml` says nothing — and that file deliberately
 * says nothing, because the two agreeing is cheaper than a key that can drift. The Dockerfile
 * states `ENV PORT=8080` as well, so the value is visible to `docker inspect` rather than only to
 * whoever reads this line.
 *
 * `process.env['PORT']` still wins where something sets it, which is what makes a workstation run
 * on another port a one-liner.
 */
const DEFAULT_PORT = 8080;

/**
 * WHAT THE DEPLOYER PROBES. `health_path: /landing/health` in `.config/qits/deployments.yml`, and
 * the two are one decision: the deployer curls this path INSIDE the container and rolls the
 * deployment back if it does not answer. The derived default would have been the Quarkus shape
 * `/landing/q/health/ready`, which nothing here serves.
 *
 * It sits UNDER the published `/landing` prefix on purpose — that is the only prefix the edge
 * routes to this application on other vhosts, so a probe outside it would be answerable from
 * inside the container and from nowhere else.
 *
 * It is an EXPRESS route rather than an Angular one: a readiness answer must not depend on the
 * renderer being able to render, which is the thing it is there to notice.
 */
const HEALTH_PATH = '/landing/health';

const app = express();
const angularApp = new AngularNodeAppEngine();

app.get(HEALTH_PATH, (_req, res) => {
  res.status(200).json({ status: 'UP' });
});

/**
 * Serve static files from /browser.
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * TELEMETRY IS DECIDED AT START, NOT HERE. It stays `null` (off) unless this module runs as the
 * server (the block at the end), so `ng serve`, the build's route extraction and the unit tests
 * never start an SDK or export anything, like `%dev`/`%test.quarkus.otel.sdk.disabled=true` in
 * the services. The relay reads it per request, so the browser library is on exactly when the
 * server's own telemetry is.
 */
let telemetry: TelemetryTarget | null = null;

app.use(otelRoutes(() => telemetry));

/**
 * Below the health probe, the static files and the telemetry routes: only what reaches the
 * renderer gets a server span.
 */
app.use(serverSpans());

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then(async (response) =>
      response ? writeResponseToNodeResponse(await withTraceMeta(response), res) : next(),
    )
    .catch(next);
});

/** Adds the render's `traceparent` to an html page, so the browser's page load joins its trace. */
async function withTraceMeta(response: Response): Promise<Response> {
  const traceparent = activeTraceparent();
  if (!traceparent || !response.headers.get('Content-Type')?.startsWith('text/html')) {
    return response;
  }
  const html = withTraceparentMeta(await response.text(), traceparent);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  telemetry = telemetryTarget(process.env);
  const stopTelemetry = telemetry ? startTelemetry(telemetry) : async () => undefined;
  // Flush what is buffered before the container stops, but never hold the stop for long.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
      void Promise.race([stopTelemetry(), timeout]).finally(() => process.exit(0));
    });
  }

  const port = process.env['PORT'] || DEFAULT_PORT;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(
      `qits-landing listening on http://0.0.0.0:${port} (health at ${HEALTH_PATH}, telemetry ${
        telemetry ? `to ${telemetry.endpoint}` : 'off'
      })`,
    );
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build).
 */
export const reqHandler = createNodeRequestHandler(app);
