import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { NEVER } from 'rxjs';
import { client as systemClient } from '../../../../../api/system/client.gen';
import { provideHeyApiClient } from '../../../../../api/system/client/client.gen';
import type { SwarmNodeDetail, SwarmNodeTask } from '$core/system/swarm.consumes';
import { isRecorded, systemGoldenMasters } from '../../../../../../testing/golden-masters';
import { cpuCount, memorySize, nodeLabelPairs, SwarmNodePage } from './swarm-node.page';

/**
 * One swarm node's page (qits-2347), its two reads answered with qits-system's recordings: "a
 * single-node swarm" (`fake-host`, Ready, Active, the Leader qits-system runs on, two labels, two
 * tasks, the second Failed and shut down with its error) and "a swarm node running no tasks" (the
 * same node, `[]`); each skips itself until the `@qits/system-golden-masters` pin records it.
 * What no recording holds is derived from the recorded node and says how: a worker with no labels
 * and no address, the tasks read failing on its own. A 404, a 403 and a 503 are statuses only.
 */
const SWARM = 'a single-node swarm';
const NO_TASKS = 'a swarm node running no tasks';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const nodeOf = (state: string) => systemGoldenMasters.body<SwarmNodeDetail>(state, 'getSwarmNode');
const tasksOf = (state: string) =>
  systemGoldenMasters.body<SwarmNodeTask[]>(state, 'listSwarmNodeTasks');

/** The node every state recorded its reads for (its `nodeId`). */
const NODE = 'iwbwrdui2z0n62kqcjfo1erwh';

const RECORDED = isRecorded(SWARM, 'listSwarmNodeTasks', systemGoldenMasters);

@Component({ template: 'stub' })
class Stub {}

