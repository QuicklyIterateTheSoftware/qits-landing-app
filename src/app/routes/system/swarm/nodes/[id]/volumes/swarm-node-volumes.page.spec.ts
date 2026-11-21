import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { NEVER } from 'rxjs';
import { client as systemClient } from '../../../../../../api/system/client.gen';
import { provideHeyApiClient } from '../../../../../../api/system/client/client.gen';
import type { NodeVolume } from '$core/system/node-volumes.consumes';
import { isAnonymousVolume } from '$core/system/node-volumes';
import { OPEN_SWARM_NODE } from '$core/system/open-swarm-node';
import type { SwarmNodeDetail } from '$core/system/swarm.consumes';
import { isRecorded, systemGoldenMasters } from '../../../../../../../testing/golden-masters';
import { REMOTE_NODE_NOTE, SwarmNodeVolumesPage } from './swarm-node-volumes.page';

/**
 * A swarm node page's Volumes tab (qits-2355), its read answered with qits-system's recordings: "a
 * single-node swarm" (three volumes, a runner's work volume unused and labelled, an anonymous one
 * unused), "a node holding no volumes" (`[]`) and "a swarm node this service cannot reach" (409
 * `NODE_REMOTE`); each skips itself until the `@qits/system-golden-masters` pin records qits-2355's
 * states. The node the layout read (`OPEN_SWARM_NODE`) is the recorded node; a node that is not the
 * one qits-system runs on is that node with `self: false`. What no recording holds is derived from
 * the recorded volumes and says how. A 403 and a 503 are statuses only.
 */
const SWARM = 'a single-node swarm';
const NO_VOLUMES = 'a node holding no volumes';
const REMOTE = 'a swarm node this service cannot reach';

/** The node every page here is opened on (the recorded node's id). */
const NODE = 'iwbwrdui2z0n62kqcjfo1erwh';
const VOLUMES = `/system/api/nodes/${NODE}/volumes`;

const RECORDED = isRecorded(NO_VOLUMES, 'listNodeVolumes', systemGoldenMasters);
const NODE_RECORDED = isRecorded(SWARM, 'listSwarmNodeTasks', systemGoldenMasters);

const volumesOf = (state: string) =>
  systemGoldenMasters.body<NodeVolume[]>(state, 'listNodeVolumes');
