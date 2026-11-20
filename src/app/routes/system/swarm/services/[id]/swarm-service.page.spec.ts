import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { filter, Subject } from 'rxjs';
import { client as systemClient } from '../../../../../api/system/client.gen';
import { provideHeyApiClient } from '../../../../../api/system/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { concernsSwarmService } from '$core/system/swarm-service';
import type { SwarmServiceDetail } from '$core/system/swarm-service.consumes';
import { isRecorded, systemGoldenMasters } from '../../../../../../testing/golden-masters';
import { healthcheckLine, labelPairs, SwarmServicePage } from './swarm-service.page';

/**
 * One swarm service's page (qits-2345), its one read answered with qits-system's recordings: "a
 * single-node swarm" (`dev-qits-artifacts`: two env keys, one label, one network, two mounts, two
 * tasks, the second Failed and shut down with its error), "a swarm service with no tasks"
 * (`dev-qits-idle`, `0/0`, no task, no mount, no healthcheck) and "no such swarm service" (404).
 * A refusal (403) and the swarm not answering (503) are statuses only. A task running another
 * image than the service's is no recording's: it is derived from the recorded service.
 */
const SWARM = 'a single-node swarm';
const NO_TASKS = 'a swarm service with no tasks';
const NO_SUCH_SERVICE = 'no such swarm service';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const serviceOf = (state: string) =>
  systemGoldenMasters.body<SwarmServiceDetail>(state, 'getSwarmService');

/** The service `state` recorded its read for (its `serviceId`). */
const idOf = (state: string) =>
  systemGoldenMasters.operation(state, 'getSwarmService').params['serviceId'];

@Component({ template: 'stub' })
class Stub {}

