import { qitsOperation } from '@qits/angular';
import { listRepositoryPackages } from '../../api/mirror';
import { LIST_REPOSITORY_PACKAGES } from './repository-packages.consumes';

/**
 * One qits-mirror cache root's contents (qits-2358) declared as an operation, read by the Mirror
 * section's repository page through its own `qitsResource`; `repository-packages.operations.pact.spec.ts`
 * binds it.
 *
 * `REPOSITORY_PACKAGES`: `GET /mirror/api/repositories/{repository}/packages`, the root's row and
 * its packages by name, each package's versions in the server's order (for OCI, digests newest
 * first). `packages: []` is a root nobody has pulled through yet; an unknown name is a 404 with an
 * empty body; a database fault is a 5xx, never an empty list. Not paged.
 */
export const REPOSITORY_PACKAGES = qitsOperation({
  provider: 'qits-mirror-service',
  operationId: 'listRepositoryPackages',
  method: 'GET',
  call: listRepositoryPackages,
  consumes: LIST_REPOSITORY_PACKAGES,
});
