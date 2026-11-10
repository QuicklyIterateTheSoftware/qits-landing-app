import type { HttpTestingController } from '@angular/common/http/testing';
import { client as artifactsClient } from '../../../../../../api/artifacts/client.gen';
import { provideHeyApiClient } from '../../../../../../api/artifacts/client/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { artifactsGoldenMasters as masters } from '../../../../../../../testing/golden-masters';
import {
  configureContractsPage,
  CONTRACTS,
  openContractsPage,
  REPO,
  SLUG,
  text,
  versionsAt,
} from '../../../../../../../testing/contracts-pages';
import { EntitiesPage } from './entities.page';

/**
 * The entities list against qits-artifacts' recorded entity map of `@contracts/qits-projects`.
 * The recorded map names no known gap: that case gives the recorded WorkEntity one.
 */
const MAP = masters.body<{ entities: { entity: string }[] }>(CONTRACTS, 'getDocsFile');

describe('EntitiesPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    http = configureContractsPage(
      'projects/:slug/repositories/:repo/entities',
      EntitiesPage,
      provideHeyApiClient(artifactsClient),
    );
    if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
      artifactsClient.interceptors.request.use(literalDocsPaths);
    }
  });

  afterEach(() => http.verify());

  const url = `/projects/${SLUG}/repositories/${REPO}/entities`;

  it('groups the entities by marking, each linking to its page', async () => {
    const { element, answer } = await openContractsPage(http, url);
    await answer('entities.json', MAP);
    const groups = [...element.querySelectorAll('section.marking')];
    expect(groups.map((g) => text(g.querySelector('h2')))).toEqual(['domain 3', 'technical 1']);
    const rows = [...groups[0].querySelectorAll('tr.entity')].map((r) => text(r));
    expect(rows).toEqual([
      'Project project 2',
      'Repository repository 1',
      'WorkEntity work_entity 2',
    ]);
    expect(groups[0].querySelector('a')?.getAttribute('href')).toBe(
      `/projects/${SLUG}/repositories/${REPO}/entities/eu.wohlben.qits.entities.domain.Project`,
    );
  });

  it('marks a known gap', async () => {
    const { element, answer } = await openContractsPage(http, url, versionsAt('2100.1.3'));
    const gapped = {
      ...MAP,
      entities: MAP.entities.map((e) =>
        e.entity.endsWith('.WorkEntity') ? { ...e, knownGap: 'qits-1234' } : e,
      ),
    };
    await answer('entities.json', gapped, '2100.1.3');
    expect(text(element.querySelector('ui-chip.gap'))).toBe('Known gap qits-1234');
  });

  it('says so when the version publishes no entity map', async () => {
    const { element, answer } = await openContractsPage(http, url, versionsAt('2100.1.4'));
    await answer('entities.json', null, '2100.1.4', 404);
    expect(text(element.querySelector('.no-map'))).toBe(
      '@contracts/qits-projects 2100.1.4 publishes no entity map.',
    );
  });
});
