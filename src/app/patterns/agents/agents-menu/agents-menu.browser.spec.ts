import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { AgentsMenu } from './agents-menu';
import { goldenMaster } from '../../../../testing/browser/golden-master';

/**
 * Screenshots of the top bar's agents menu (epic qits-1681), its agents qits-workspaces' golden
 * master "a project with agents needing attention": the bug ticket's agent waits on a release
 * request that is already FINALIZED, the epic's agent is blocked with no `@desk` answer, the PDF
 * ticket's agent is idle, the download ticket's agent is overdue on a CI run, and the "remember the
 * format" ticket's agent waits on another item and its comments (not overdue, no badge). The open
 * project is qits-projects' recorded one ("a project exists", slug `contract-00000001`), which the
 * state's entity ids name (the two providers' frozen ids are unrelated). qits-ci's page origin
 * answers the run wait's link; no release request is loaded, so the request wait falls back to its
 * own state and no lifecycle line.
 */

const NEEDING_ATTENTION = 'a project with agents needing attention';

/** The routed page under the menu; it renders nothing. */
@Component({ selector: 'app-test-page', template: `` })
class TestPage {}

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('AgentsMenu (screenshots)', () => {
  let http: HttpTestingController;
  let projectId: string;
  let slug: string;

  beforeEach(async () => {
    const recorded = (await goldenMaster('a project exists', 'getProject')).project;
    projectId = recorded.id;
    slug = recorded.slug;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug', component: TestPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        provideTestPlatformOrigins({}, { ci: 'https://ci.test' }),
        // No live stream in a screenshot: the real DomainEvents, on a stream that never connects.
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The menu at the right of a narrow bar, room below it for the panel; nothing opened yet. */
  async function render() {
    await TestBed.inject(Router).navigateByUrl(`/projects/${slug}`);
    const fixture = TestBed.createComponent(AgentsMenu);
    const element = fixture.nativeElement as HTMLElement;
    element.parentElement!.style.cssText =
      'display:flex; justify-content:flex-end; width:25rem; height:34rem; padding:0.5rem; align-items:flex-start';
    fixture.detectChanges();
    await settle();
    // In the browser the store loads the project list on its own; answer it as recorded.
    http
      .expectOne('/projects/api/projects')
      .flush(await goldenMaster('a project exists', 'listProjects'));
    await settle();
    fixture.detectChanges();
    await settle();
    const agents = http.expectOne(`/workspaces/api/agents?projectId=${projectId}&state=ACTIVE`);
    return { fixture, frame: page.elementLocator(element.parentElement!), agents };
  }

  async function answered(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('is a closed button badged with the agents needing a person', async () => {
    const { fixture, frame, agents } = await render();
    agents.flush(await goldenMaster(NEEDING_ATTENTION, 'listAgents', 'qits-workspaces'));
    await answered(fixture);
    await expect
      .element(page.getByRole('button', { name: 'Agents' }))
      .toHaveAttribute('aria-expanded', 'false');
    // Four of the five agents need a person (the fifth's wait is open but not yet overdue).
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('button span[aria-hidden="true"]')
        ?.textContent,
    ).toBe('4');
    await expect.element(frame).toMatchScreenshot('closed');
  });

  it('lists each agent with what it waits on and what needs a person', async () => {
    const { fixture, frame, agents } = await render();
    agents.flush(await goldenMaster(NEEDING_ATTENTION, 'listAgents', 'qits-workspaces'));
    await answered(fixture);
    await userEvent.click(page.getByRole('button', { name: 'Agents' }));
    fixture.detectChanges();
    await settle();
    // Each opening reads the agents again, as the lightning menu reads its requests.
    http
      .expectOne(`/workspaces/api/agents?projectId=${projectId}&state=ACTIVE`)
      .flush(await goldenMaster(NEEDING_ATTENTION, 'listAgents', 'qits-workspaces'));
    await answered(fixture);
    const panel = page.getByRole('region', { name: "The project's agents" });
    expect(panel.getByRole('listitem').elements()).toHaveLength(5);
    await expect
      .element(panel.getByRole('link', { name: /contract-00000001-10/ }))
      .toHaveAttribute('href', `/projects/${slug}/agents/00000000-0000-4000-8000-0000000000a6`);
    await expect.element(panel).toMatchTextContent('Blocked 50 min by contract-person');
    await expect
      .element(panel.getByRole('link', { name: 'CI run 00000000' }).first())
      .toHaveAttribute('href', 'https://ci.test/runs/00000000-0000-4000-8000-0000000000c2');
    await expect.element(panel.getByRole('link', { name: 'Open item' })).toBeVisible();
    await expect.element(panel.getByRole('link', { name: 'Prompt agent' }).first()).toBeVisible();
    await expect.element(frame).toMatchScreenshot('open');
  });
});