describe('SwarmServicePage', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'system/swarm/services/:id', component: SwarmServicePage },
          { path: 'system/swarm/services', component: Stub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(systemClient),
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
        {
          provide: DomainEvents,
          useValue: {
            on: (names: readonly string[]) =>
              events.pipe(filter((event) => names.includes(event.name ?? ''))),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /** Lets the requests go out and the page draw. */
  async function answered(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
      harness.fixture.detectChanges();
    }
  }

  /** The page of the service `id`, its read answered with `body` at `status`. */
  async function render(id: string, body: object | null, status = 200) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/system/swarm/services/${id}`);
    await answered(harness);
    const read = http.expectOne(`/system/api/swarm/services/${id}`);
    if (status === 200) read.flush(body);
    else read.flush(body, { status, statusText: 'Error' });
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    return { harness, element };
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** The cells of each body row of the table labelled `name`. */
  const cells = (element: HTMLElement, name: string) =>
    [...element.querySelectorAll(`table[aria-label="${name}"] tbody tr`)].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => text(cell)),
    );

  it('shows the recorded service: facts, rollout, keys, labels, mounts, networks and tasks', async () => {
    const service = serviceOf(SWARM);
    const { element } = await render(idOf(SWARM), service);
    expect(text(element.querySelector('h2'))).toBe('dev-qits-artifacts');
    expect(text(element.querySelector('[data-id]'))).toBe(service.id);
    const facts = text(element.querySelector('dl[aria-label="Facts"]'));
    expect(facts).toContain('replicated');
    expect(facts).toContain('1/1');
    expect(facts).toContain('18 Aug 2026 02:32:15Z');
    expect(facts).toContain('23 Aug 2026 12:27:33Z');
    expect(text(element.querySelector('[data-ports]'))).toBe('—');
    const rollout = text(element.querySelector('dl[aria-label="Rollout"]'));
    expect(rollout).toContain('stop-first');
    expect(rollout).toContain('rollback');
    expect(text(element.querySelector('[data-healthcheck]'))).toBe(
      'CMD-SHELL curl -fsS localhost:8080/artifacts/q/health/ready',
    );
    // Keys only, never a value.
    expect([...element.querySelectorAll('[data-env-keys] li')].map((key) => text(key))).toEqual([
      'QITS_ENVIRONMENT',
      'QITS_RESOURCE_DB_PASSWORD',
    ]);
    expect([...element.querySelectorAll('[data-labels] li')].map((label) => text(label))).toEqual([
      'qits.platform.deployments.app-name=qits-artifacts',
    ]);
    expect(cells(element, 'Mounts')).toEqual([
      ['volume', 'dev-qits-artifacts-store', '/data', 'no'],
      ['bind', '/etc/qits/edge', '/etc/qits/edge', 'yes'],
    ]);
    expect(cells(element, 'Networks')).toEqual([['mulnl3uqqi0h', '10.0.1.110/24']]);
    expect(element.querySelector('table[aria-label="Networks"] td')?.getAttribute('title')).toBe(
      'mulnl3uqqi0hkr0yuutakpyed',
    );
    // Both tasks in the served order, the shut-down one too; no image column (both run the
    // service's image) and no Updated column.
    const tasks = cells(element, 'Tasks');
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual(['1', 'fake-host', 'Running 4 hours ago', 'Running', '—']);
    expect(tasks[1].slice(0, 4)).toEqual(['1', 'fake-host', 'Failed 4 hours ago', 'Shutdown']);
    const headers = text(element.querySelector('table[aria-label="Tasks"] thead'));
    expect(headers).not.toContain('Updated');
    expect(element.querySelector('[data-image-column]')).toBeNull();
    const errors = [...element.querySelectorAll<HTMLElement>('[data-error]')];
    expect(errors.map((cell) => cell.classList.contains('text-danger'))).toEqual([false, true]);
    expect(text(errors[1])).toContain('No such container');
  });

  it('shows a task’s image only where it is not the service’s', async () => {
    // The recorded service, its second task moved to another image (a rollout half done).
    const service = serviceOf(SWARM);
    const tasks = service.tasks ?? [];
    tasks[1] = { ...tasks[1], image: 'registry.dev.localhost:8080/qits/qits-artifacts:0ld1234' };
    const { element } = await render(idOf(SWARM), service);
    expect(element.querySelector('[data-image-column]')).not.toBeNull();
    const rows = cells(element, 'Tasks');
    expect(rows[0].at(-1)).toBe('—');
    expect(rows[1].at(-1)).toBe('registry.dev.localhost:8080/qits/qits-artifacts:0ld1234');
  });

  it.skipIf(!isRecorded(NO_TASKS, 'getSwarmService', systemGoldenMasters))(
    'says swarm placed no task, and that the service mounts nothing',
    async () => {
      const { element } = await render(idOf(NO_TASKS), serviceOf(NO_TASKS));
      expect(text(element.querySelector('h2'))).toBe('dev-qits-idle');
      expect(text(element.querySelector('[data-no-tasks]'))).toBe(
        'Swarm has placed no task for this service. For a replicated service that is a ' +
          'scheduling problem, not an empty list.',
      );
      expect(element.querySelector('table[aria-label="Tasks"]')).toBeNull();
      expect(text(element.querySelector('[data-no-mounts]'))).toBe('This service mounts nothing.');
      expect(text(element.querySelector('[data-healthcheck]'))).toBe('—');
    },
  );

  it.skipIf(!isRecorded(NO_SUCH_SERVICE, 'getSwarmService', systemGoldenMasters))(
    'says there is no such service on a 404',
    async () => {
      const id = idOf(NO_SUCH_SERVICE);
      const { element } = await render(
        id,
        systemGoldenMasters.body(NO_SUCH_SERVICE, 'getSwarmService'),
        404,
      );
      expect(text(element.querySelector('[data-missing]'))).toBe(`No swarm service ${id}.`);
      expect(element.querySelector('ui-load-failure')).toBeNull();
      expect(element.querySelector('[data-service]')).toBeNull();
    },
  );

  it('says a 403 needs an admin role', async () => {
    const refused = await render(idOf(SWARM), null, 403);
    expect(text(refused.element.querySelector('[role="alert"]'))).toContain(
      'Reading the swarm needs an admin role',
    );
    expect(refused.element.querySelector('ui-load-failure')).toBeNull();
  });

  it('says a 503 is the swarm not answering', async () => {
    const unavailable = await render(idOf(SWARM), null, 503);
    expect(text(unavailable.element.querySelector('ui-load-failure'))).toContain(
      'The swarm cannot be read right now.',
    );
  });

  it('reads the service again after a deployment of its application, and only then', async () => {
    const { harness } = await render(idOf(SWARM), serviceOf(SWARM));
    vi.useFakeTimers();
    events.next({
      name: 'DeploymentActive',
      payload: JSON.stringify({ applicationName: 'qits-ci', version: '2026.1120.1' }),
    });
    await vi.advanceTimersByTimeAsync(REFRESH_DEBOUNCE_MS + 10);
    vi.useRealTimers();
    await answered(harness);
    http.expectNone(`/system/api/swarm/services/${idOf(SWARM)}`);

    vi.useFakeTimers();
    events.next({
      name: 'DeploymentFailed',
      payload: JSON.stringify({ applicationName: 'qits-artifacts', version: '2026.1120.1' }),
    });
    await vi.advanceTimersByTimeAsync(REFRESH_DEBOUNCE_MS + 10);
    vi.useRealTimers();
    await answered(harness);
    http.expectOne(`/system/api/swarm/services/${idOf(SWARM)}`).flush(serviceOf(SWARM));
  });

  it('follows every deployment while the service carries no application label', () => {
    const event = { name: 'DeploymentActive', payload: JSON.stringify({ applicationName: 'x' }) };
    expect(concernsSwarmService(event, undefined)).toBe(true);
    expect(concernsSwarmService(event, { labels: {} })).toBe(true);
    expect(
      concernsSwarmService(event, {
        labels: { 'qits.platform.deployments.app-name': 'qits-artifacts' },
      }),
    ).toBe(false);
  });

  it('sorts the labels by key and joins a healthcheck', () => {
    expect(labelPairs({ b: '2', a: '1' })).toEqual(['a=1', 'b=2']);
    expect(labelPairs(undefined)).toEqual([]);
    expect(healthcheckLine(['CMD', 'true'])).toBe('CMD true');
    expect(healthcheckLine([])).toBe('—');
  });
});
