import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../../testing/browser/app-route';

/**
 * A work item's old agent address inside the shell (`openRoute`), answered with golden masters: the
 * project's work from qits-projects' "a bug ticket in detail" (whose ids are those qits-workspaces'
 * states name), the item's agents from qits-workspaces.
 *
 * The page only redirects, and its outcomes have no trigger (`follow-work-item-agent`, epic
 * qits-2000): each is reached once. The bug ticket's ACTIVE agent ("an agent whose workspace is
 * starting") leads to its page (`toAgent`), on the tab asked for (`toAgentChat`, `toAgentFiles`,
 * `toAgentTerminal`); the improvement ticket, which has no agent ("a work item with no workspaces",
 * qits-2040), leads to its own page (`toItem`). The page it leaves for is not this spec's: its reads
 * are answered with an error (`leftFor`). The one screenshot is what the page shows while it waits.
 */

const WORK = 'a bug ticket in detail';
const STARTING = 'an agent whose workspace is starting';
const NO_AGENT = 'a work item with no workspaces';

describe('WorkAgentLayout (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The recorded work item titled `title`: its entity id and its qualified id. */
  async function itemOf(title: string): Promise<{ id: string; qualifiedId: string }> {
    const work = await goldenMaster(WORK, 'listProjectWork');
    return work.entities.find((e: { title: string }) => e.title === title);
  }

  /** The item's old agent address (with `tab`), the project's work answered. */
  async function opened(qualifiedId: string, tab = '') {
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/work/detail/${qualifiedId}/agent${tab}`,
    );
    http
      .expectOne(`/projects/api/projects/${opened.project.id}/work`)
      .flush(await goldenMaster(WORK, 'listProjectWork'));
    await opened.settled();
    return opened;
  }

  /** Answers the item's agents (`listAgents?workId=`) from `state`. */
  async function answerAgents(opened: OpenedRoute, workId: string, state: string) {
    http
      .expectOne((r) => r.urlWithParams === `/workspaces/api/agents?workId=${workId}`)
      .flush(await goldenMaster(state, 'listAgents', 'qits-workspaces'));
    await opened.settled();
  }

  /**
   * Lets the navigation finish, and answers every read the page it left for makes with a 404 (an
   * error answer is only a status): that page is its own spec's (`idle()`, not `settled()`,
   * qits-2056). Answers in rounds, until a round leaves nothing open.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  /** The first outcome the test reached: the page's own (the page it led to may add its own). */
  const first = () => {
    const [record] = outcomeRecords();
    return { outcome: `${record?.interaction}:${record?.outcome}`, url: record?.url };
  };

  it('waits for the item’s agents', async () => {
    const bug = await itemOf('Invoice totals are off by one cent');
    const at = await opened(bug.qualifiedId);
    await expect
      .element(page.elementLocator(at.page).getByRole('img', { name: 'Loading' }))
      .toBeVisible();
    await expect.element(page.elementLocator(at.frame)).toMatchScreenshot('waiting', {
      kind: 'PENDING',
    });
    http
      .expectOne((r) => r.urlWithParams === `/workspaces/api/agents?workId=${bug.id}`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await leftFor(at);
  });

  it.each([
    ['toAgent', ''],
    ['toAgentChat', '/chat'],
    ['toAgentFiles', '/files'],
    ['toAgentTerminal', '/terminal'],
  ])('follow-work-item-agent %s: the ACTIVE agent’s page, tab “%s”', async (outcome, tab) => {
    const bug = await itemOf('Invoice totals are off by one cent');
    const agents = await goldenMaster(STARTING, 'listAgents', 'qits-workspaces');
    const agentId = agents.agents[0].agentId;
    const at = await opened(bug.qualifiedId, tab);
    await answerAgents(at, bug.id, STARTING);
    await leftFor(at);
    const target = `/projects/${at.project.slug}/agents/${agentId}${tab}`;
    expect(first()).toEqual({ outcome: `follow-work-item-agent:${outcome}`, url: target });
    expect(TestBed.inject(Router).url).toBe(target);
  });

  it('follow-work-item-agent toItem: an item without an agent leads to its page', async () => {
    const improvement = await itemOf('Remember the last export format');
    const at = await opened(improvement.qualifiedId, '/chat');
    await answerAgents(at, improvement.id, NO_AGENT);
    await leftFor(at);
    const target = `/projects/${at.project.slug}/work/detail/${improvement.qualifiedId}`;
    expect(first()).toEqual({ outcome: 'follow-work-item-agent:toItem', url: target });
    expect(TestBed.inject(Router).url).toBe(target);
  });
});
