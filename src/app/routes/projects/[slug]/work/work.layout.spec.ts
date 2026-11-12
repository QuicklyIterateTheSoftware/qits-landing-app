import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, Subject } from 'rxjs';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../api/workspaces/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { IN_PROGRESS_VIEW_KEY, InProgressViewStore } from '$core/work/in-progress-view';
import { WORK_REFRESH_DEBOUNCE_MS } from '$core/work/selected-work';
import { goldenMaster, workspacesGoldenMaster } from '../../../../../testing/golden-masters';
import { WorkLayout } from './work.layout';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

@Component({ selector: 'app-test-page', template: `<p>Page content</p>` })
class TestPage {}

/** An `EntityTransitioned` payload moving one entity of `projectId`, as qits-projects sends it. */
const transitioned = (projectId: string) =>
  JSON.stringify({
    entities: [{ entityId: 'e-1', projectId, status: 'REFINED', statusBefore: 'REPORTED' }],
  });

/** The open workspaces' read (`WorkspacesStore.load()`), and the state it is answered from. */
const OPEN_WORKSPACES = '/workspaces/api/work/workspaces';
const BOUND = 'a project with workspaces bound to work items';

/**
 * The work section's tabs on qits-projects' golden masters: the project list, and "a project with
 * work in every status" (one epic and one ticket per status) or "a project with no work". The open
 * workspaces come from qits-workspaces' "a project with workspaces bound to work items".
 */
