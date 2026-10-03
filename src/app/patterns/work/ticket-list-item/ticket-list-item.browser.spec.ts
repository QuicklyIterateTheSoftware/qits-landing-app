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
import { TicketListItem } from './ticket-list-item';

/**
 * Screenshots of one ticket in a list, per case: in the Backlog (REPORTED) or the Archive (DONE
 * and DROPPED), 40rem wide. The ticket is the node the app builds from qits-projects' golden
 * masters (`recorded-work.ts`); each case names its view, its state and the ticket's qualified id.
 */
@Component({
  imports: [TicketListItem],
  host: { class: 'flex w-[40rem] flex-col gap-12 p-4 pb-8 [&_ui-board-card]:self-stretch' },
  template: `
    @if (node(); as node) {
      <app-ticket-list-item [node]="node" base="/projects/contract/work" [view]="view" />
    }
  `,
})
class OneTicket {
  readonly view = inject(ActivatedRoute).snapshot.paramMap.get('view') as WorkListView;
  private readonly work = inject(SelectedWork);
  private readonly qualifiedId = routedQualifiedId();
  readonly node = computed(() => nodeOf(this.work.graph().tree(this.view), this.qualifiedId));
}

const EVERY_STATUS = 'a project with work in every status';

/**
 * Recorded on qits-projects-service `external/card-states` (8c13d17e), not yet in the installed
 * `@qits/projects-golden-masters`. Its cases are skipped until the pin bump; then drop the `.skip`.
 */
const CAMPAIGN = 'a campaign with work in every phase';

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
    await expect.element(locator).toHaveTextContent(title);
    return locator;
  }

  it.each<Case>([
    ['reported', 'backlog', EVERY_STATUS, 'contract-00000001-2', 'Reported ticket'],
    ['done', 'archive', EVERY_STATUS, 'contract-00000001-10', 'Done ticket'],
    ['dropped', 'archive', EVERY_STATUS, 'contract-00000001-12', 'Dropped ticket'],
  ])('%s', async (name, view, state, qualifiedId, title) => {
    await expect.element(await shown(view, state, qualifiedId, title)).toMatchScreenshot(name);
  });

  // Waiting on the pin bump of @qits/projects-golden-masters (qits-projects 8c13d17e).
  it.skip.each<Case>([
    ['reported-campaign', 'backlog', CAMPAIGN, 'contract-00000001-4', 'Reported ticket'],
    ['done-campaign', 'archive', CAMPAIGN, 'contract-00000001-5', 'Done ticket'],
  ])('%s', async (name, view, state, qualifiedId, title) => {
    await expect.element(await shown(view, state, qualifiedId, title)).toMatchScreenshot(name);
  });
});
