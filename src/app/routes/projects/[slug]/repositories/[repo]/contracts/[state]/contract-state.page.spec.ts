import type { HttpTestingController } from '@angular/common/http/testing';
import { client as artifactsClient } from '../../../../../../../api/artifacts/client.gen';
import { provideHeyApiClient } from '../../../../../../../api/artifacts/client/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import type { GoldenIndex, GoldenState } from '$core/ui-builder/golden-masters.store';
import { goldenMaster, projectsGoldenIndex } from '../../../../../../../../testing/golden-masters';
import {
  configureContractsPage,
  openContractsPage,
  REPO,
  SITE,
  SLUG,
  text,
  VERSION,
} from '../../../../../../../../testing/contracts-pages';
import { ContractStatePage } from './contract-state.page';

/**
 * A provider state's page against qits-projects' own published index and recordings (its
 * golden-masters package, the files `@contracts/qits-projects` carries), which no qits-artifacts
 * recording holds, so the browser spec cannot show them. Each recorded response is answered with
 * qits-projects' recording of that (state, operation).
 */
const INDEX = projectsGoldenIndex<GoldenIndex>();
const EXISTS = INDEX.states!.find((s) => s.slug === 'a-project-exists')!;
/** The state with a byte answer: an image the index records no file for (qits-1934). */
const IMAGE_STATE = INDEX.states!.find((s) => s.operations.some((op) => op.file === null))!;
/** A state recording a request body and one recording a query. */
const WITH_BODY = INDEX.states!.find((s) => s.operations.some((op) => op.body !== undefined))!;

describe('ContractStatePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    http = configureContractsPage(
      'projects/:slug/repositories/:repo/contracts/:state',
      ContractStatePage,
      provideHeyApiClient(artifactsClient),
    );
    if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
      artifactsClient.interceptors.request.use(literalDocsPaths);
    }
  });

  afterEach(() => http.verify());

  const url = (state: string) => `/projects/${SLUG}/repositories/${REPO}/contracts/${state}`;

  /** Answers each of `state`'s recorded responses with qits-projects' recording. */
  async function answerRecordings(
    answer: (file: string, body: unknown) => Promise<void>,
    state: GoldenState,
  ) {
    for (const op of state.operations) {
      if (op.file && op.status !== 204) {
        await answer(`golden-masters/${op.file}`, goldenMaster(state.name, op.operationId));
      }
    }
  }

  it('shows the state’s slug, params, dependencies and each recorded response as JSON', async () => {
    const { element, answer } = await openContractsPage(http, url(EXISTS.slug));
    await answer('golden-masters/index.json', INDEX);
    await answerRecordings(answer, EXISTS);

    expect(text(element.querySelector('h1'))).toBe('a project exists');
    expect(text(element.querySelector('.slug'))).toBe('a-project-exists');
    expect(text(element.querySelector('table.params'))).toContain(
      `projectId ${String(EXISTS.params!['projectId'])}`,
    );
    expect(text(element.querySelector('.depends'))).toBe('None');
    const operations = element.querySelectorAll('article.operation');
    expect(operations).toHaveLength(EXISTS.operations.length);
    const at = EXISTS.operations.findIndex((op) => op.operationId === 'listProjects');
    const list = operations[at];
    expect(text(list.querySelector('h3'))).toContain(
      `listProjects GET ${EXISTS.operations[at].path} ${EXISTS.operations[at].status}`,
    );
    expect(list.querySelector('ui-json-block.response pre')?.textContent).toBe(
      JSON.stringify(goldenMaster('a project exists', 'listProjects'), null, 2),
    );
    expect(element.querySelector<HTMLAnchorElement>('a.back')?.getAttribute('href')).toBe(
      `/projects/${SLUG}/repositories/${REPO}/contracts`,
    );
  });

  it('shows a request body', async () => {
    const { element, answer } = await openContractsPage(http, url(WITH_BODY.slug));
    await answer('golden-masters/index.json', INDEX);
    await answerRecordings(answer, WITH_BODY);
    const at = WITH_BODY.operations.findIndex((op) => op.body !== undefined);
    const op = element.querySelectorAll('article.operation')[at];
    expect(op.querySelector('ui-json-block.request-body pre')?.textContent).toBe(
      JSON.stringify(WITH_BODY.operations[at].body, null, 2),
    );
  });

  it('shows a byte answer’s status and headers, and no JSON', async () => {
    const { element, answer } = await openContractsPage(http, url(IMAGE_STATE.slug));
    await answer('golden-masters/index.json', INDEX);
    await answerRecordings(answer, IMAGE_STATE);
    const at = IMAGE_STATE.operations.findIndex((op) => op.file === null);
    const op = element.querySelectorAll('article.operation')[at];
    expect(text(op.querySelector('.bytes'))).toContain(
      `Status ${IMAGE_STATE.operations[at].status}`,
    );
    expect(text(op.querySelector('.headers'))).toContain('Content-Type image/png');
    expect(op.querySelector('ui-json-block.response')).toBeNull();
  });

  it('says so for a slug the index does not list', async () => {
    const { element, answer } = await openContractsPage(http, url('no-such-state'));
    await answer('golden-masters/index.json', INDEX);
    expect(text(element.querySelector('.unknown'))).toBe(
      `No such state in qits-projects ${VERSION}. All states`,
    );
    expect(element.querySelector('.unknown a')?.getAttribute('href')).toBe(
      `/projects/${SLUG}/repositories/${REPO}/contracts`,
    );
    expect(text(element.querySelector('.site'))).toBe(`${SITE} ${VERSION}`);
  });
});
