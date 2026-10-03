import { Component, computed, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { commands, page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedWork } from '$core/work/selected-work';
import {
  nodeOf,
  openRecordedWork,
  routedQualifiedId,
} from '../../../../testing/browser/recorded-work';
import { WorkListNode, type WorkListView } from './work-list-node';

/**
 * Screenshots of one work node in a list, per case: one epic (with its features and tasks) or one
 * ticket, in the Backlog (REPORTED work) or the Archive (DONE and DROPPED work), 40rem wide. The
 * node is the one the app builds from qits-projects' golden masters (`recorded-work.ts`); each
 * case names its view, its state and the entity's qualified id in the recorded answer.
 */
@Component({
  imports: [WorkListNode],
  host: { class: 'flex w-[40rem] flex-col gap-12 p-4 pb-8 [&_ui-board-card]:self-stretch' },
  template: `
    @if (node(); as node) {
      <app-work-list-node [node]="node" base="/projects/contract/work" [view]="view" />
    }
  `,
})
class OneListNode {
  readonly view = inject(ActivatedRoute).snapshot.paramMap.get('view') as WorkListView;
  private readonly work = inject(SelectedWork);
  private readonly qualifiedId = routedQualifiedId();
  readonly node = computed(() =>
    nodeOf(
      this.work.graph().tree(this.view === 'archive' ? 'archive' : 'backlog'),
      this.qualifiedId,
    ),
  );
}

const EVERY_STATUS = 'a project with work in every status';

/**
 * States recorded on qits-projects-service `external/card-states` (8c13d17e), not yet in the
 * installed `@qits/projects-golden-masters`. Their cases are skipped until the pin bump; then
 * drop the `.skip`.
 */
const DONE_COMPLETE = 'a done epic with every task implemented';
const CAMPAIGN = 'a campaign with work in every phase';

/** One case: the screenshot's name, the view, the state, the entity's qualified id and title. */
type Case = readonly [
  name: string,
  view: WorkListView,
  state: string,
  qualifiedId: string,
  title: string,
];

describe('WorkListNode (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/:view/:qualifiedId', component: OneListNode }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function shown(view: WorkListView, state: string, qualifiedId: string, title: string) {
    const { element, harness } = await openRecordedWork(http, view, qualifiedId, state);
    const locator = page.elementLocator(element);
    await expect.element(locator).toHaveTextContent(title);
    return { element, locator, harness };
  }

  it.each<Case>([
    ['epic-reported', 'backlog', EVERY_STATUS, 'contract-00000001-1', 'Reported epic'],
    ['ticket-reported', 'backlog', EVERY_STATUS, 'contract-00000001-2', 'Reported ticket'],
    ['epic-done', 'archive', EVERY_STATUS, 'contract-00000001-9', 'Done epic'],
    ['ticket-done', 'archive', EVERY_STATUS, 'contract-00000001-10', 'Done ticket'],
    ['epic-dropped', 'archive', EVERY_STATUS, 'contract-00000001-11', 'Dropped epic'],
    ['ticket-dropped', 'archive', EVERY_STATUS, 'contract-00000001-12', 'Dropped ticket'],
  ])('%s', async (name, view, state, qualifiedId, title) => {
    const { locator } = await shown(view, state, qualifiedId, title);
    await expect.element(locator).toMatchScreenshot(name);
  });

  // Waiting on the pin bump of @qits/projects-golden-masters (qits-projects 8c13d17e).
  it.skip.each<Case>([
    ['ticket-reported-campaign', 'backlog', CAMPAIGN, 'contract-00000001-4', 'Reported ticket'],
    ['ticket-done-campaign', 'archive', CAMPAIGN, 'contract-00000001-5', 'Done ticket'],
  ])('%s', async (name, view, state, qualifiedId, title) => {
    const { locator } = await shown(view, state, qualifiedId, title);
    await expect.element(locator).toMatchScreenshot(name);
  });

  // Waiting on the pin bump of @qits/projects-golden-masters (qits-projects 8c13d17e).
  it.skip('done epic with every task implemented: collapsed, then expanded', async () => {
    const { element, locator, harness } = await shown(
      'archive',
      DONE_COMPLETE,
      'contract-00000001-1',
      'Done epic',
    );
    // The Archive starts every epic collapsed; a done one sums up its tasks.
    await expect.element(locator).toHaveTextContent('2 / 2 ✅');
    await expect.element(locator).toMatchScreenshot('epic-done-complete-collapsed');
    await userEvent.click(element.querySelector('ui-expand-button button') as HTMLElement);
    harness.fixture.detectChanges();
    // Park the pointer: the button's hover colour stays out of the screenshot.
    await commands.parkPointer();
    await expect.element(locator).toHaveTextContent('Second shipped task');
    await expect.element(locator).toMatchScreenshot('epic-done-complete-expanded');
  });
});
