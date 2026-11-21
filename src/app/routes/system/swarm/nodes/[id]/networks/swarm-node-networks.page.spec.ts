import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { NEVER } from 'rxjs';
import { client as systemClient } from '../../../../../../api/system/client.gen';
import { provideHeyApiClient } from '../../../../../../api/system/client/client.gen';
import { OPEN_SWARM_NODE } from '$core/system/open-swarm-node';
import type { SwarmNodeDetail } from '$core/system/swarm.consumes';
import { isRecorded, systemGoldenMasters } from '../../../../../../../testing/golden-masters';
import { networkCreated, SwarmNodeNetworksPage } from './swarm-node-networks.page';

/**
 * A swarm node's Networks tab (qits-2354), the node it reads for given as the layout gives it
 * (`OPEN_SWARM_NODE`) and its one read answered with qits-system's recordings: "a single-node swarm"
 * (the node, `self`, and its networks). "A node listing no networks" (`[]`) and "a swarm node this
 * service cannot reach" (409 `NODE_REMOTE`) are read from the pin once it records them; until then
 * the empty answer is the populated recording with its rows removed, and the 409 is a status only.
 * Another node is the recorded node with `self` false. A 403 is a status only.
 */
const SWARM = 'a single-node swarm';
const NO_NETWORKS = 'a node listing no networks';
const REMOTE = 'a swarm node this service cannot reach';

/** The node every state recorded `getSwarmNode` for. */
const NODE = 'iwbwrdui2z0n62kqcjfo1erwh';
const URL = `/system/api/nodes/${NODE}/networks`;

const NODE_RECORDED = isRecorded(SWARM, 'getSwarmNode', systemGoldenMasters);

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const nodeOf = () => systemGoldenMasters.body<SwarmNodeDetail>(SWARM, 'getSwarmNode');
const networksOf = (state: string) =>
  systemGoldenMasters.body<unknown[]>(state, 'listNodeNetworks');