describe('WorkLayout', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;
  const entities = `/projects/api/projects/${project.id}/work`;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/work',
            component: WorkLayout,
            children: ['refinement', 'schedule', 'in-progress', 'acceptance', 'archive'].map(
              (path) => ({
                path,
                component: TestPage,
              }),
            ),
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        {
          provide: DomainEvents,
          // By name, as the service subscribes: each store hears only the names it asks for.
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
    localStorage.clear();
  });

  /** The section at `tab`, with the project list answered and the work requested. */
  async function shown(tab: string) {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/${tab}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    http.expectOne(OPEN_WORKSPACES).flush(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    const element = harness.routeNativeElement as HTMLElement;
    const links = () => [...element.querySelectorAll<HTMLAnchorElement>('nav[aria-label=Work] a')];
    const counts = () =>
      links().map((a) => {
        const count = a.querySelector('span')!;
        return count.classList.contains('hidden') ? undefined : Number(count.textContent);
      });
    const answered = async (state: string) => {
      http.expectOne(entities).flush(goldenMaster(state, 'listProjectWork'));
      await settle();
      await harness.fixture.whenStable();
    };
    return { harness, links, counts, answered };
  }

  it('links the five phases in workflow order, no Campaigns or Milestones, and marks the current one', async () => {
    const { links, answered } = await shown('acceptance');
    await answered('a project with no work');
    expect(links().map((a) => [a.firstChild?.textContent?.trim(), a.getAttribute('href')])).toEqual(
      [
        ['Refinement', `/projects/${project.slug}/work/refinement`],
        ['Schedule', `/projects/${project.slug}/work/schedule`],
        ['In Progress', `/projects/${project.slug}/work/in-progress`],
        ['Acceptance', `/projects/${project.slug}/work/acceptance`],
        ['Archive', `/projects/${project.slug}/work/archive`],
      ],
    );
    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      'page',
      null,
    ]);
  });

  it('counts the epics and tickets on each page once the work is loaded', async () => {
    const { counts, answered } = await shown('in-progress');
    expect(counts()).toEqual([undefined, undefined, undefined, undefined, undefined]);
    await answered('a project with work in every status');
    // Schedule: the REFINED and the READY_FOR_DEV epic and ticket. In Progress: an epic and a
    // ticket per board status (READY_FOR_DEV first), and the started epic; not its feature.
    expect(counts()).toEqual([2, 4, 9, 2, 4]);
  });

  // qits-2051: the In Progress page's view setting, beside (not inside) its tab's link.
  it('shows the view settings’ gear on the In Progress tab only while it is open', async () => {
    const { harness, answered } = await shown('in-progress');
    await answered('a project with no work');
    const element = harness.routeNativeElement as HTMLElement;
    const gear = () =>
      element.querySelector<HTMLButtonElement>(
        'nav[aria-label=Work] button[aria-label="In Progress view settings"]',
      );
    /** Whether the gear shows: hidden by class (on its wrapper), so a server render hydrates. */
    const shownGear = (button = gear()!) =>
      !button.closest('ui-dropdown')!.parentElement!.classList.contains('hidden');
    const tab = gear()!.closest('li')!;
    expect(tab.querySelector('a')!.firstChild?.textContent?.trim()).toBe('In Progress');
    expect(gear()!.closest('a')).toBeNull();
    expect(shownGear()).toBe(true);
    // One gear in the row, one in the phone bar beside the page's name (each shown at its width).
    const gears = [
      ...element.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="In Progress view settings"]',
      ),
    ];
    expect(gears).toHaveLength(2);
    const barGear = gears.find((button) => !button.closest('nav'))!;
    expect(
      barGear
        .closest('ui-dropdown')!
        .parentElement!.previousElementSibling?.firstChild?.textContent?.trim(),
    ).toBe('In Progress');
    expect(shownGear(barGear)).toBe(true);
    // Each its own radio group, or choosing in one would clear the other.
    expect(new Set(radioNames(element))).toHaveProperty('size', 2);
    // Choosing a view applies it at once and keeps it.
    gear()!.click();
    harness.fixture.detectChanges();
    const radios = [...tab.querySelectorAll<HTMLInputElement>('input[type=radio]')];
    expect(
      radios.map((radio) => [radio.parentElement?.textContent?.trim(), radio.checked]),
    ).toEqual([
      ['Epic boards', true],
      ['Inline', false],
    ]);
    radios[1].click();
    harness.fixture.detectChanges();
    expect(TestBed.inject(InProgressViewStore).view()).toBe('inline');
    expect(localStorage.getItem(IN_PROGRESS_VIEW_KEY)).toBe('inline');
    // Another tab open: no gear.
    await harness.navigateByUrl(`/projects/${project.slug}/work/acceptance`);
    await settle();
    harness.fixture.detectChanges();
    expect(shownGear()).toBe(false);
    expect(shownGear(barGear)).toBe(false);
  });

  /** The names of the gears' radios, one per radio. */
  function radioNames(element: HTMLElement) {
    return [...element.querySelectorAll<HTMLInputElement>('input[type=radio]')].map(
      (radio) => radio.name,
    );
  }

  /** The phone bar's burger, its panel's links and the page's name beside it. */
  function phoneBar(element: HTMLElement) {
    const burger = element.querySelector<HTMLButtonElement>('button[aria-label="Work views"]')!;
    const panel = () =>
      element.querySelector<HTMLElement>(`#${burger.getAttribute('aria-controls')}`)!;
    const links = () => [...panel().querySelectorAll<HTMLAnchorElement>('a')];
    const name = () => burger.closest('ui-dropdown')!.nextElementSibling!;
    return { burger, panel, links, name };
  }

  // qits-2077: below md the tabs are a burger's list and the open page's name.
  it('lists the five phases in the phone bar’s menu, each with its count, and marks the current one', async () => {
    const { harness, answered } = await shown('schedule');
    const { burger, links, name } = phoneBar(harness.routeNativeElement as HTMLElement);
    expect(burger.closest('nav')).toBeNull();
    expect(name().firstChild?.textContent?.trim()).toBe('Schedule');
    expect(name().querySelector('span')!.classList.contains('hidden')).toBe(true);
    await answered('a project with work in every status');
    expect(
      links().map((a) => [
        a.firstChild?.textContent?.trim(),
        a.getAttribute('href'),
        a.querySelector('span')!.textContent,
        a.getAttribute('aria-current'),
      ]),
    ).toEqual([
      ['Refinement', `/projects/${project.slug}/work/refinement`, '2', null],
      ['Schedule', `/projects/${project.slug}/work/schedule`, '4', 'page'],
      ['In Progress', `/projects/${project.slug}/work/in-progress`, '9', null],
      ['Acceptance', `/projects/${project.slug}/work/acceptance`, '2', null],
      ['Archive', `/projects/${project.slug}/work/archive`, '4', null],
    ]);
    expect(links().every((a) => a.hasAttribute('data-qits-outcome'))).toBe(true);
    expect(name().textContent?.replace(/\s+/g, ' ').trim()).toBe('Schedule 4');
    expect(name().querySelector('span')!.classList.contains('hidden')).toBe(false);
    // The phone bar's gear shows on In Progress only.
    const barGear = name().nextElementSibling!;
    expect(barGear.querySelector('button')!.getAttribute('aria-label')).toBe(
      'In Progress view settings',
    );
    expect(barGear.classList.contains('hidden')).toBe(true);
  });

  it('closes the phone bar’s menu as one of its links opens its page', async () => {
    const { harness, answered } = await shown('refinement');
    await answered('a project with no work');
    const { burger, panel, links, name } = phoneBar(harness.routeNativeElement as HTMLElement);
    burger.click();
    harness.fixture.detectChanges();
    expect(burger.getAttribute('aria-expanded')).toBe('true');
    expect(panel().classList.contains('hidden')).toBe(false);
    links()[3].click();
    await settle();
    await harness.fixture.whenStable();
    expect(burger.getAttribute('aria-expanded')).toBe('false');
    expect(panel().classList.contains('hidden')).toBe(true);
    expect(TestBed.inject(Router).url).toBe(`/projects/${project.slug}/work/acceptance`);
    expect(name().textContent?.replace(/\s+/g, ' ').trim()).toBe('Acceptance 0');
    expect(links()[3].getAttribute('aria-current')).toBe('page');
  });

  it('asks for the work once while moving between the pages', async () => {
    const { harness, links, answered } = await shown('refinement');
    await answered('a project with work in every status');
    await harness.navigateByUrl(`/projects/${project.slug}/work/archive`);
    await settle();
    http.expectNone(entities);
    http.expectNone(OPEN_WORKSPACES);
    expect(links()[4].getAttribute('aria-current')).toBe('page');
  });

  it('fetches nothing after a transition in another project', async () => {
    const { answered, counts } = await shown('in-progress');
    await answered('a project with work in every status');
    vi.useFakeTimers();
    events.next({ id: '1', name: 'EntityTransitioned', payload: transitioned('another-project') });
    events.next({ id: '2', name: 'EntityTransitioned', payload: '{}' });
    vi.advanceTimersByTime(WORK_REFRESH_DEBOUNCE_MS);
    vi.useRealTimers();
    await settle();
    http.expectNone(entities);
    expect(counts()).toEqual([2, 4, 9, 2, 4]);
    // The open workspaces are `WorkspacesStore.follow`'s, narrowed (or not) on their own.
    for (const read of http.match(OPEN_WORKSPACES)) {
      read.flush(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    }
  });

  it('fetches the work again after a transition, and the counts follow', async () => {
    const { counts, answered } = await shown('in-progress');
    await answered('a project with work in every status');
    vi.useFakeTimers();
    events.next({ id: '1', name: 'EntityTransitioned', payload: transitioned(project.id) });
    vi.advanceTimersByTime(WORK_REFRESH_DEBOUNCE_MS);
    vi.useRealTimers();
    await settle();
    await answered('a project with no work');
    expect(counts()).toEqual([0, 0, 0, 0, 0]);
    // The open workspaces follow qits-workspaces' agent events, not a work item's move (qits-1270).
    http.expectNone(OPEN_WORKSPACES);
  });
});
