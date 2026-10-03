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
import type { WorkListView } from '$patterns/work/work-list/work-list-view';
import { EpicListItem } from './epic-list-item';

/**
 * Screenshots of one epic in a list, per case: in the Backlog (REPORTED) or the Archive (DONE and
 * DROPPED), 40rem wide. The epic is the node the app builds from qits-projects' golden masters
 * (`recorded-work.ts`); each case names its view, its state and the epic's qualified id.
 */
@Component({
  imports: [EpicListItem],
  host: { class: 'flex w-[40rem] flex-col gap-12 p-4 pb-8 [&_ui-board-card]:self-stretch' },
  template: `
    @if (node(); as node) {
      <app-epic-list-item [node]="node" base="/projects/contract/work" [view]="view" />
    }
  `,
})
class OneEpic {
  readonly view = inject(ActivatedRoute).snapshot.paramMap.get('view') as WorkListView;
  private readonly work = inject(SelectedWork);
  private readonly qualifiedId = routedQualifiedId();
  readonly node = computed(() => nodeOf(this.work.graph().tree(this.view), this.qualifiedId));
}

const EVERY_STATUS = 'a project with work in every status';

/**
 * Recorded on qits-projects-service `external/card-states` (8c13d17e), not yet in the installed
 * `@qits/projects-golden-masters`. Its case is skipped until the pin bump; then drop the `.skip`.
 */
const DONE_COMPLETE = 'a done epic with every task implemented';

/** One case: the screenshot's name, the view, the state, the epic's qualified id and title. */
type Case = readonly [
  name: string,
  view: WorkListView,
  state: string,
  qualifiedId: string,
  title: string,
];

describe('EpicListItem (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/:view/:qualifiedId', component: OneEpic }]),
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
    ['reported', 'backlog', EVERY_STATUS, 'contract-00000001-1', 'Reported epic'],
    ['done', 'archive', EVERY_STATUS, 'contract-00000001-9', 'Done epic'],
    ['dropped', 'archive', EVERY_STATUS, 'contract-00000001-11', 'Dropped epic'],
  ])('%s', async (name, view, state, qualifiedId, title) => {
    const { locator } = await shown(view, state, qualifiedId, title);
    await expect.element(locator).toMatchScreenshot(name);
  });

  // Waiting on the pin bump of @qits/projects-golden-masters (qits-projects 8c13d17e).
  it.skip('every task done (DONE): collapsed, then expanded', async () => {
    const { element, locator, harness } = await shown(
      'archive',
      DONE_COMPLETE,
      'contract-00000001-1',
      'Done epic',
    );
    // The Archive starts every epic collapsed; a done one sums up its tasks.
    await expect.element(locator).toHaveTextContent('2 / 2 ✅');
    await expect.element(locator).toMatchScreenshot('all-done-collapsed');
    await userEvent.click(element.querySelector('ui-expand-button button') as HTMLElement);
    harness.fixture.detectChanges();
    // Park the pointer: the button's hover colour stays out of the screenshot.
    await commands.parkPointer();
    await expect.element(locator).toHaveTextContent('Second shipped task');
    await expect.element(locator).toMatchScreenshot('all-done-expanded');
  });
});
