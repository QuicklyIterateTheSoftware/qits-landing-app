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
 * Screenshots of one epic in a list, per case: in the Backlog (REPORTED), Acceptance (VERIFIED,
 * with its finish button) or the Archive (DONE and DROPPED), 40rem wide. The epic is the node the app builds from qits-projects' golden masters
 * (`recorded-work.ts`); each case names its view, its state and the epic's qualified id.
 */
@Component({
  imports: [EpicListItem],
  host: { class: 'flex w-[40rem] flex-col gap-12 p-4 pb-8 [&_ui-board-card]:self-stretch' },
  template: `
    @if (node(); as node) {
      <app-epic-list-item [node]="node" base="/projects/contract/work/detail" [view]="view" />
    }
  `,
})
class OneEpic {
  readonly view = inject(ActivatedRoute).snapshot.paramMap.get('view') as Exclude<
    WorkListView,
    'campaign'
  >;
  private readonly work = inject(SelectedWork);
  private readonly qualifiedId = routedQualifiedId();
  readonly node = computed(() => nodeOf(this.work.graph().tree(this.view), this.qualifiedId));
}

const EVERY_STATUS = 'a project with work in every status';
const VERIFIED_COMPLETE = 'a verified epic with every task implemented';
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
    ['verified', 'acceptance', EVERY_STATUS, 'contract-00000001-13', 'Verified epic'],
    ['done', 'archive', EVERY_STATUS, 'contract-00000001-15', 'Done epic'],
    ['dropped', 'archive', EVERY_STATUS, 'contract-00000001-17', 'Dropped epic'],
  ])('%s', async (name, view, state, qualifiedId, title) => {
    const { locator } = await shown(view, state, qualifiedId, title);
    await expect.element(locator).toMatchScreenshot(name);
  });

  it('draws the finish button on the bottom-right corner of a VERIFIED epic', async () => {
    const { element } = await shown(
      'acceptance',
      EVERY_STATUS,
      'contract-00000001-13',
      'Verified epic',
    );
    const lane = element.querySelector('ui-list-lane') as HTMLElement;
    const finish = lane.querySelector('button[aria-label="Mark contract-00000001-13 done"]');
    expect(finish?.classList.contains('hidden')).toBe(false);
    const box = lane.getBoundingClientRect();
    const button = (finish as HTMLElement).getBoundingClientRect();
    // Centred on the corner.
    expect(Math.abs(button.left + button.width / 2 - box.right)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(button.top + button.height / 2 - box.bottom)).toBeLessThanOrEqual(1.5);
  });

  // This epic's tasks are IMPLEMENTED by their own status (qits-763), so they are on the board,
  // not under the epic here: the lane has no rows, and its summary counts none verified.
  it('a VERIFIED epic whose tasks are still on the board: expanded, then collapsed', async () => {
    const { element, locator, harness } = await shown(
      'acceptance',
      VERIFIED_COMPLETE,
      'contract-00000001-1',
      'Verified epic',
    );
    await expect.element(locator).not.toHaveTextContent('Second shipped task');
    await expect.element(locator).toMatchScreenshot('verified-tasks-open-expanded');
    await userEvent.click(element.querySelector('ui-expand-button button') as HTMLElement);
    harness.fixture.detectChanges();
    // Park the pointer: the button's hover colour stays out of the screenshot.
    await commands.parkPointer();
    await expect.element(locator).toHaveTextContent('0 / 2 ✅');
    await expect.element(locator).toMatchScreenshot('verified-tasks-open-collapsed');
  });

  it('every task implemented (DONE): collapsed, then expanded', async () => {
    const { element, locator, harness } = await shown(
      'archive',
      DONE_COMPLETE,
      'contract-00000001-1',
      'Done epic',
    );
    // The Archive starts every epic collapsed; a done one counts its verified tasks. Finishing the
    // epic moved none of its IMPLEMENTED tasks (qits-763), but the epic takes them to the Archive.
    await expect.element(locator).toHaveTextContent('0 / 2 ✅');
    await expect.element(locator).toMatchScreenshot('all-done-collapsed');
    await userEvent.click(element.querySelector('ui-expand-button button') as HTMLElement);
    harness.fixture.detectChanges();
    // Park the pointer: the button's hover colour stays out of the screenshot.
    await commands.parkPointer();
    await expect.element(locator).toHaveTextContent('Second shipped task');
    await expect.element(locator).toMatchScreenshot('all-done-expanded');
  });
});
