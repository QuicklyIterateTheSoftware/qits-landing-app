import type { HttpTestingController } from '@angular/common/http/testing';
import { client as artifactsClient } from '../../../../../../api/artifacts/client.gen';
import { provideHeyApiClient } from '../../../../../../api/artifacts/client/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import type { GoldenIndex } from '$core/ui-builder/golden-masters.store';
import { projectsGoldenIndex } from '../../../../../../../testing/golden-masters';
import {
  configureContractsPage,
  DOCS,
  openContractsPage,
  REPO,
  SITE,
  SLUG,
  text,
  VERSION,
  versionsAt,
} from '../../../../../../../testing/contracts-pages';
import { ContractsPage } from './contracts.page';

/**
 * The contracts list against qits-projects' own published index (its golden-masters package, the
 * file `@contracts/qits-projects` carries), which no qits-artifacts recording holds, so the
 * browser spec cannot show it.
 */
const INDEX = projectsGoldenIndex<GoldenIndex>();

describe('ContractsPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    http = configureContractsPage(
      'projects/:slug/repositories/:repo/contracts',
      ContractsPage,
      provideHeyApiClient(artifactsClient),
    );
    if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
      artifactsClient.interceptors.request.use(literalDocsPaths);
    }
  });

  afterEach(() => http.verify());

  const url = (repo = REPO) => `/projects/${SLUG}/repositories/${repo}/contracts`;

  it('lists every state with its operations, links each, and filters by name', async () => {
    const { element, answer, update } = await openContractsPage(http, url());
    await answer('golden-masters/index.json', INDEX);

    expect(text(element.querySelector('.site'))).toBe(`${SITE} ${VERSION}`);
    expect(element.querySelector<HTMLAnchorElement>('a.docs')?.href).toBe(
      `${DOCS}/read/${SITE}/-/${VERSION}`,
    );
    const rows = element.querySelectorAll('tr.state');
    expect(rows).toHaveLength(INDEX.states!.length);
    const exists = [...rows].find((r) => text(r.querySelector('a')) === 'a project exists')!;
    const recorded = INDEX.states!.find((s) => s.slug === 'a-project-exists')!;
    expect(text(exists.children[1])).toBe(String(recorded.operations.length));
    expect(text(exists.children[2])).toContain('deleteProject');
    expect(exists.querySelector('a')?.getAttribute('href')).toBe(
      `/projects/${SLUG}/repositories/${REPO}/contracts/a-project-exists`,
    );

    const filter = element.querySelector<HTMLInputElement>('input[type="search"]')!;
    filter.value = 'A PROJECT EXISTS';
    filter.dispatchEvent(new Event('input'));
    await update();
    const shown = [...element.querySelectorAll('tr.state')].map((r) => text(r.querySelector('a')));
    expect(shown).toContain('a project exists');
    expect(shown.every((name) => name.includes('a project exists'))).toBe(true);
    expect(text(element.querySelector('.count'))).toBe(
      `${shown.length} of ${INDEX.states!.length} states`,
    );

    filter.value = 'no state is named like this';
    filter.dispatchEvent(new Event('input'));
    await update();
    expect(text(element)).toContain('No state matches the filter.');
  });

  it('says so when no contracts bundle names the repository', async () => {
    const { element } = await openContractsPage(http, url('contract-frontend'));
    expect(text(element.querySelector('.none'))).toBe(
      'No contracts bundle is published for contract-frontend.',
    );
  });

  it('says so when the index cannot be read', async () => {
    const { element, answer } = await openContractsPage(http, url(), versionsAt('2100.1.1'));
    await answer('golden-masters/index.json', null, '2100.1.1', 500);
    expect(text(element.querySelector('.index-error'))).toBe(
      `Could not read the golden masters of ${SITE} 2100.1.1.`,
    );
  });

  it('says which sites could not be read when none names the repository', async () => {
    const { element } = await openContractsPage(http, url('contract-frontend'), 'error');
    expect(text(element.querySelector('.unreadable'))).toBe(
      `Could not read ${SITE}, so whether contract-frontend publishes a contracts bundle is not known.`,
    );
  });
});
