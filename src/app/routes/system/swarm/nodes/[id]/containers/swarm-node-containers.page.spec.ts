import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { NEVER } from 'rxjs';
import { client as systemClient } from '../../../../../../api/system/client.gen';
import { provideHeyApiClient } from '../../../../../../api/system/client/client.gen';
import type { NodeContainer } from '$core/system/node-containers.consumes';
import { OPEN_SWARM_NODE } from '$core/system/open-swarm-node';
import type { SwarmNodeDetail } from '$core/system/swarm.consumes';
import { isRecorded, systemGoldenMasters } from '../../../../../../../testing/golden-masters';
import { SwarmNodeContainersPage } from './swarm-node-containers.page';

/**
 * A swarm node's Containers tab (qits-2352) on its own, the open node given as `OPEN_SWARM_NODE`
 * (the layout's read), its reads answered with qits-system's recordings: the node of "a
 * single-node swarm" (`self`) and its containers (two rows, running and exited), skipped until the
 * `@qits/system-golden-masters` pin records them at `?all=true`. What no recording holds is derived
 * from them and says how: a node that is not `self` (the recorded node with `self: false`), a date
 * that does not parse, an empty and a truncated log.
 */
const SWARM = 'a single-node swarm';
const NODE = 'iwbwrdui2z0n62kqcjfo1erwh';
const LIST = `/system/api/nodes/${NODE}/containers?all=true`;

const RECORDED =
  isRecorded(SWARM, 'listNodeContainers', systemGoldenMasters) &&
  systemGoldenMasters.operation(SWARM, 'listNodeContainers').query['all'] === 'true';

const nodeOf = () => systemGoldenMasters.body<SwarmNodeDetail>(SWARM, 'getSwarmNode');
const containersOf = () => systemGoldenMasters.body<NodeContainer[]>(SWARM, 'listNodeContainers');

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('SwarmNodeContainersPage', () => {
  let http: HttpTestingController;

  afterEach(() => http.verify());

  /** The tab, the open node `node`, its reads still open. */
  async function render(node: SwarmNodeDetail) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(systemClient),
        { provide: QITS_DOMAIN_EVENTS, useValue: { on: () => NEVER } },
        {
          provide: OPEN_SWARM_NODE,
          useValue: { nodeId: signal(NODE).asReadonly(), node: signal(node).asReadonly() },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SwarmNodeContainersPage);
    await drawn(fixture);
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  async function drawn(fixture: ComponentFixture<unknown>) {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
      fixture.detectChanges();
    }
  }

  it.skipIf(!RECORDED)('reads every container of the node qits-system runs on', async () => {
    const { fixture, element } = await render(nodeOf());
    http.expectOne(LIST).flush(containersOf());
    await drawn(fixture);
    const filter = [...element.querySelectorAll('[aria-label="Show"] button')];
    expect(filter.map((button) => text(button))).toEqual(['Running (1)', 'Stopped (1)', 'All (2)']);
    expect(filter.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(text(element.querySelector('[data-caption]'))).toBe(
      '1 running container, newest first.',
    );
    const rows = element.querySelectorAll('[data-container]');
    expect(rows).toHaveLength(1);
    expect(text(rows[0].querySelector('[data-short-id]'))).toBe('b248472f7a8e');
    expect(rows[0].querySelector('[data-short-id]')?.getAttribute('title')).toHaveLength(64);
    expect(text(rows[0].querySelector('[data-health]'))).toBe('healthy');
    // Docker's `+0200 CEST`, read by its offset: 12:28:51 UTC.
    expect(rows[0].querySelector('[data-created]')?.getAttribute('title')).toBe(
      '23 Aug 2026 12:28:51Z',
    );
  });

  it.skipIf(!RECORDED)('filters to the stopped ones without reading again', async () => {
    const { fixture, element } = await render(nodeOf());
    http.expectOne(LIST).flush(containersOf());
    await drawn(fixture);
    (element.querySelectorAll('[aria-label="Show"] button')[1] as HTMLButtonElement).click();
    await drawn(fixture);
    http.expectNone(() => true);
    const rows = element.querySelectorAll('[data-container]');
    expect(rows).toHaveLength(1);
    expect(text(rows[0].querySelector('[data-state]'))).toBe('exited');
    expect(rows[0].querySelector('[data-state]')?.className).toContain('bg-surface-muted');
    // The exited row's last probe (`unhealthy`) is not shown.
    expect(text(rows[0].querySelector('[data-health]'))).toBe('—');
    expect(text(element.querySelector('[data-caption]'))).toBe(
      '1 stopped container, newest first.',
    );
  });

  it('reads nothing for a node that is not the one qits-system runs on', async () => {
    // Derived: the recorded node, as another node of the swarm (`self: false`); no recording holds
    // a node qits-system does not run on.
    const other = { ...nodeOf(), self: false };
    const { element } = await render(other);
    http.expectNone(() => true);
    expect(text(element.querySelector('[data-remote]'))).toBe(
      'Only the node qits-system runs on can be read; this is another node.',
    );
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelector('[aria-label="Show"]')).toBeNull();
  });

  it.skipIf(!RECORDED)('shows — for a created date docker’s layout does not hold', async () => {
    const { fixture, element } = await render(nodeOf());
    // Derived: the recorded running row, its `createdAt` replaced by a humanized age.
    const [running] = containersOf();
    http.expectOne(LIST).flush([{ ...running, createdAt: '4 hours ago' }]);
    await drawn(fixture);
    const created = element.querySelector('[data-created]');
    expect(text(created)).toBe('—');
    expect(created?.getAttribute('title')).toBeNull();
  });

  it.skipIf(!RECORDED)('says when a log was cut short, or is empty', async () => {
    const { fixture, element } = await render(nodeOf());
    const [running] = containersOf();
    http.expectOne(LIST).flush(containersOf());
    await drawn(fixture);
    (element.querySelector('[data-container] button') as HTMLButtonElement).click();
    await drawn(fixture);
    const logs = `/system/api/nodes/${NODE}/containers/${running.id}/logs?tail=200`;
    // Derived: the recorded tail, cut short, then empty.
    const tail = systemGoldenMasters.body<{ text: string; truncated: boolean }>(
      SWARM,
      'getContainerLogs',
    );
    http.expectOne(logs).flush({ ...tail, truncated: true });
    await drawn(fixture);
    expect(text(element.querySelector('[data-truncated]'))).toBe(
      'The service cut this log short; earlier lines are not shown.',
    );
    expect(text(element.querySelector('[data-log] pre'))).toContain('the last line of the log');
    // Closed, and opened again: a fresh read.
    (element.querySelector('[data-container] button') as HTMLButtonElement).click();
    await drawn(fixture);
    expect(element.querySelector('[data-log]')).toBeNull();
    (element.querySelector('[data-container] button') as HTMLButtonElement).click();
    await drawn(fixture);
    http.expectOne(logs).flush({ text: '', truncated: false });
    await drawn(fixture);
    expect(text(element.querySelector('[data-log-empty]'))).toBe(
      'This container has written nothing to its log.',
    );
  });
});
