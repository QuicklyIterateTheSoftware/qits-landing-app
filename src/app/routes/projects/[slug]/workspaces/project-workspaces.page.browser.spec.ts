import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../api/workspaces/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { ProjectWorkspacesPage } from './project-workspaces.page';
import { answerCampaignReads, campaignsIn } from '../../../../../testing/campaign-reads';
import { goldenMaster } from '../../../../../testing/browser/golden-master';

/**
 * Screenshots of a project's Workspaces page. The project is qits-projects' recorded one ("a
 * project exists", slug `contract-00000001`) and its wrapper the one "a project with repositories
 * in components" names. The slots and agents are qits-workspaces' "a project with workspace slots
 * hosting agents", answered to the page's read by that wrapper's id (the two providers' frozen ids
 * are unrelated): its agents work on `contract-00000001-…` items, so they are the project's. One
 * slot on runner `localhost`; the bug ticket's agent holds it and waits on a release request, the
 * epic's yielded it, the improvement ticket's is queued.
 *
 * The "New agent" form offers the project's work, qits-projects' "a bug ticket in detail" (its
 * campaign described by "a campaign in detail"); the agent made for the bug ticket
 * `contract-00000001-10` is qits-workspaces' "a workspace slot hosting agents" answer (the item's
 * agent, `fresh: false`), and the item's agent page opens.
 *
 * The clock is pinned four minutes after the recordings' instants, so the wait reads "4m ago". The
 * event stream never connects.
 */

const WORKSPACES = 'a project with workspace slots hosting agents';
const WORKSPACES_SLOT = 'a workspace slot hosting agents';
const REPOSITORIES = 'a project with repositories in components';
const WORK = 'a bug ticket in detail';
const ITEM = 'contract-00000001-10';
const NOW = new Date('2026-01-01T00:04:00Z');

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ProjectWorkspacesPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/workspaces', component: ProjectWorkspacesPage },
          { path: 'projects/:slug/work/detail/:id/agent', children: [] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    vi.useRealTimers();
    await page.viewport(800, 600);
  });

  async function render() {
    await page.viewport(900, 900);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/workspaces`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    TestBed.tick();
    await settle();
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return { harness, element, project };
  }

  async function answered(harness: RouterTestingHarness) {
    await settle();
    TestBed.tick();
    await settle();
    harness.fixture.detectChanges();
  }

  /** Answers the project's work, which the "New agent" form offers, and its campaign's reads. */
  async function answerWork(harness: RouterTestingHarness, projectId: string) {
    const work = await goldenMaster(WORK, 'listProjectWork');
    http.expectOne(`/projects/api/projects/${projectId}/work`).flush(work);
    await answered(harness);
    await answerCampaignReads(http, goldenMaster, campaignsIn(work), {
      members: WORK,
      described: ['a campaign in detail'],
    });
  }

  /**
   * Answers the wrapper, then the project's work (the form, drawn once the wrapper is known, offers
   * it), its slots and the project's agents; gives the wrapper's id.
   */
  async function answerSlots(harness: RouterTestingHarness, projectId: string) {
    const repositories = await goldenMaster(REPOSITORIES, 'listProjectRepositories');
    http.expectOne(`/projects/api/projects/${projectId}/repositories`).flush(repositories);
    await answered(harness);
    const wrapper = repositories.wrapper.repositoryId as string;
    await answerWork(harness, projectId);
    http
      .expectOne(`/workspaces/api/workspaces?repositoryId=${wrapper}`)
      .flush(await goldenMaster(WORKSPACES, 'listWorkspaces', 'qits-workspaces'));
    http
      .expectOne('/workspaces/api/agents')
      .flush(await goldenMaster(WORKSPACES, 'listAgents', 'qits-workspaces'));
    await answered(harness);
    return wrapper;
  }

  it('lists the project’s agents, with what each waits on, and its slots', async () => {
    const { harness, element, project } = await render();
    await answerSlots(harness, project.id);
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('heading', { name: 'Agents' })).toBeVisible();
    await expect
      .element(view.getByRole('link', { name: 'contract-00000001-10' }))
      .toHaveAttribute('href', `/projects/${project.slug}/work/detail/contract-00000001-10/agent`);
    await expect
      .element(view)
      .toMatchTextContent(
        'waiting on release-request 00000000-0000-4000-8000-0000000000c1 · 4m ago',
      );
    await expect.element(view).toMatchTextContent('queued — no free slot yet');
    await expect.element(view).not.toMatchTextContent('waiting on you');
    await expect
      .element(view.getByRole('link', { name: /ws-contract/ }))
      .toHaveAttribute('href', `/projects/${project.slug}/workspaces/1`);
    await expect.element(view).toMatchTextContent('placed on a runner');
    await expect.element(view).toMatchScreenshot('slots-and-agents');
  });

  it('marks the page as loading, then as failed to load', async () => {
    const { harness, element, project } = await render();
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('loading');
    http
      .expectOne(`/projects/api/projects/${project.id}/repositories`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await answered(harness);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('error');
  });

  it('creates an agent for a ticket from the New agent form, and opens it', async () => {
    const { harness, element, project } = await render();
    const wrapper = await answerSlots(harness, project.id);
    const view = page.elementLocator(element);
    const form = view.getByRole('region', { name: 'New agent' });
    await form.getByRole('combobox', { name: 'Work item' }).fill(ITEM);
    await form.getByRole('combobox', { name: 'Harness' }).selectOptions('claude');
    await form
      .getByRole('textbox', { name: 'First instruction (optional)' })
      .fill('Start with the rounding in the totals.');
    await form.getByRole('checkbox', { name: /Enable docker socket/ }).click();
    harness.fixture.detectChanges();
    await expect.element(form.getByRole('button', { name: 'Create agent' })).toBeEnabled();
    await expect.element(form).toMatchScreenshot('create-form');
    await form.getByRole('button', { name: 'Create agent' }).click();
    await settle();
    const request = http.expectOne('/workspaces/api/agents');
    const work = await goldenMaster(WORK, 'listProjectWork');
    expect(request.request.body).toEqual({
      repositoryId: wrapper,
      workId: work.entities.find((e: { qualifiedId: string }) => e.qualifiedId === ITEM).id,
      entityId: ITEM,
      kind: 'TICKET',
      admin: true,
      harness: 'CLAUDE',
      instruction: 'Start with the rounding in the totals.',
    });
    request.flush(await goldenMaster(WORKSPACES_SLOT, 'createAgent', 'qits-workspaces'));
    await answered(harness);
    // The list is read again, and the item's agent page opens.
    http
      .expectOne(`/workspaces/api/workspaces?repositoryId=${wrapper}`)
      .flush(await goldenMaster(WORKSPACES, 'listWorkspaces', 'qits-workspaces'));
    http
      .expectOne('/workspaces/api/agents')
      .flush(await goldenMaster(WORKSPACES, 'listAgents', 'qits-workspaces'));
    await answered(harness);
    expect(TestBed.inject(Router).url).toBe(`/projects/${project.slug}/work/detail/${ITEM}/agent`);
  });
});