describe('SwarmNodeNetworksPage', () => {
  let http: HttpTestingController;
  const node = signal<SwarmNodeDetail | undefined>(undefined);

  beforeEach(() => {
    node.set(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(systemClient),
        { provide: OPEN_SWARM_NODE, useValue: { nodeId: signal(NODE), node } },
        // The tab has no `refreshOn`; a stream that never sends.
        { provide: QITS_DOMAIN_EVENTS, useValue: { on: () => NEVER } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Lets the request go out and the tab draw. */
  async function drawn(fixture: ComponentFixture<SwarmNodeNetworksPage>) {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
      fixture.detectChanges();
    }
  }

  /** The tab for the recorded node (`self` as given), before its read is answered. */
  async function open(self = true) {
    node.set({ ...nodeOf(), self });
    const fixture = TestBed.createComponent(SwarmNodeNetworksPage);
    await drawn(fixture);
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  /** The tab, its read answered with `body` at `status`. */
  async function render(body: unknown, status = 200) {
    const opened = await open();
    const read = http.expectOne(URL);
    if (status === 200) read.flush(body as object);
    else read.flush(body as object | null, { status, statusText: 'Error' });
    await drawn(opened.fixture);
    return opened;
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** The cells of each body row of the networks table. */
  const cells = (element: HTMLElement) =>
    [...element.querySelectorAll('table[aria-label="Networks"] tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => text(cell)),
    );

  it('formats docker’s creation date by its offset, a dash when unparseable', () => {
    expect(networkCreated('2026-08-15 06:44:01.671795447 +0000 UTC')).toBe('15 Aug 2026 06:44:01Z');
    expect(networkCreated('2026-08-15 08:44:01 +0200 CEST')).toBe('15 Aug 2026 06:44:01Z');
    expect(networkCreated('2 months ago')).toBe('—');
    expect(networkCreated(undefined)).toBe('—');
  });

  it('reads nothing while the node is not read yet', async () => {
    const fixture = TestBed.createComponent(SwarmNodeNetworksPage);
    await drawn(fixture);
    http.expectNone(URL);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-remote]')).toBeNull();
  });

  it.skipIf(!NODE_RECORDED)('reads nothing for another node, and says so', async () => {
    const { element } = await open(false);
    http.expectNone(URL);
    expect(text(element.querySelector('[role="status"]'))).toBe(
      'Only the node qits-system runs on can be read; this is another node.',
    );
    expect(element.querySelector('ui-load-failure')).toBeNull();
    expect(element.querySelector('ui-action-button')).toBeNull();
  });

  it.skipIf(!NODE_RECORDED)('lists the recorded networks in the server’s order', async () => {
    const recorded = networksOf(SWARM);
    const { element } = await render(recorded);
    const rows = cells(element);
    expect(rows).toHaveLength(recorded.length);
    expect(rows[0]).toEqual([
      'qits-net',
      'mulnl3uqqi0h',
      'overlay',
      'swarm',
      '—',
      '18 Aug 2026 02:13:24Z',
    ]);
    expect(text(element.querySelector('[data-caption]'))).toBe(
      `${recorded.length} network${recorded.length === 1 ? '' : 's'}`,
    );
  });

  it.skipIf(!NODE_RECORDED)(
    'marks an internal network and lists its labels sorted by key',
    async () => {
      // The recorded network as a runner's lease bridge: internal, labelled.
      const [network] = networksOf(SWARM) as Record<string, unknown>[];
      const bridge = {
        ...network,
        name: 'lease-bridge',
        internal: true,
        labels: { 'qits.system.runner': 'd2616b57', a: 'b' },
      };
      const { element } = await render([bridge]);
      expect(element.querySelector('ui-chip[label="internal"]')).not.toBeNull();
      expect([...element.querySelectorAll('[data-labels] li')].map((label) => text(label))).toEqual(
        ['a=b', 'qits.system.runner=d2616b57'],
      );
    },
  );

  it.skipIf(!NODE_RECORDED)('says a node listing no networks lists none', async () => {
    const empty = isRecorded(NO_NETWORKS, 'listNodeNetworks', systemGoldenMasters)
      ? networksOf(NO_NETWORKS)
      : networksOf(SWARM).slice(0, 0);
    const { element } = await render(empty);
    expect(text(element.querySelector('[role="status"]'))).toBe(
      'This node lists no networks; a running docker daemon always has bridge, host and none.',
    );
    expect(element.querySelector('table')).toBeNull();
  });

  it.skipIf(!NODE_RECORDED)('says a 409 is another node, never a load failure', async () => {
    const recorded = isRecorded(REMOTE, 'listNodeNetworks', systemGoldenMasters);
    const body = recorded ? systemGoldenMasters.body(REMOTE, 'listNodeNetworks') : null;
    const { element } = await render(body, 409);
    expect(text(element.querySelector('[data-remote]'))).toMatch(
      /^Only the node qits-system runs on can be read; this is another node\./,
    );
    if (recorded) {
      expect(text(element.querySelector('[data-remote-message]'))).toBe(
        'only the local node is reachable in this version',
      );
    }
    const failure = element.querySelector('ui-load-failure');
    expect(failure).toBeNull();
  });

  it.skipIf(!NODE_RECORDED)('says a 403 is a missing role', async () => {
    const { element } = await render(null, 403);
    expect(text(element.querySelector('[role="alert"]'))).toContain(
      'Reading the swarm needs an admin role',
    );
    expect(element.querySelector('ui-load-failure')).toBeNull();
  });

  it.skipIf(!NODE_RECORDED)('says a 503 cannot be read right now, with Retry', async () => {
    const { element } = await render(null, 503);
    const failure = element.querySelector('ui-load-failure');
    expect(failure?.classList.contains('hidden')).toBe(false);
    expect(text(failure)).toContain('The node’s networks cannot be read right now.');
  });

  it.skipIf(!NODE_RECORDED)('reads the networks again on Refresh', async () => {
    const { fixture, element } = await render(networksOf(SWARM));
    const refresh = [...element.querySelectorAll('button')].find(
      (button) => text(button) === 'Refresh',
    );
    refresh!.click();
    await drawn(fixture);
    http.expectOne(URL).flush(networksOf(SWARM));
    await drawn(fixture);
    expect(cells(element)).toHaveLength(networksOf(SWARM).length);
  });
});
