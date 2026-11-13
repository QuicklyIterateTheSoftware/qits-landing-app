import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords, visibleDataMarks } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type FrameReads,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';

/**
 * Screenshots of a project's Agents page inside the shell (`openRoute`). Its ACTIVE agents (the
 * "Active agents" heading, the same read as the shell's agents menu) are qits-workspaces' "a
 * project with agents needing attention": the bug ticket's agent waits on a release request that
 * is already FINALIZED, the epic's agent is blocked with no `@desk` answer, the PDF ticket's agent
 * is idle. The project is qits-projects' recorded one ("a project exists", slug
 * `contract-00000001`), which the state's entity ids name (the two providers' frozen ids are
 * unrelated). The "Workspaces" heading stays on the older recording, "a project with workspace
 * slots hosting agents" (its wrapper the one "a project with repositories in components" names):
 * one slot on runner `localhost`, hosting the bug ticket's and the epic's agents, the improvement
 * ticket's queued.
 *
 * The clock is pinned four minutes after the recordings' instants, so a wait reads "4m ago". The
 * event stream never connects.
 *
 * The page reads through its own `qitsResource`s (qits-2143): its ACTIVE agents are a request of
 * their own beside the agents menu's identical one, and `openRoute` answers both. Its lists and rows
 * carry the data marks (qits-2141), which the first test reads back (`visibleDataMarks`).
 *
 * A slot's row is a declared exit (`open-agents-slot` `slot`, epic qits-2000), shown by
 * `slots-and-agents` and followed once. The slot's page it leaves for is its own spec's: its reads
 * are answered with an error (`leftFor`). The agents' rows and statuses are patterns that declare
 * their own (`agent-row`, `agent-status`).
 */

const NEEDING_ATTENTION = 'a project with agents needing attention';
const WORKSPACES = 'a project with workspace slots hosting agents';
const REPOSITORIES = 'a project with repositories in components';
const NOW = new Date('2026-01-01T00:04:00Z');

describe('ProjectAgentsPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    vi.useRealTimers();
    await page.viewport(800, 600);
  });

  /** The page of the recorded project, its ACTIVE agents answered as `agents` names. */
  async function render(agents: FrameReads['agents'], height = 900) {
    // As wide as the page was, plus the sidebar; tall enough for every row, as the shell shows
    // only what is in the viewport.
    await page.viewport(1140, height);
    return openRoute((project) => `/projects/${project.slug}/agents`, { agents });
  }

  /** Answers the wrapper, then its slots and their agents. */
  async function answerSlots(opened: Awaited<ReturnType<typeof render>>) {
    const projectId = opened.project.id;
    const repositories = await goldenMaster(REPOSITORIES, 'listProjectRepositories');
    http.expectOne(`/projects/api/projects/${projectId}/repositories`).flush(repositories);
    await opened.settled();
    const wrapper = repositories.wrapper.repositoryId as string;
    http
      .expectOne(`/workspaces/api/workspaces?repositoryId=${wrapper}`)
      .flush(await goldenMaster(WORKSPACES, 'listWorkspaces', 'qits-workspaces'));
    http
      .expectOne('/workspaces/api/agents')
      .flush(await goldenMaster(WORKSPACES, 'listAgents', 'qits-workspaces'));
    await opened.settled();
    return wrapper;
  }

  it('lists the project’s agents, with what each waits on and needs a person, and its slots', async () => {
    const opened = await render(NEEDING_ATTENTION, 1200);
    const { project } = opened;
    await answerSlots(opened);
    const agents = await goldenMaster(NEEDING_ATTENTION, 'listAgents', 'qits-workspaces');
    const agentId = agents.agents.find(
      (a: { entityId?: string }) => a.entityId === 'contract-00000001-9',
    ).agentId;
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('heading', { name: 'Active agents' })).toBeVisible();
    await expect.element(view.getByRole('heading', { name: 'Workspaces' })).toBeVisible();
    await expect
      .element(view.getByRole('link', { name: 'contract-00000001-9' }))
      .toHaveAttribute('href', `/projects/${project.slug}/agents/${agentId}`);
    await expect
      .element(view)
      .toMatchTextContent('waiting on release request contract-qits-rr-368 to end · 4m ago');
    await expect.element(view).toMatchTextContent('Blocked 50 min by contract-person');
    await expect.element(view.getByRole('link', { name: 'Open item' })).toBeVisible();
    await expect.element(view.getByRole('link', { name: 'Prompt agent' }).first()).toBeVisible();
    await expect.element(view).not.toMatchTextContent('waiting on you');
    await expect
      .element(view.getByRole('link', { name: /ws-contract/ }))
      .toHaveAttribute('href', `/projects/${project.slug}/workspaces/1`);
    await expect.element(view).toMatchTextContent('placed on a runner');

    // The data marks (qits-2141): each list names its read, each row its record.
    const marks = visibleDataMarks(opened.page, document);
    const rows = (source: string, key: string) =>
      new Set(
        marks
          .filter((mark) => mark.source === source && mark.item?.startsWith(`${key}=`))
          .map((mark) => mark.item),
      );
    expect(rows('qits-workspaces-service#listAgents', 'agentId')).toEqual(
      new Set(agents.agents.map((a: { agentId: string }) => `agentId=${a.agentId}`)),
    );
    const slots = await goldenMaster(WORKSPACES, 'listWorkspaces', 'qits-workspaces');
    expect(rows('qits-workspaces-service#listWorkspaces', 'id')).toEqual(
      new Set(slots.entries.map((e: { workspace: { id: number } }) => `id=${e.workspace.id}`)),
    );
    expect(marks).toContainEqual({
      source: 'qits-workspaces-service#listWorkspaces',
      item: `id=${slots.entries[0].workspace.id}`,
      field: 'workspaceId',
      derived: [],
    });

    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('slots-and-agents', { kind: 'DATA' });
  });

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * with a 404 (an error answer is only a status): that page is its own spec's (`idle()`, not
   * `settled()`, qits-2056). Answers in rounds, until a round leaves nothing open.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  it('open-agents-slot slot: a slot’s row opens the slot’s page', async () => {
    const opened = await render(NEEDING_ATTENTION, 1200);
    await answerSlots(opened);
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: /ws-contract/ }).click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-agents-slot:slot',
    ]);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/workspaces/1`);
  });

  it('marks the page as loading, then as failed to load', async () => {
    const opened = await render('unanswered');
    const { project } = opened;
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    // The page's read and the shell's agents menu's: both fail.
    for (const read of http.match(`/workspaces/api/agents?projectId=${project.id}&state=ACTIVE`)) {
      read.flush(null, { status: 500, statusText: 'Server Error' });
    }
    http
      .expectOne(`/projects/api/projects/${project.id}/repositories`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(view.getByRole('img', { name: 'Failed to load' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });
});
