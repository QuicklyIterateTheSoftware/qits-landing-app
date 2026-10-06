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
 * Only READY_FOR_DEV, IMPLEMENTING, IMPLEMENTED and VERIFYING tickets are on the board; the
 * Backlog, Acceptance and Archive ones are in `ticket-list-item.browser.spec.ts`. A REFINED ticket
 * waits on the Schedule tab, so the recorded tickets of every type (all REFINED) are not on it.
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
const CAMPAIGN = 'a bug ticket in detail';

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
    ['ready-for-dev', EVERY_STATUS, 'contract-00000001-6', 'Ready for dev ticket'],
    ['implementing', EVERY_STATUS, 'contract-00000001-8', 'Implementing ticket'],
    ['implemented', EVERY_STATUS, 'contract-00000001-10', 'Implemented ticket'],
    ['verifying', EVERY_STATUS, 'contract-00000001-12', 'Verifying ticket'],
  ])('%s', async (name, state, qualifiedId, title) => {
    const { locator } = await shown(state, qualifiedId, title);
    await expect.element(locator).toMatchScreenshot(name);
  });

  // The card does not show the ticket type. Its campaign tag: the bug ticket of the "… in detail"
  // seed, IMPLEMENTING and a member of its campaign.
  it.each<Case>([['campaign', CAMPAIGN, 'contract-00000001-10', 'Invoice totals are off']])(
    '%s',
    async (name, state, qualifiedId, title) => {
      const { locator } = await shown(state, qualifiedId, title);
      await expect.element(locator).toMatchScreenshot(name);
    },
  );

  // The open workspaces of qits-workspaces' "a project with workspaces bound to work items": the bug
  // ticket of the "… in detail" seed has an ACTIVE one. (Its improvement ticket, which has none, is
  // REFINED and so not on the board; the cards above, drawn without workspaces, show no link.)
  it('workspace', async () => {
    const qualifiedId = 'contract-00000001-10';
    const { element, harness } = await openRecordedWork(
      http,
      'board',
      qualifiedId,
      'a bug ticket in detail',
    );
    await openWorkspaces(http, harness);
    const locator = page.elementLocator(element);
    await expect.element(locator).toHaveTextContent('Invoice totals are off');
    const link = locator.getByRole('link', { name: 'Workspace', exact: true });
    await expect
      .element(link)
      .toHaveAttribute('href', `/projects/contract-00000001/workspaces/${qualifiedId}`);
    await expect.element(locator).toMatchScreenshot('workspace');
  });

  it('previews its campaign on hover', async () => {
    const { element, locator } = await shown(
      CAMPAIGN,
      'contract-00000001-10',
      'Invoice totals are off',
    );
    // The popover hangs below the card; the host grows so the screenshot holds it.
    element.style.paddingBottom = '9rem';
    const campaign = locator.getByRole('link', { name: /^Campaign: / });
    await userEvent.hover(campaign);
    await expect.element(locator.getByRole('tooltip')).toBeVisible();
    await expect.element(locator).toMatchScreenshot('campaign-preview');
  });
});
