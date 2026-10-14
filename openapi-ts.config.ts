import { defineConfig } from '@hey-api/openapi-ts';

/**
 * One generated Angular client per backend, from the service's own `docs/openapi.yml` in the
 * sibling checkout of the wrapper. `npm run generate:api` regenerates them; commit the result,
 * because CI builds this repository without its siblings.
 *
 * Each client runs on Angular's `HttpClient` and gives every operation a typed function and a
 * typed `httpResource`. A call to a path, parameter or field the spec does not have is a compile
 * error.
 *
 * `QITS_SIBLINGS` points at another wrapper checkout's `components/` (default: the one this
 * repository sits in).
 */
const siblings = process.env['QITS_SIBLINGS'] ?? '../..';
const services = [
  'qits-projects/qits-projects-service',
  'qits-githost/qits-githost-service',
  'qits-events/qits-events-service',
  'qits-maintenance/qits-maintenance-service',
  'qits-workspaces/qits-workspaces-service',
  'qits-ci/qits-ci-service',
  // The workspace daemon (epic qits-1230): its paths are its own (`/commands`), reached through
  // qits-workspaces' container proxy, so a call sets its `baseUrl` to the container's prefix.
  'qits-workspaces/qits-workspace-daemon',
];

/** `src/app/api/<component without qits->`, or `workspace-daemon` for the daemon. */
const output = (service: string) =>
  service.endsWith('/qits-workspace-daemon')
    ? 'workspace-daemon'
    : service.split('/')[0].replace(/^qits-/, '');

export default defineConfig(
  services.map((service) => ({
    input: `${siblings}/${service}/docs/openapi.yml`,
    output: `src/app/api/${output(service)}`,
    plugins: ['@hey-api/client-angular', '@hey-api/typescript', '@hey-api/sdk', '@angular/common'],
  })),
);
