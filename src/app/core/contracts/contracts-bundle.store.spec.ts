import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import type { ContractsSite } from '$core/ui-builder/entity-map.store';
import type { GoldenIndex } from '$core/ui-builder/golden-masters.store';
import { provideHeyApiClient } from '../../api/artifacts/client/client.gen';
import { client as artifactsClient } from '../../api/artifacts/client.gen';
import { goldenMaster, projectsGoldenIndex } from '../../../testing/golden-masters';
import { ContractsBundleStore } from './contracts-bundle.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/**
 * Each test reads its own version, so the reads' cache (`golden-masters.store.ts`, module-wide)
 * never answers across tests.
 */
let version = 0;
const site = (): ContractsSite => ({
  site: '@contracts/qits-projects',
  version: `2026.1.${++version}`,
  repository: 'qits-projects-service',
});
const base = (s: ContractsSite) => `/artifacts/docs/docs/${s.site}/-/${s.version}/golden-masters`;

/** qits-projects' published index, as its golden-masters package carries it. */
const INDEX = projectsGoldenIndex<GoldenIndex>();
const EXISTS = INDEX.states!.find((s) => s.slug === 'a-project-exists')!;
const LIST = EXISTS.operations.find((op) => op.operationId === 'listProjects')!;
const IMAGE = INDEX.states!.flatMap((s) => s.operations).find((op) => op.file === null)!;

describe('ContractsBundleStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof ContractsBundleStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(artifactsClient),
      ],
    });
    if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
      artifactsClient.interceptors.request.use(literalDocsPaths);
    }
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ContractsBundleStore);
  });

  afterEach(() => http.verify());

  it('reads the index once, and holds it', async () => {
    const s = site();
    store.readIndex(s);
    expect(store.indexRead(s)).toEqual({ status: 'loading' });
    await settle();
    http.expectOne(`${base(s)}/index.json`).flush(INDEX);
    await settle();
    const read = store.indexRead(s);
    expect(read?.status).toBe('loaded');
    expect(read?.status === 'loaded' && read.index.provider).toBe('qits-projects');
    expect(read?.status === 'loaded' && read.index.states).toHaveLength(INDEX.states!.length);
    store.readIndex(s);
    await settle();
    http.expectNone(`${base(s)}/index.json`);
  });

  it('marks an unreadable index, or a file that is not one, and reads again when asked', async () => {
    const s = site();
    store.readIndex(s);
    await settle();
    http.expectOne(`${base(s)}/index.json`).flush(null, { status: 404, statusText: 'Not Found' });
    await settle();
    expect(store.indexRead(s)).toEqual({ status: 'error' });

    store.readIndex(s);
    await settle();
    // A JSON file that is not an index: qits-projects’ recorded project list.
    http.expectOne(`${base(s)}/index.json`).flush(goldenMaster('a project exists', 'listProjects'));
    await settle();
    expect(store.indexRead(s)).toEqual({ status: 'error' });
  });

  it('reads a recorded response lazily and pretty-prints it', async () => {
    const s = site();
    const body = goldenMaster('a project exists', 'listProjects');
    store.readRecording(s, LIST);
    expect(store.recordingRead(s, LIST)).toEqual({ status: 'loading' });
    await settle();
    http.expectOne(`${base(s)}/${LIST.file}`).flush(body);
    await settle();
    expect(store.recordingRead(s, LIST)).toEqual({
      status: 'loaded',
      json: JSON.stringify(body, null, 2),
    });
  });

  it('reads nothing for a byte answer the index records no file for', () => {
    const s = site();
    expect(IMAGE.file).toBeNull();
    store.readRecording(s, IMAGE);
    expect(store.recordingRead(s, IMAGE)).toEqual({ status: 'none' });
  });

  it('never reads a file outside the index’s tree', async () => {
    const s = site();
    const outside = { ...LIST, file: '../entities.json' };
    store.readRecording(s, outside);
    await settle();
    expect(store.recordingRead(s, outside)).toEqual({ status: 'error' });
  });
});
