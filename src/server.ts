import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

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
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || DEFAULT_PORT;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`qits-landing listening on http://0.0.0.0:${port} (health at ${HEALTH_PATH})`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build).
 */
export const reqHandler = createNodeRequestHandler(app);
