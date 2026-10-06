import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { goldenMaster, projectsGoldenMasters } from '../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { WorkDetailStore } from './work-detail.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const EPIC = 'an epic in detail';
const BUG = 'a bug ticket in detail';
const TASK = 'a task in detail';

/** `WorkDetailStore` on qits-projects' recorded detail states. */
describe('WorkDetailStore', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideTestPlatformOrigins({ projects: 'https://projects.test' }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const params = (state: string) => projectsGoldenMasters.operation(state, 'getEntity').params;

  /** Starts `load` for `state`'s item and answers the item and its comments. */
  async function started(state: string) {
    const store = TestBed.inject(WorkDetailStore);
    const ref = params(state)['qualifiedId'];
    const load = store.load(ref);
    await settle();
    http.expectOne(`/projects/api/entities/${ref}`).flush(goldenMaster(state, 'getEntity'));
    http
      .expectOne(`/projects/api/entities/${ref}/comments`)
      .flush(goldenMaster(state, 'listEntityComments'));
    await settle();
    return { store, ref, load };
  }

  it('reads an epic, its comments, its dossier pages and its figures', async () => {
    const { store, ref, load } = await started(EPIC);
    const epicId = params(EPIC)['epicId'];
    http
      .expectOne(`/projects/api/epics/${epicId}/dossier`)
      .flush(goldenMaster(EPIC, 'listEpicDossierPages'));
    http
      .expectOne(`/projects/api/epics/${epicId}/dossier-assets`)
      .flush(goldenMaster(EPIC, 'listEpicDossierAssets'));
    await load;
    const detail = store.of(ref)!;
    expect(detail.status).toBe('loaded');
    expect(detail.entity?.description).toContain('## Why');
    expect(detail.comments.map((c) => c.author)).toEqual([
      'dana.weber',
      'qits-agent',
      'dana.weber',
    ]);
    expect(detail.pages.map((p) => p.title)).toEqual(['Scope', 'Data flow', 'Rollout']);
    const asset = params(EPIC)['figureAssetId'];
    const url = `/epics/${epicId}/dossier-assets/${asset}/content`;
    expect(detail.figures).toEqual({ [url]: `https://projects.test/projects/api${url}` });
  });

  it('reads a ticket’s dossier pages, and no figures', async () => {
    const { store, ref, load } = await started(BUG);
    http
      .expectOne(`/projects/api/tickets/${params(BUG)['bugTicketId']}/dossier`)
      .flush(goldenMaster(BUG, 'listTicketDossierPages'));
    await load;
    const detail = store.of(ref)!;
    expect(detail.entity?.blocked).toBe(true);
    expect(detail.pages.map((p) => p.title)).toEqual(['Reproduction', 'Affected invoices']);
    expect(detail.figures).toEqual({});
  });

  it('reads no dossier for a task, and reads once', async () => {
    const { store, ref, load } = await started(TASK);
    await load;
    expect(store.of(ref)?.status).toBe('loaded');
    expect(store.of(ref)?.pages).toEqual([]);
    await store.load(ref);
    await settle();
    http.expectNone(`/projects/api/entities/${ref}`);
  });

  it('fails when a read fails, and reads again on the next load', async () => {
    const store = TestBed.inject(WorkDetailStore);
    const ref = params(TASK)['qualifiedId'];
    const load = store.load(ref);
    await settle();
    http
      .expectOne(`/projects/api/entities/${ref}`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    http
      .expectOne(`/projects/api/entities/${ref}/comments`)
      .flush(goldenMaster(TASK, 'listEntityComments'));
    await load;
    expect(store.of(ref)?.status).toBe('error');
    void store.load(ref);
    await settle();
    http.expectOne(`/projects/api/entities/${ref}`).flush(goldenMaster(TASK, 'getEntity'));
    http
      .expectOne(`/projects/api/entities/${ref}/comments`)
      .flush(goldenMaster(TASK, 'listEntityComments'));
    await settle();
    expect(store.of(ref)?.status).toBe('loaded');
  });

  describe('loadCriteria', () => {
    const IMPROVEMENT = 'an improvement ticket in detail';

    it('reads an item’s acceptance criteria once', async () => {
      const store = TestBed.inject(WorkDetailStore);
      const ref = params(IMPROVEMENT)['qualifiedId'];
      const load = store.loadCriteria(ref);
      expect(store.criteriaOf(ref)).toEqual({ status: 'loading', items: [] });
      await settle();
      const recorded = goldenMaster(IMPROVEMENT, 'getEntity');
      http.expectOne(`/projects/api/entities/${ref}`).flush(recorded);
      await load;
      expect(store.criteriaOf(ref)).toEqual({
        status: 'loaded',
        items: recorded.acceptanceCriteria,
      });
      expect(recorded.acceptanceCriteria.length).toBeGreaterThan(0);
      await store.loadCriteria(ref);
      await settle();
      http.expectNone(`/projects/api/entities/${ref}`);
    });

    it('fails when the read fails, and reads again on the next call', async () => {
      const store = TestBed.inject(WorkDetailStore);
      const ref = params(EPIC)['qualifiedId'];
      const load = store.loadCriteria(ref);
      await settle();
      http
        .expectOne(`/projects/api/entities/${ref}`)
        .flush(null, { status: 404, statusText: 'Not Found' });
      await load;
      expect(store.criteriaOf(ref)).toEqual({ status: 'error', items: [] });
      void store.loadCriteria(ref);
      await settle();
      http.expectOne(`/projects/api/entities/${ref}`).flush(goldenMaster(EPIC, 'getEntity'));
      await settle();
      expect(store.criteriaOf(ref)?.status).toBe('loaded');
    });
  });
});