const recordedNode = () => systemGoldenMasters.body<SwarmNodeDetail>(SWARM, 'getSwarmNode');

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('SwarmNodeVolumesPage', () => {
  let http: HttpTestingController;
  const node = signal<SwarmNodeDetail | undefined>(undefined);

  beforeEach(() => {
    node.set(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'system/swarm/nodes/:id/volumes',
            component: SwarmNodeVolumesPage,
            providers: [{ provide: OPEN_SWARM_NODE, useValue: { nodeId: signal(NODE), node } }],
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(systemClient),
        // The tab has no `refreshOn`; a stream that never sends.
        { provide: QITS_DOMAIN_EVENTS, useValue: { on: () => NEVER } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Lets the requests go out and the tab draw. */
  async function answered(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
      harness.fixture.detectChanges();
    }
  }

  /** The tab at `url`, its read answered with `body` (and `status`, 200 unless given). */
  async function render(
    body: object | null,
    status = 200,
    url = `/system/swarm/nodes/${NODE}/volumes`,
  ) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await answered(harness);
    const read = http.expectOne(VOLUMES);
    if (status === 200) read.flush(body);
    else read.flush(body, { status, statusText: 'Error' });
    await answered(harness);
    return { harness, element: harness.routeNativeElement as HTMLElement };
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** The cells of each body row of the table. */
  const cells = (element: HTMLElement) =>
    [...element.querySelectorAll('table[aria-label="Volumes"] tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => text(cell)),
    );

  it.skipIf(!RECORDED)(
    'lists the recorded volumes in the server’s order, the anonymous one hidden',
    async () => {
      const { element } = await render(volumesOf(SWARM));
      expect([...element.querySelectorAll('thead th')].map((heading) => text(heading))).toEqual([
        'Name',
        'Driver',
        'Labels',
        'Mountpoint',
      ]);
      expect(text(element.querySelector('[data-caption]'))).toBe('2 volumes · 1 anonymous hidden');
      expect(cells(element)).toEqual([
        ['qits-shared-m2', 'local', '—', '/var/lib/docker/volumes/qits-shared-m2/_data'],
        [
          // The name and its chip, the two label chips, side by side.
          'qits-system-runner-work-ws-10207-d2616b57unused',
          'local',
          'qits.system.runner=d2616b57-95a8-4e1b-865f-c10d8225ce5dqits.system.runner.work-key=ws-10207',
          '/var/lib/docker/volumes/qits-system-runner-work-ws-10207-d2616b57/_data',
        ],
      ]);
      const rows = element.querySelectorAll('tbody tr');
      expect(rows[0].querySelector('ui-chip[label="unused"]')).toBeNull();
      expect(rows[1].querySelector('ui-chip[label="unused"]')?.className).toContain('bg-');
      const box = element.querySelector<HTMLInputElement>('[data-show-anonymous]');
      expect(box?.checked).toBe(false);
    },
  );

  it.skipIf(!RECORDED)(
    'shows the anonymous volume by its short name with ?anonymous=1, and the box checked',
    async () => {
      const { element } = await render(
        volumesOf(SWARM),
        200,
        `/system/swarm/nodes/${NODE}/volumes?anonymous=1`,
      );
      expect(text(element.querySelector('[data-caption]'))).toBe('3 volumes');
      const rows = [...element.querySelectorAll('tbody tr')];
      expect(rows).toHaveLength(3);
      const name = rows[2].querySelector('[data-name]');
      expect(text(name)).toBe('3f49f7508f53');
      expect(name?.getAttribute('title')).toBe(
        '3f49f7508f534e3614ffc3bdd2c240800f208996d8ce4deb0f2dd9dd5e5e4dc0',
      );
      expect(rows[2].querySelector('ui-chip[label="anonymous"]')).not.toBeNull();
      expect(rows[2].querySelector('ui-chip[label="unused"]')).not.toBeNull();
      // The anonymous marker is the chip, not a label.
      expect(text(rows[2].querySelector('[data-labels]'))).toBe('—');
      expect(element.querySelector<HTMLInputElement>('[data-show-anonymous]')?.checked).toBe(true);
    },
  );

  it.skipIf(!RECORDED)('puts anonymous=1 into the address when the box is ticked', async () => {
    const { harness, element } = await render(volumesOf(SWARM));
    const box = element.querySelector<HTMLInputElement>('[data-show-anonymous]')!;
    box.click();
    await answered(harness);
    expect(TestBed.inject(Router).url).toBe(`/system/swarm/nodes/${NODE}/volumes?anonymous=1`);
    expect(element.querySelectorAll('tbody tr')).toHaveLength(3);
    element.querySelector<HTMLInputElement>('[data-show-anonymous]')!.click();
    await answered(harness);
    expect(TestBed.inject(Router).url).toBe(`/system/swarm/nodes/${NODE}/volumes`);
  });

  it.skipIf(!RECORDED)(
    'says a node holding only anonymous volumes holds only those, the box still there',
    async () => {
      // The recording cut to its anonymous volume.
      const { element } = await render(volumesOf(SWARM).filter((row) => isAnonymousVolume(row)));
      expect(text(element.querySelector('[data-only-anonymous]'))).toBe(
        'This node holds only anonymous volumes.',
      );
      expect(text(element.querySelector('[data-caption]'))).toBe('0 volumes · 1 anonymous hidden');
      expect(element.querySelector('[data-show-anonymous]')).not.toBeNull();
      expect(element.querySelector('table')).toBeNull();
    },
  );

  it.skipIf(!RECORDED)('says a node holding no volumes holds none', async () => {
    const { element } = await render(volumesOf(NO_VOLUMES));
    expect(text(element.querySelector('[role="status"]'))).toBe('This node holds no volumes.');
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelector('[data-show-anonymous]')).toBeNull();
  });

  it.skipIf(!RECORDED)(
    'says only the node qits-system runs on can be read on a 409 NODE_REMOTE, in its words',
    async () => {
      const { element } = await render(systemGoldenMasters.body(REMOTE, 'listNodeVolumes'), 409);
      expect(text(element.querySelector('[data-remote]'))).toBe(
        'only the local node is reachable in this version',
      );
      expect(element.querySelector('ui-load-failure')).toBeNull();
    },
  );

  it('says the node’s volumes cannot be read on a 409 that is not NODE_REMOTE', async () => {
    const { element } = await render(null, 409);
    expect(element.querySelector('[data-remote]')).toBeNull();
    expect(text(element.querySelector('ui-load-failure'))).toContain(
      'The node’s volumes cannot be read right now.',
    );
  });

  it.skipIf(!NODE_RECORDED)(
    'reads nothing on a node that is not the one qits-system runs on, and says so',
    async () => {
      // The recorded node, as another host's node would read: not `self`.
      node.set({ ...recordedNode(), self: false });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/system/swarm/nodes/${NODE}/volumes`);
      await answered(harness);
      http.expectNone(VOLUMES);
      const element = harness.routeNativeElement as HTMLElement;
      expect(text(element.querySelector('[data-remote]'))).toBe(REMOTE_NODE_NOTE);
      expect(element.querySelector('ui-action-button')).toBeNull();
    },
  );

  it('says a 403 is a missing role', async () => {
    const { element } = await render(null, 403);
    expect(text(element.querySelector('[role="alert"]'))).toContain(
      'Reading the swarm needs an admin role',
    );
    expect(element.querySelector('ui-load-failure')).toBeNull();
  });

  it('says a 503 is the node’s volumes not being readable, with Retry reading again', async () => {
    const { harness, element } = await render(null, 503);
    const failure = element.querySelector('ui-load-failure');
    expect(failure?.classList.contains('hidden')).toBe(false);
    expect(text(failure)).toContain('The node’s volumes cannot be read right now.');
    failure!.querySelector('button')!.click();
    await answered(harness);
    // Retry reads again; the second answer is a 503 too.
    http.expectOne(VOLUMES).flush(null, { status: 503, statusText: 'Error' });
    await answered(harness);
    expect(text(element.querySelector('ui-load-failure'))).toContain('cannot be read right now');
  });
});
