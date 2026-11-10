import type { HttpTestingController } from '@angular/common/http/testing';
import { client as artifactsClient } from '../../../../../../../api/artifacts/client.gen';
import { provideHeyApiClient } from '../../../../../../../api/artifacts/client/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import type { GoldenIndex } from '$core/ui-builder/golden-masters.store';
import {
  artifactsGoldenMasters as masters,
  projectsGoldenIndex,
} from '../../../../../../../../testing/golden-masters';
import {
  configureContractsPage,
  CONTRACTS,
  openContractsPage,
  REPO,
  SLUG,
  text,
  VERSION,
  versionsAt,
} from '../../../../../../../../testing/contracts-pages';
import { EntityPage } from './entity.page';

/**
 * An entity's page against qits-artifacts' recorded entity map of `@contracts/qits-projects`
 * (Project, Repository and WorkEntity domain, LegacyPlacement technical), and qits-projects' own
 * published index (its golden-masters package) for the states each operation is recorded in.
 * The recorded map holds no projection: that case marks the recorded Repository a projection of
 * `qits-projects:Project`, which then resolves inside the same bundle.
 */
interface RecordedMap {
  entities: { entity: string; marking: string; projectionOf: string | null }[];
}
const MAP = masters.body<RecordedMap>(CONTRACTS, 'getDocsFile');
const INDEX = projectsGoldenIndex<GoldenIndex>();
const PROJECT = 'eu.wohlben.qits.entities.domain.Project';
const REPOSITORY = 'eu.wohlben.qits.entities.domain.Repository';
const LEGACY = 'eu.wohlben.qits.entities.domain.LegacyPlacement';

describe('EntityPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    http = configureContractsPage(
      'projects/:slug/repositories/:repo/entities/:entity',
      EntityPage,
      provideHeyApiClient(artifactsClient),
    );
    if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
      artifactsClient.interceptors.request.use(literalDocsPaths);
    }
  });

  afterEach(() => http.verify());

  const url = (entity: string) => `/projects/${SLUG}/repositories/${REPO}/entities/${entity}`;

  it('shows a domain entity’s DTOs and operations, each kind explained, with their states', async () => {
    const { element, answer } = await openContractsPage(http, url(PROJECT));
    await answer('entities.json', MAP);
    await answer('golden-masters/index.json', INDEX);

    expect(text(element.querySelector('h1'))).toBe('Project');
    expect(text(element.querySelector('.fqn'))).toBe(PROJECT);
    expect(text(element.querySelector('.marking'))).toBe('domain');
    expect(element.querySelector('.reason')).toBeNull();
    const dto = element.querySelector('.dto')!;
    expect(text(dto)).toContain('eu.wohlben.qits.entities.dto.ProjectDto mapper');
    expect(text(dto.querySelector('.note'))).toContain('taking the entity as a parameter');
    expect(text(dto)).toContain('ProjectMapper.toDto(Project)');
    const ops = [...element.querySelectorAll('.operation')];
    expect(ops.map((op) => text(op.querySelector('p')))).toEqual([
      'getProject GET /projects/{projectId} returns',
      'listProjects GET /projects returns',
    ]);
    expect(text(ops[1].querySelector('.note'))).toContain('return type');
    const states = [...ops[1].querySelectorAll('.states a')];
    expect(states.map((a) => text(a))).toContain('a project exists');
    expect(states.find((a) => text(a) === 'a project exists')?.getAttribute('href')).toBe(
      `/projects/${SLUG}/repositories/${REPO}/contracts/a-project-exists`,
    );
  });

  it('shows why a technical entity is one', async () => {
    const { element, answer } = await openContractsPage(http, url(LEGACY));
    await answer('entities.json', MAP);
    await answer('golden-masters/index.json', INDEX);
    expect(text(element.querySelector('h1'))).toBe('LegacyPlacement');
    expect(text(element.querySelector('.reason'))).toBe('bookkeeping of a retired layout');
    expect(text(element)).toContain('No operation hands it out.');
  });

  it('links a projection to the entity it projects', async () => {
    // Its own version, so its map is read here and not found cached.
    const { element, answer } = await openContractsPage(
      http,
      url(REPOSITORY),
      versionsAt('2100.1.2'),
    );
    const projected = {
      ...MAP,
      entities: MAP.entities.map((e) =>
        e.entity === REPOSITORY
          ? { ...e, marking: 'projection', projectionOf: 'qits-projects:Project' }
          : e,
      ),
    };
    await answer('entities.json', projected, '2100.1.2');
    await answer('golden-masters/index.json', null, '2100.1.2', 404);
    const projection = element.querySelector('.projection a');
    expect(text(projection)).toBe('qits-projects:Project');
    expect(projection?.getAttribute('href')).toBe(
      `/projects/${SLUG}/repositories/${REPO}/entities/${PROJECT}`,
    );
    expect(text(element)).toContain('Could not read the golden masters');
  });

  it('says so for a class the map does not list', async () => {
    const { element, answer } = await openContractsPage(http, url('a.NoSuchEntity'));
    await answer('entities.json', MAP);
    await answer('golden-masters/index.json', INDEX);
    expect(text(element.querySelector('.unknown'))).toBe(
      `No such entity in qits-projects ${VERSION}. All entities`,
    );
  });
});
