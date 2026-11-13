/**
 * The contracts and entity pages' browser specs (qits-1994), with the links they lead on by (epic
 * qits-2000): qits-artifacts' recordings of qits-2041's contracts bundles, read as the pages read
 * them (`ContractsCatalog`'s catalog, then each site's files through `ContractsBundles`).
 *
 * - `a published contracts bundle with a golden-master index` (`INDEX`): a catalog listing
 *   `@contracts/qits-githost` and `@contracts/qits-projects`, githost's versions (2100.1.0, naming
 *   qits-githost-service) and its `golden-masters/index.json`: `a git project exists`, and `a git
 *   project with a repository` (`getGitRepository`), which depends on it and on qits-projects' `a
 *   project exists`.
 * - `a published contracts bundle a dependency points into` (`DEPENDENCY`): `@contracts/qits-projects`'s
 *   index, listing `a project exists`.
 * - `a published contracts bundle with a projection entity` (`PROJECTION`): githost's `entities.json`,
 *   GitProject (a projection of `qits-projects:Project`) and GitRepository (domain, handed out by
 *   `getGitRepository`).
 * - qits-projects' versions and `entities.json` are `a published contracts bundle with an entity
 *   map`'s (`ENTITY_MAP`), the same site and version, naming qits-projects-service.
 */
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { OpenedRoute } from './app-route';
import { goldenMaster } from './golden-master';

export const INDEX = 'a published contracts bundle with a golden-master index';
export const DEPENDENCY = 'a published contracts bundle a dependency points into';
export const PROJECTION = 'a published contracts bundle with a projection entity';
/** `@contracts/qits-projects` with its `entities.json` (qits-1950). */
export const ENTITY_MAP = 'a published contracts bundle with an entity map';

/** The repository `INDEX`'s githost site names. */
export const GITHOST = 'qits-githost-service';

/**
 * Answers the catalog with `INDEX`'s two contracts sites, githost's versions from `INDEX` and
 * qits-projects' from the entity map's recording.
 */
export async function answerTwoSiteCatalog(opened: OpenedRoute): Promise<void> {
  const http = TestBed.inject(HttpTestingController);
  http
    .expectOne('/artifacts/docs/docs')
    .flush(await goldenMaster(INDEX, 'listDocsSites', 'qits-artifacts'));
  await opened.settled();
  http
    .expectOne((req) => req.url.endsWith('/artifacts/docs/docs/@contracts/qits-githost'))
    .flush(await goldenMaster(INDEX, 'listDocsVersions', 'qits-artifacts'));
  http
    .expectOne((req) => req.url.endsWith('/artifacts/docs/docs/@contracts/qits-projects'))
    .flush(await goldenMaster(ENTITY_MAP, 'listDocsVersions', 'qits-artifacts'));
  await opened.settled();
}

/** Answers the read of `file` of `site`'s bundle (`@contracts/<site>/-/<version>/<file>`). */
export async function answerFile(
  opened: OpenedRoute,
  site: string,
  file: string,
  state: string,
): Promise<void> {
  TestBed.inject(HttpTestingController)
    .expectOne((req) => req.url.includes(`/@contracts/${site}/-/`) && req.url.endsWith(`/${file}`))
    .flush(await goldenMaster(state, 'getDocsFile', 'qits-artifacts'));
  await opened.settled();
}

/**
 * Lets the navigation an exit started finish, and answers every read the page it left for makes
 * (and every read still open) with a 404 (an error answer is only a status): that page is its own
 * spec's (`idle()`, not `settled()`, qits-2056). Answers in rounds, until a round leaves nothing
 * open.
 */
export async function leftFor(opened: OpenedRoute): Promise<void> {
  const http = TestBed.inject(HttpTestingController);
  for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
    await opened.idle();
    const open = http.match(() => true).filter((request) => !request.cancelled);
    for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
    quiet = open.length ? 0 : quiet + 1;
  }
}

/** Answers every read still open with a 404: reads no recording holds (a recorded response). */
export function refuseOpen(): void {
  const http = TestBed.inject(HttpTestingController);
  for (const request of http.match(() => true).filter((r) => !r.cancelled)) {
    request.flush(null, { status: 404, statusText: 'Not Found' });
  }
}