describe('SwarmNodePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'system/swarm/nodes/:id', component: SwarmNodePage },
          { path: 'system/swarm/nodes', component: Stub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(systemClient),
        // The page has no `refreshOn`; a stream that never sends.
        { provide: QITS_DOMAIN_EVENTS, useValue: { on: () => NEVER } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Lets the requests go out and the page draw. */
  async function answered(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
      harness.fixture.detectChanges();
    }
  }

  type Answer = { body: object | null; status?: number };

  /** The page of node `id`, its reads answered with `node` and `tasks`. */
  async function render(id: string, node: Answer, tasks: Answer) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/system/swarm/nodes/${id}`);
    await answered(harness);
    for (const [url, answer] of [
      [`/system/api/swarm/nodes/${id}`, node],
      [`/system/api/swarm/nodes/${id}/tasks`, tasks],
    ] as const) {
      const read = http.expectOne(url);
      if ((answer.status ?? 200) === 200) read.flush(answer.body);
      else read.flush(answer.body, { status: answer.status!, statusText: 'Error' });
    }
    await answered(harness);
    return { harness, element: harness.routeNativeElement as HTMLElement };
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** The cells of each body row of the tasks table. */
  const cells = (element: HTMLElement) =>
    [...element.querySelectorAll('table[aria-label="Tasks"] tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => text(cell)),
    );

  it('formats CPUs as docker counts them and memory in binary units', () => {
    expect(cpuCount(8)).toBe('8');
    expect(cpuCount(8.0)).toBe('8');
    expect(cpuCount(undefined)).toBe('—');
    expect(memorySize(16379617280)).toBe('15.3 GiB');
    expect(memorySize(undefined)).toBe('—');
    expect(nodeLabelPairs({ zone: 'fsn1', 'qits.edge': 'true' })).toEqual([
      'qits.edge=true',
      'zone=fsn1',
    ]);
  });

  it.skipIf(!RECORDED)('shows the recorded node, its labels and its tasks', async () => {
    const { element } = await render(NODE, { body: nodeOf(SWARM) }, { body: tasksOf(SWARM) });
    expect(text(element.querySelector('h1'))).toBe('fake-host');
    expect(text(element.querySelector('[data-id]'))).toBe(NODE);
    expect(element.querySelector('ui-chip[label="this node"]')).not.toBeNull();
    expect(text(element.querySelector('[data-status]'))).toBe('Ready');
    expect(element.querySelector('[data-status]')?.className).toContain('bg-success-soft');
    expect(text(element.querySelector('[data-availability]'))).toBe('Active');
    expect(text(element.querySelector('[data-manager]'))).toBe('Leader');
    const facts = [...element.querySelectorAll('dl[aria-label="Facts"] > *')].map((cell) =>
      text(cell),
    );
    expect(facts).toEqual([
      'Role',
      'manager',
      'Engine',
      '29.7.2',
      'OS',
      'linux',
      'Architecture',
      'x86_64',
      'CPUs',
      '24',
      'Memory',
      '31.2 GiB',
      'Address',
      '192.168.152.4',
      'Joined',
      '8 Aug 2026 07:04:02Z',
    ]);
    expect([...element.querySelectorAll('[data-labels] li')].map((label) => text(label))).toEqual([
      'qits.edge=true',
      'zone=fsn1',
    ]);
    const tasks = cells(element);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].slice(0, 5)).toEqual([
      'dev-qits-artifacts.1',
      '1',
      'Running 4 hours ago',
      'Running',
      '—',
    ]);
    expect(tasks[1].slice(0, 5)).toEqual([
      'dev-qits-artifacts.1',
      '1',
      'Failed 5 hours ago',
      'Shutdown',
      'task: non-zero exit (1)',
    ]);
    const errors = [...element.querySelectorAll<HTMLElement>('[data-error]')];
    expect(errors.map((cell) => cell.classList.contains('text-danger'))).toEqual([false, true]);
    expect(text(element.querySelector('[data-caption]'))).toMatch(/^2 tasks .*history/);
  });

  it.skipIf(!isRecorded(NO_TASKS, 'listSwarmNodeTasks', systemGoldenMasters))(
    'says swarm runs no task on a node running none',
    async () => {
      const { element } = await render(
        NODE,
        { body: nodeOf(NO_TASKS) },
        { body: tasksOf(NO_TASKS) },
      );
      expect(text(element.querySelector('[role="status"]'))).toBe(
        'Swarm runs no task on this node.',
      );
      expect(element.querySelector('table[aria-label="Tasks"]')).toBeNull();
    },
  );

  it.skipIf(!RECORDED)(
    'draws a worker with no labels, no address and no manager status, not this node',
    async () => {
      // The recorded node with the fields a worker another host runs lacks.
      const worker = {
        ...nodeOf(SWARM),
        hostname: 'worker-1',
        role: 'worker',
        managerStatus: '',
        address: '',
        labels: {},
        self: false,
      };
      const { element } = await render(NODE, { body: worker }, { body: tasksOf(SWARM) });
      expect(text(element.querySelector('h1'))).toBe('worker-1');
      expect(text(element.querySelector('[data-manager]'))).toBe('—');
      expect(text(element.querySelector('[data-address]'))).toBe('—');
      expect(text(element.querySelector('[data-labels]'))).toBe('No labels.');
      expect(element.querySelector('ui-chip[label="this node"]')).toBeNull();
    },
  );

  it.skipIf(!RECORDED)('keeps the node’s facts when its tasks cannot be read', async () => {
    const { element } = await render(NODE, { body: nodeOf(SWARM) }, { body: null, status: 503 });
    expect(text(element.querySelector('dl[aria-label="Facts"]'))).toContain('manager');
    const failures = [...element.querySelectorAll('ui-load-failure')].filter(
      (failure) => !failure.classList.contains('hidden'),
    );
    expect(failures.map((failure) => text(failure))).toEqual([
      expect.stringContaining('The swarm cannot be read right now.'),
    ]);
    expect(failures[0].closest('[data-tasks]')).not.toBeNull();
  });

  it('says there is no such node, and shows nothing else', async () => {
    const { element } = await render(
      'no-such-node',
      { body: null, status: 404 },
      { body: null, status: 404 },
    );
    expect(text(element.querySelector('[data-missing]'))).toBe('No swarm node no-such-node.');
    expect(element.querySelector('[data-tasks]')).toBeNull();
    expect(element.querySelector('[data-node]')).toBeNull();
  });

  it('says a 403 is a missing role', async () => {
    const refused = await render(NODE, { body: null, status: 403 }, { body: null, status: 403 });
    expect(text(refused.element.querySelector('[role="alert"]'))).toContain(
      'Reading the swarm needs an admin role',
    );
    expect(refused.element.querySelector('ui-load-failure')).toBeNull();
  });

  it('says a 503 is the swarm not answering, with no tasks section', async () => {
    const unavailable = await render(
      NODE,
      { body: null, status: 503 },
      { body: null, status: 503 },
    );
    expect(text(unavailable.element.querySelector('ui-load-failure'))).toContain(
      'The swarm cannot be read right now.',
    );
    expect(unavailable.element.querySelector('[data-tasks]')).toBeNull();
  });
});
