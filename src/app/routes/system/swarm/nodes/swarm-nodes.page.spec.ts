import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { NEVER } from 'rxjs';
import { client as systemClient } from '../../../../api/system/client.gen';
import { provideHeyApiClient } from '../../../../api/system/client/client.gen';
import type { SwarmNode } from '$core/system/swarm.consumes';
import { systemGoldenMaster } from '../../../../../testing/golden-masters';
import { SwarmNodesPage } from './swarm-nodes.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const NODES = '/system/api/swarm/nodes';

/** The recorded swarm: one node, `fake-host`, the manager and Leader qits-system runs on. */
const recorded = (): SwarmNode[] =>
  systemGoldenMaster<SwarmNode[]>('a single-node swarm', 'listSwarmNodes');

/**
 * The swarm nodes page (qits-2346) on answers its screenshots cannot show yet, each derived from
 * qits-system's recorded swarm ("a single-node swarm"): an empty listing (the recording with no
 * rows), and the tones and dashes a node other than the recorded Leader draws (the recorded row
 * with its fields changed: a worker that is Down and drained, not the one qits-system runs on).
 * The page has no `refreshOn`; the live stream is one that never sends.
 */
describe('SwarmNodesPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        // Each row's hostname links the node's page (qits-2347).
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(systemClient),
        { provide: QITS_DOMAIN_EVENTS, useValue: { on: () => NEVER } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Runs the page's effects and lets the client build its request. */
  async function ticked() {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      await settle();
    }
  }

  /** The page, its one read answered with `answer`; the page's element. */
  async function shown(answer: SwarmNode[]): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(SwarmNodesPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(NODES).flush(answer);
    await ticked();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** Each cell's text of the table's rows. */
  const cells = (element: HTMLElement) =>
    [...element.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => text(cell)),
    );

  it('lists the recorded node, marked as the one qits-system runs on, with no Address', async () => {
    const element = await shown(recorded());
    expect([...element.querySelectorAll('thead th')].map((heading) => text(heading))).toEqual([
      'Hostname',
      'ID',
      'Role',
      'Status',
      'Availability',
      'Manager',
      'Engine',
    ]);
    expect(cells(element)).toEqual([
      ['fake-host this node', 'iwbwrdui2z0n', 'manager', 'Ready', 'Active', 'Leader', '29.7.2'],
    ]);
    // The whole id on hover.
    expect(element.querySelector('tbody td[title]')?.getAttribute('title')).toBe(
      'iwbwrdui2z0n62kqcjfo1erwh',
    );
    expect(text(element.querySelector('[data-lede]'))).toBe('1 node');
  });

  it('says a manager listing no nodes lists none, with no table', async () => {
    // The recording with no rows: what the door answers for a manager listing none.
    const element = await shown(recorded().slice(0, 0));
    expect(text(element.querySelector('[role="status"]'))).toBe(
      'The swarm manager lists no nodes.',
    );
    expect(element.querySelector('table')).toBeNull();
    expect(text(element.querySelector('[data-lede]'))).toBe('0 nodes');
  });

  it('draws a worker that is down and drained, not this node, with dashes for what it lacks', async () => {
    const [node] = recorded();
    const element = await shown([
      node,
      {
        ...node,
        id: 'q3zk0n5d1x8a7m2p4r6t9v0wy',
        hostname: 'worker-1',
        role: 'worker',
        status: 'Down',
        availability: 'Drain',
        managerStatus: '',
        engineVersion: '',
        self: false,
      },
    ]);
    expect(cells(element)[1]).toEqual([
      'worker-1',
      'q3zk0n5d1x8a',
      'worker',
      'Down',
      'Drain',
      '—',
      '—',
    ]);
    // Only the node qits-system runs on is marked.
    expect(
      element.querySelectorAll('tbody tr')[1].querySelector('ui-chip[label="this node"]'),
    ).toBeNull();
    expect(text(element.querySelector('[data-lede]'))).toBe('2 nodes');
  });

  it('says a 503 is the swarm not answering, and a 403 a missing role', async () => {
    const fixture = TestBed.createComponent(SwarmNodesPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(NODES).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await ticked();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element.querySelector('ui-load-failure'))).toContain(
      'The swarm cannot be read right now.',
    );

    const refused = TestBed.createComponent(SwarmNodesPage);
    refused.detectChanges();
    await ticked();
    http.expectOne(NODES).flush(null, { status: 403, statusText: 'Forbidden' });
    await ticked();
    refused.detectChanges();
    const refusal = refused.nativeElement as HTMLElement;
    expect(text(refusal.querySelector('[role="alert"]'))).toContain(
      'Reading the swarm needs an admin role',
    );
    expect(refusal.querySelector('ui-load-failure')).toBeNull();
  });
});
