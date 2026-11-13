import { qitsOperation } from '@qits/angular';
import { getRaw } from '../../api/githost';
import { GET_RAW } from './raw-images.consumes';

/**
 * qits-githost's raw read (`GET /githost/api/repositories/{repoId}/raw`, qits-734) declared as an
 * operation (qits-2145): a file's bytes at one revision, which `RawImages` reads through
 * `qitsResource`s (qits-2146; `RawImagesStore` read them before) for the Changes tab and a commit's
 * changeset. The answer is no JSON: it binds no field (`GET_RAW`), and the params ask for a Blob
 * (`rawImageParams`). `raw-images.operations.pact.spec.ts` binds it.
 */
export const RAW_FILE = qitsOperation({
  provider: 'qits-githost-service',
  operationId: 'getRaw',
  method: 'GET',
  call: getRaw,
  consumes: GET_RAW,
});

/**
 * Asks Angular's `HttpRequest` for the body as a Blob. The generated options do not name
 * `responseType`, but the client hands every option to the request's init, which reads it.
 */
const AS_BLOB = { responseType: 'blob' } as const;

/** The params of a read of `path` at commit `rev` of `repoId`, its body a Blob. */
export const rawImageParams = (repoId: string, rev: string, path: string) => ({
  path: { repoId },
  query: { rev, path },
  ...AS_BLOB,
});
