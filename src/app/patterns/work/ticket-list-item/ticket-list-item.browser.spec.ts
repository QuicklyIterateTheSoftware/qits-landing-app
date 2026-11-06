import { Component, computed, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedWork } from '$core/work/selected-work';
import {
  nodeOf,
  openRecordedWork,
  routedQualifiedId,
} from '../../../../testing/browser/recorded-work';
import type { WorkListView } from '$patterns/work/work-list/work-list-view';
import { ReorderList } from '$ui/components/reorder/reorder';
import { TicketListItem } from './ticket-list-item';

/**
 * Screenshots of one ticket in a list, per case: in the Backlog (REPORTED), Acceptance (VERIFIED,
 * with its quiet "closes on its own" hint, qits-150) or the Archive (DONE and DROPPED), 40rem wide. The ticket is the node the app builds from qits-projects' golden
 * masters (`recorded-work.ts`); each case names its view, its state and the ticket's qualified id.
 */
@Component({
  imports: [TicketListItem],
  // The list the work list draws the item in (qits-753).
  hostDirectives: [ReorderList],
  host: { class: 'flex w-[40rem] flex-col gap-12 p-4 pb-8 [&_ui-board-card]:self-stretch' },
  template: `
    @if (node(); as node) {
      <app-ticket-list-item [node]="node" base="/projects/contract/work/detail" [view]="view" />
    }
  `,
})
class OneTicket {
  readonly view = inject(ActivatedRoute).snapshot.paramMap.get('view') as Exclude<
    WorkListView,
    'mixed'
  >;
  private readonly work = inject(SelectedWork);
  private readonly qualifiedId = routedQualifiedId();
  readonly node = computed(() => nodeOf(this.work.graph().tree(this.view), this.qualifiedId));
}

const EVERY_STATUS = 'a project with work in every status';
/** A REFINED ticket that needs another, beside the ticket it needs (epic qits-1899). */
const NEEDS = 'a ticket that needs another';

/** One case: the screenshot's name, the view, the state, the ticket's qualified id and title. */
type Case = readonly [
  name: string,
  view: WorkListView,
  state: string,
  qualifiedId: string,
  title: string,
];

describe('TicketListItem (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/:view/:qualifiedId', component: OneTicket }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function shown(view: WorkListView, state: string, qualifiedId: string, title: string) {
    const { element } = await openRecordedWork(http, view, qualifiedId, state);
    const locator = page.elementLocator(element);
    await expect.element(locator).toMatchTextContent(title);
    return locator;
  }

  it.each<Case>([
    ['reported', 'backlog', EVERY_STATUS, 'contract-00000001-2', 'Reported ticket'],
    ['verified', 'acceptance', EVERY_STATUS, 'contract-00000001-14', 'Verified ticket'],
    ['done', 'archive', EVERY_STATUS, 'contract-00000001-16', 'Done ticket'],
    ['dropped', 'archive', EVERY_STATUS, 'contract-00000001-18', 'Dropped ticket'],
  ])('%s', async (name, view, state, qualifiedId, title) => {
    await expect.element(await shown(view, state, qualifiedId, title)).toMatchScreenshot(name);
  });

  // Its "needs" badge (epic qits-1899): the READY_FOR_DEV ticket on the board stacked, its own
  // status beside it.
  it('needs', async () => {
    const locator = await shown(
      'board',
      NEEDS,
      'contract-00000001-2',
      'Render work ids in the list',
    );
    await expect.element(locator.getByText('needs 1')).toBeVisible();
    await expect.element(locator).toMatchScreenshot('needs');
  });

  // qits-150: qits-projects-service refuses every caller's move of a TICKET to DONE, so a ticket
  // never carries a finish button, VERIFIED or not; the platform closes it on its own.
  it('draws no finish button on a VERIFIED ticket, only the quiet hint', async () => {
    const locator = await shown(
      'acceptance',
      EVERY_STATUS,
      'contract-00000001-14',
      'Verified ticket',
    );
    const card = locator.element().querySelector('ui-board-card') as HTMLElement;
    expect(card.querySelector('button[aria-label="Mark contract-00000001-14 done"]')).toBeNull();
    await expect.element(locator).toMatchTextContent('Closes once its release lands');
  });

  it('draws no finish button and no hint on a ticket that is not VERIFIED', async () => {
    const locator = await shown('archive', EVERY_STATUS, 'contract-00000001-16', 'Done ticket');
    expect(
      locator.element().querySelector('button[aria-label="Mark contract-00000001-16 done"]'),
    ).toBeNull();
    expect(locator.element().textContent).not.toContain('Closes once its release lands');
  });
});
