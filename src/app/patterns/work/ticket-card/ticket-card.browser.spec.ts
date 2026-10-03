import { Component, computed, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { SelectedWork } from '$core/work/selected-work';
import { BOARD_COLUMNS } from '$core/work/work-statuses';
import { Board } from '$ui/components/board/board';
import {
  nodeOf,
  openRecordedWork,
  openWorkspaces,
  routedQualifiedId,
} from '../../../../testing/browser/recorded-work';
import { TicketCard } from './ticket-card';

/**
 * Screenshots of one ticket on the board, per case: alone on an empty board, 48rem wide. The
 * ticket is the node the app builds from qits-projects' golden masters (`recorded-work.ts`); each
 * case names its state and the ticket's qualified id in the recorded answer.
 *
 * Only REFINED, IMPLEMENTING, IMPLEMENTED and VERIFYING tickets are on the board; the Backlog,
 * Acceptance and Archive ones are in `ticket-list-item.browser.spec.ts`.
 */
@Component({
  imports: [Board, TicketCard],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <ui-board [columns]="columns" gutter>
      @if (node(); as node) {
        <app-ticket-card [node]="node" base="/projects/contract/work/detail" />
      }
    </ui-board>
  `,
})
class OneTicket {
  readonly columns = BOARD_COLUMNS.map((c) => ({ label: c.label, body: c.body, header: c.header }));
  private readonly work = inject(SelectedWork);
  private readonly qualifiedId = routedQualifiedId();
  readonly node = computed(() => nodeOf(this.work.graph().tree('board'), this.qualifiedId));
}

const EVERY_STATUS = 'a project with work in every status';
const EVERY_TYPE = 'a ticket of every type';
const CAMPAIGN = 'a campaign with work in every phase';

/** One case: the screenshot's name, the state, the ticket's qualified id and its title. */
type Case = readonly [name: string, state: string, qualifiedId: string, title: string];

describe('TicketCard (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/:view/:qualifiedId', component: OneTicket }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function shown(state: string, qualifiedId: string, title: string) {
    const { element } = await openRecordedWork(http, 'board', qualifiedId, state);
    const locator = page.elementLocator(element);
    await expect.element(locator).toHaveTextContent(title);
    return { element, locator };
  }

  it.each<Case>([
    ['refined', EVERY_STATUS, 'contract-00000001-4', 'Refined ticket'],
    ['implementing', EVERY_STATUS, 'contract-00000001-6', 'Implementing ticket'],
    ['implemented', EVERY_STATUS, 'contract-00000001-8', 'Implemented ticket'],
    ['verifying', EVERY_STATUS, 'contract-00000001-10', 'Verifying ticket'],
  ])('%s', async (name, state, qualifiedId, title) => {
    const { locator } = await shown(state, qualifiedId, title);
    await expect.element(locator).toMatchScreenshot(name);
  });

  it.each<Case>([
    // The card does not show the ticket type: the three draw alike but for their titles.
    ['bug', EVERY_TYPE, 'contract-00000001-1', 'Bug ticket'],
    ['improvement', EVERY_TYPE, 'contract-00000001-2', 'Improvement ticket'],
    ['maintenance', EVERY_TYPE, 'contract-00000001-3', 'Maintenance ticket'],
    ['campaign', CAMPAIGN, 'contract-00000001-3', 'Refined ticket'],
  ])('%s', async (name, state, qualifiedId, title) => {
    const { locator } = await shown(state, qualifiedId, title);
    await expect.element(locator).toMatchScreenshot(name);
  });

  // The open workspaces of qits-workspaces' "a project with workspaces bound to work items": the bug
  // ticket of the "… in detail" seed has an ACTIVE one, the improvement ticket none.
  it.each<Case>([
    ['workspace', 'a bug ticket in detail', 'contract-00000001-10', 'Invoice totals are off'],
    ['no-workspace', 'an improvement ticket in detail', 'contract-00000001-11', 'Remember the'],
  ])('%s', async (name, state, qualifiedId, title) => {
    const { element, harness } = await openRecordedWork(http, 'board', qualifiedId, state);
    await openWorkspaces(http, harness);
    const locator = page.elementLocator(element);
    await expect.element(locator).toHaveTextContent(title);
    const link = locator.getByRole('link', { name: 'Workspace', exact: true });
    if (name === 'workspace') {
      await expect
        .element(link)
        .toHaveAttribute('href', `/projects/contract-00000001/workspaces/${qualifiedId}`);
    } else {
      expect(element.querySelector('app-workspace-link')?.classList).toContain('hidden');
    }
    await expect.element(locator).toMatchScreenshot(name);
  });

  it('previews its campaign on hover', async () => {
    const { element, locator } = await shown(CAMPAIGN, 'contract-00000001-3', 'Refined ticket');
    // The popover hangs below the card; the host grows so the screenshot holds it.
    element.style.paddingBottom = '9rem';
    const campaign = locator.getByRole('link', { name: /^Campaign: / });
    await userEvent.hover(campaign);
    await expect.element(locator.getByRole('tooltip')).toBeVisible();
    await expect.element(locator).toMatchScreenshot('campaign-preview');
  });
});
