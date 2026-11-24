import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { filter, Subject } from 'rxjs';
import { client as maintenanceClient } from '../../../../../../api/maintenance/client.gen';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { goldenMaster, maintenanceGoldenMaster } from '../../../../../../../testing/golden-masters';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { RepositoryDependsOnPage } from './repository-depends-on.page';

/**
 * A repository's Depends on page (qits-2489, the top half of qits-2334's repository page), its two
 * reads answered with qits-maintenance's recordings: "a repository with pins and bumps"
 * (contract-javalib: internal, external, REACTOR and UNRESOLVED pins, two pending, a behind
 * transitive, a RUNNING, a SUCCEEDED and a NOTHING_TO_DO bump), "a repository with nothing pinned"
 * (contract-service, OK and empty) and "no such repository" (contract-unknown-service: a 404, no
 * bumps). The open project is qits-projects' recorded one.
 */
const PINS_AND_BUMPS = 'a repository with pins and bumps';
const NOTHING_PINNED = 'a repository with nothing pinned';
const MISSING = 'no such repository';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

@Component({ template: 'stub' })
class Stub {}

describe('RepositoryDependsOnPage', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;
  const recorded = (state: string, operationId: string) =>
    maintenanceGoldenMaster(state, operationId);
  const nameOf = (state: string) =>
    state === MISSING ? 'contract-unknown-service' : recorded(state, 'getRepository').name;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/components/:repo/depends-on',
            component: RepositoryDependsOnPage,
          },
          { path: 'projects/:slug/components/:repo/bumps/:bumpId', component: Stub },
          { path: 'projects/:slug/releases/requests/:requestId', component: Stub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(maintenanceClient),
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

  const repositoryUrl = (name: string) => `/maintenance/api/repositories/${name}`;
  const bumpsUrl = (name: string) => `/maintenance/api/bumps?repository=${name}&limit=20`;

  /** Answers the two reads of `name` with `state`'s recordings, or with `status` (no body). */
  function answer(state: string, name: string, status = 200) {
    const reply = (url: string, operationId: string, code: number) => {
      const read = http.expectOne(url);
      if (code === 200) read.flush(recorded(state, operationId));
      else read.flush(null, { status: code, statusText: 'Error' });
    };
    reply(repositoryUrl(name), 'getRepository', state === MISSING ? 404 : status);
    reply(bumpsUrl(name), 'listBumps', status);
  }

  /** The page of the repository `state` recorded, its two reads answered. */
  async function render(state: string, status = 200) {
    const name = nameOf(state);
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/components/${name}/depends-on`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    answer(state, name, status);
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    return { harness, element, name };
  }

  /** The alerts shown: none inside a hidden element (`ui-load-failure` hidden keeps its own). */
  const alerts = (element: HTMLElement) =>
    [...element.querySelectorAll<HTMLElement>('[role="alert"]')].filter(
      (alert) => !alert.closest('.hidden'),
    );

  const text = (element: Element | null | undefined, selector?: string) =>
    (selector ? element?.querySelector(selector) : element)?.textContent
      ?.replace(/\s+/g, ' ')
      .trim() ?? '';

  it('shows the heading: the name, the status as a chip and the last scan', async () => {
    const { element, name } = await render(PINS_AND_BUMPS);
    expect(text(element, 'h2')).toBe(name);
    expect(text(element, '[data-status]')).toBe('OK');
    expect(text(element, '[data-scanned]')).toMatch(/^scanned /);
    // No Groups panel: the recording has two groups, the page shows neither.
    expect(element.textContent).not.toContain('Groups');
    expect(alerts(element)).toEqual([]);
  });

  it('shows internal and external pins in their own tables, pending first', async () => {
    const { element } = await render(PINS_AND_BUMPS);
    const rows = (table: string) =>
      [...element.querySelectorAll(`table[aria-label="${table} pins"] tbody tr`)].map((row) =>
        text(row),
      );
    const internal = rows('Internal');
    expect(internal).toHaveLength(2);
    expect(internal[0]).toContain('eu.wohlben.qits:qits-eventstream');
    expect(internal[0]).toContain('pending');
    expect(internal[1]).toContain('eu.wohlben.qits:qits-arch-rules');
    expect(internal[1]).not.toContain('pending');
    const external = rows('External');
    expect(external).toHaveLength(2);
    expect(external[0]).toContain('io.quarkus.platform:quarkus-bom');
    expect(external[0]).toContain('3.40.1');
    expect(external[0]).toContain('pending');
  });

  it('puts reactor and unresolved pins in a collapsed disclosure with their count', async () => {
    const { element } = await render(PINS_AND_BUMPS);
    const details = element.querySelector<HTMLDetailsElement>('[data-other-pins]')!;
    expect(details.open).toBe(false);
    expect(text(details, 'summary')).toBe('Reactor and unresolved pins (2)');
    const names = text(details);
    expect(names).toContain('eu.wohlben.qits:contract-api');
    expect(names).toContain('org.example:mystery');
  });

  it('lists only behind transitives, under their pin’s table, with the total', async () => {
    const { element } = await render(PINS_AND_BUMPS);
    const internal = element.querySelector('[data-pin-table="internal"] [data-transitives]')!;
    expect(text(internal, 'p')).toBe('2 transitives, 1 behind');
    const behind = [...internal.querySelectorAll('li')].map((li) => text(li));
    expect(behind).toHaveLength(1);
    expect(behind[0]).toContain('com.fasterxml.jackson.core:jackson-databind');
    expect(element.textContent).not.toContain('org.slf4j:slf4j-api');
    expect(element.querySelector('[data-pin-table="external"] [data-transitives]')).toBeNull();
  });

  it('links each bump to its page under the repository and a uuid release request to its page', async () => {
    const { element, name } = await render(PINS_AND_BUMPS);
    const bumps = recorded(PINS_AND_BUMPS, 'listBumps');
    const rows = [...element.querySelectorAll('table[aria-label="Recent bumps"] tbody tr')];
    expect(rows).toHaveLength(bumps.length);
    rows.forEach((row, i) => {
      const status = row.querySelector<HTMLAnchorElement>('td a')!;
      expect(status.getAttribute('href')).toBe(
        `/projects/${project.slug}/components/${name}/bumps/${bumps[i].id}`,
      );
      expect(text(row)).toContain(bumps[i].group);
    });
    expect(text(rows[0], '[data-release-request]')).toBe('none');
    const request = rows[1].querySelector<HTMLAnchorElement>('[data-release-request] a')!;
    expect(request.getAttribute('href')).toBe(
      `/projects/${project.slug}/releases/requests/${bumps[1].releaseRequestId}`,
    );
    // The changes count: the RUNNING bump sends one, the others none.
    expect(text(rows[0].querySelectorAll('td')[4])).toBe('1');
    expect(text(rows[1])).toContain('committed the dependency bump');
  });

  it('says pins and bumps are empty for a repository with nothing pinned', async () => {
    const { element, name } = await render(NOTHING_PINNED);
    expect(text(element, '[data-no-pins]')).toBe(`No pins were read for ${name}.`);
    expect(text(element, '[data-no-bumps]')).toBe(`No bumps of ${name} yet.`);
    expect(element.querySelector('[data-other-pins]')).toBeNull();
    expect(alerts(element)).toEqual([]);
  });

  it('says only that an unknown repository is not in the inventory on a 404', async () => {
    const { element, name } = await render(MISSING);
    expect(text(element, '[data-missing]')).toBe(`No repository ${name} in the inventory.`);
    expect(element.querySelector('[data-repository]')).toBeNull();
    expect(element.querySelector('[data-no-bumps]')).toBeNull();
    expect(element.querySelector('ui-load-failure')?.className).toContain('hidden');
  });

  it('says a refusal needs a staff role on a 403, not an empty page', async () => {
    const { element } = await render(PINS_AND_BUMPS, 403);
    const [alert] = alerts(element);
    expect(alert.textContent).toContain('Reading a repository needs a staff role');
    expect(element.querySelector('ui-load-failure')?.className).toContain('hidden');
    expect(element.querySelector('[data-missing]')).toBeNull();
    expect(element.querySelector('[data-repository]')).toBeNull();
  });

  it('offers Retry when the repository read fails otherwise', async () => {
    const { element } = await render(PINS_AND_BUMPS, 500);
    expect(element.querySelector('ui-load-failure')?.className).not.toContain('hidden');
    expect(alerts(element).map((alert) => alert.textContent)).not.toContain(
      expect.stringContaining('staff role'),
    );
  });

  /** Sends a bump event with `payload` and lets the debounce pass. */
  async function bumpEvent(harness: RouterTestingHarness, payload: object) {
    vi.useFakeTimers();
    try {
      events.next({ name: 'SCMRelease', payload: JSON.stringify(payload) } as DomainEvent);
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await answered(harness);
  }

  it('reads the repository and its bumps again after a bump event naming it', async () => {
    const { harness, name } = await render(PINS_AND_BUMPS);
    await bumpEvent(harness, { repository: name });
    http.expectOne(repositoryUrl(name)).flush(recorded(PINS_AND_BUMPS, 'getRepository'));
    http.expectOne(bumpsUrl(name)).flush(recorded(PINS_AND_BUMPS, 'listBumps'));
    await answered(harness);
  });

  it('reads nothing again after a bump event naming another repository', async () => {
    const { harness, name } = await render(PINS_AND_BUMPS);
    await bumpEvent(harness, { repository: 'qits-ci-service' });
    http.expectNone(repositoryUrl(name));
    http.expectNone(bumpsUrl(name));
  });
});
