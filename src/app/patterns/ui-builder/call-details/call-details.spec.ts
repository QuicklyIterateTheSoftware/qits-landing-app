import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ContractsSite } from '$core/ui-builder/entity-map.store';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { provideHeyApiClient } from '../../../api/artifacts/client/client.gen';
import { client as artifactsClient } from '../../../api/artifacts/client.gen';
import { CallDetails } from './call-details';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const CALL = {
  provider: 'qits-ci-service',
  state: 'a commit with a run in flight',
  operationId: 'listActiveRuns',
};

/** Each test reads its own version, so the reads' cache never answers across tests. */
let version = 0;
const site = (): ContractsSite => ({
  site: '@contracts/qits-ci',
  version: `2026.1.${++version}`,
  repository: 'qits-ci-service',
});
const base = (s: ContractsSite) => `/artifacts/docs/docs/${s.site}/-/${s.version}/golden-masters`;

const INDEX = {
  formatVersion: 1,
  provider: 'qits-ci',
  states: [
    {
      name: CALL.state,
      slug: 'a-commit-with-a-run-in-flight',
      params: { runId: 'r-1', commitSha: 'abc' },
      dependsOn: [{ provider: 'qits-projects', state: 'a project exists' }],
      operations: [
        {
          operationId: CALL.operationId,
          method: 'GET',
          path: '/ci/api/runs/active',
          status: 200,
          file: 'a-commit-with-a-run-in-flight/listActiveRuns.json',
        },
      ],
    },
  ],
};

describe('CallDetails', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(artifactsClient),
        provideTestPlatformOrigins({}, { docs: 'https://docs.example' }),
      ],
    });
    if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
      artifactsClient.interceptors.request.use(literalDocsPaths);
    }
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(s: ContractsSite | null, entities = [{ key: 'k', name: 'CiRun' }]) {
    const fixture = TestBed.createComponent(CallDetails);
    fixture.componentRef.setInput('call', CALL);
    fixture.componentRef.setInput('site', s);
    fixture.componentRef.setInput('entities', entities);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const open = async () => {
      element.querySelector<HTMLButtonElement>('.call-trigger')!.click();
      fixture.detectChanges();
      await settle();
    };
    const update = async () => {
      await settle();
      fixture.detectChanges();
    };
    return { fixture, element, open, update };
  }

  it('reads nothing until it opens, then shows the operation, the state and the recorded JSON', async () => {
    const s = site();
    const { element, open, update } = await render(s);
    expect(element.querySelector('.call-popover')).toBeNull();
    expect(element.querySelector('.call-trigger')?.textContent).toContain(CALL.operationId);

    await open();
    expect(element.querySelector('.call-popover')?.textContent).toContain('Reading');
    http.expectOne(`${base(s)}/index.json`).flush(INDEX);
    await update();
    http
      .expectOne(`${base(s)}/a-commit-with-a-run-in-flight/listActiveRuns.json`)
      .flush({ runs: [{ id: 'r-1' }] });
    await update();

    // The popover's parts sit side by side without whitespace between them: compare without it.
    const bare = (t: string) => t.replace(/\s+/g, '');
    const text = bare(element.querySelector('.call-popover')?.textContent ?? '');
    expect(text).toContain(bare('GET /ci/api/runs/active 200'));
    expect(text).toContain(bare('runId r-1'));
    expect(text).toContain(bare('Depends on: qits-projects: a project exists'));
    expect(element.querySelector('pre.json')?.textContent).toBe(
      JSON.stringify({ runs: [{ id: 'r-1' }] }, null, 2),
    );
    expect(element.querySelector<HTMLAnchorElement>('.call-popover a')?.href).toBe(
      `https://docs.example/read/${s.site}/-/${s.version}`,
    );
  });

  it('opens an entity the call touches, and closes', async () => {
    const s = site();
    const { fixture, element, open, update } = await render(s);
    const picked: string[] = [];
    fixture.componentInstance.entityPicked.subscribe((key) => picked.push(key));
    await open();
    http.expectOne(`${base(s)}/index.json`).flush(INDEX);
    await update();
    http.expectOne(`${base(s)}/a-commit-with-a-run-in-flight/listActiveRuns.json`).flush({});
    await update();

    const entity = [...element.querySelectorAll<HTMLButtonElement>('.call-popover button')].find(
      (b) => b.textContent?.trim() === 'CiRun',
    )!;
    entity.click();
    fixture.detectChanges();
    expect(picked).toEqual(['k']);
    expect(element.querySelector('.call-popover')).toBeNull();
  });

  it('says so when the contracts list no such state', async () => {
    const s = site();
    const { element, open, update } = await render(s, []);
    await open();
    http.expectOne(`${base(s)}/index.json`).flush({ ...INDEX, states: [] });
    await update();
    expect(element.querySelector('.call-popover')?.textContent).toContain(
      `list no state “${CALL.state}”`,
    );
  });

  it('says so when the provider publishes no contracts, and reads nothing', async () => {
    const { element, open } = await render(null, []);
    await open();
    expect(element.querySelector('.call-popover')?.textContent).toContain(
      'No contracts published for qits-ci-service.',
    );
  });

  it('closes on Escape and on a click outside', async () => {
    const { fixture, element, open } = await render(null, []);
    await open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('.call-popover')).toBeNull();
    await open();
    document.body.click();
    fixture.detectChanges();
    expect(element.querySelector('.call-popover')).toBeNull();
  });
});
