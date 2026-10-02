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
const services = ['qits-projects/qits-projects-service', 'qits-githost/qits-githost-service'];

export default defineConfig(
  services.map((service) => ({
    input: `${siblings}/${service}/docs/openapi.yml`,
    output: `src/app/api/${service.split('/')[0].replace(/^qits-/, '')}`,
    plugins: ['@hey-api/client-angular', '@hey-api/typescript', '@hey-api/sdk', '@angular/common'],
  })),
);
