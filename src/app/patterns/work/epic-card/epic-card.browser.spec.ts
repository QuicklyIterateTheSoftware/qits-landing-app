import { Component, computed, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { commands, page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedWork } from '$core/work/selected-work';
import { BOARD_COLUMNS } from '$core/work/work-statuses';
import { Board } from '$ui/components/board/board';
import {
  nodeOf,
  openRecordedWork,
  routedQualifiedId,
} from '../../../../testing/browser/recorded-work';
import { EpicCard } from './epic-card';

/**
 * Screenshots of one epic on the board, with its features and tasks, per case: alone on an empty
 * board, 48rem wide. The epic is the node the app builds from qits-projects' golden masters
 * (`recorded-work.ts`); each case names its state and the epic's qualified id in the recorded
 * answer.
 *
 * Only REFINED, IMPLEMENTING, IMPLEMENTED and VERIFYING epics are on the board; the Backlog,
 * Acceptance and Archive ones are in `epic-list-item.browser.spec.ts`.
 */
@Component({
  imports: [Board, EpicCard],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <ui-board [columns]="columns" gutter>
      @if (node(); as node) {
        <app-epic-card [node]="node" base="/projects/contract/work/detail" />
      }
    </ui-board>
  `,
})
class OneEpic {
  readonly columns = BOARD_COLUMNS.map((c) => ({ label: c.label, body: c.body, header: c.header }));
  private readonly work = inject(SelectedWork);
  private readonly qualifiedId = routedQualifiedId();
  readonly node = computed(() => nodeOf(this.work.graph().tree('board'), this.qualifiedId));
}

const EVERY_STATUS = 'a project with work in every status';
/** Two features, one with two tasks (one implemented), one with an open task. */
const NESTED = 'an epic with features and tasks';
/** One feature with a task in each status: two of them (VERIFIED, DONE) past the board. */
const EVERY_TASK_STATUS = 'an epic with tasks in every status';
const CAMPAIGN = 'a campaign with work in every phase';
/** One epic, member of two campaigns. The second campaign's answer is its own state. */
const TWO_CAMPAIGNS = 'an epic in two campaigns';
const SECOND_CAMPAIGN = 'the second campaign of an epic in two campaigns';

/** One case: the screenshot's name, the state, the epic's qualified id and its title. */
type Case = readonly [name: string, state: string, qualifiedId: string, title: string];

describe('EpicCard (screenshots)', () => {
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

  async function shown(state: string, qualifiedId: string, title: string, campaigns?: string[]) {
    const { element, harness } = await openRecordedWork(
      http,
      'board',
      qualifiedId,
      state,
      campaigns,
    );
    const locator = page.elementLocator(element);
    await expect.element(locator).toHaveTextContent(title);
    return { element, locator, harness };
  }

  /** Clicks the lane's expand button and waits for the redraw. */
  async function toggle(element: HTMLElement, harness: { fixture: { detectChanges(): void } }) {
    await userEvent.click(element.querySelector('ui-expand-button button') as HTMLElement);
    harness.fixture.detectChanges();
    // Park the pointer: the button's hover colour stays out of the screenshot.
    await commands.parkPointer();
  }

  /**
   * The collapsed lane's tiles, each as what a screen reader reads and the header of the column it
   * sits under (`gutter` for the right gutter).
   */
  function tiles(element: HTMLElement): [string, string][] {
    const headers = [...element.querySelectorAll('ui-board > div:first-child > div')];
    return [...element.querySelectorAll('ui-board-count')].map((tile) => {
      const box = tile.getBoundingClientRect();
      const middle = box.left + box.width / 2;
      const header = headers.find((h) => {
        const column = h.getBoundingClientRect();
        return middle > column.left && middle < column.right;
      });
      const name = header?.textContent?.replace(/\d+/g, '').trim() || 'gutter';
      return [tile.querySelector('.sr-only')!.textContent!.trim(), name];
    });
  }

  it.each<Case>([
    ['refined', EVERY_STATUS, 'contract-00000001-3', 'Refined epic'],
    ['implementing', EVERY_STATUS, 'contract-00000001-5', 'Implementing epic'],
    ['implemented', EVERY_STATUS, 'contract-00000001-7', 'Implemented epic'],
    ['verifying', EVERY_STATUS, 'contract-00000001-9', 'Verifying epic'],
  ])('%s', async (name, state, qualifiedId, title) => {
    const { locator } = await shown(state, qualifiedId, title);
    await expect.element(locator).toMatchScreenshot(name);
  });

  it('a started feature and task: both in Implementing', async () => {
    const { element, locator } = await shown(EVERY_STATUS, 'contract-00000001-17', 'Started epic');
    await expect.element(locator).toHaveTextContent('Started feature');
    await expect.element(locator).toHaveTextContent('Started task');
    // The task's card sits under the Implementing header.
    const task = [...element.querySelectorAll('ui-board-card')].find((card) =>
      card.textContent?.includes('Started task'),
    )!;
    const header = [...element.querySelectorAll('ui-board > div:first-child > div')].find((h) =>
      h.textContent?.includes('Implementing'),
    )!;
    const card = task.getBoundingClientRect();
    const column = header.getBoundingClientRect();
    const middle = card.left + card.width / 2;
    expect(middle).toBeGreaterThan(column.left);
    expect(middle).toBeLessThan(column.right);
    await expect.element(locator).toMatchScreenshot('implementing-feature-task');
  });

  it('several features with their tasks, in a mixed state: expanded, then collapsed', async () => {
    const { element, locator, harness } = await shown(NESTED, 'contract-00000001-1', 'Nested epic');
    await expect.element(locator).toHaveTextContent('Shipped feature');
    await expect.element(locator).toHaveTextContent('Open feature');
    await expect.element(locator).toHaveTextContent('First shipped task');
    await expect.element(locator).toMatchScreenshot('features-mixed-expanded');
    await toggle(element, harness);
    // Two open tasks in Refined, one implemented: a tile in each of those columns, none elsewhere.
    expect(tiles(element)).toEqual([
      ['2 refined', 'Refined'],
      ['1 implemented', 'Implemented'],
    ]);
    await expect.element(locator).toMatchScreenshot('features-mixed-collapsed');
  });

  it('collapsed with one started task: a single tile, in Implementing', async () => {
    const { element, locator, harness } = await shown(
      EVERY_STATUS,
      'contract-00000001-17',
      'Started epic',
    );
    await toggle(element, harness);
    expect(tiles(element)).toEqual([['1 implementing', 'Implementing']]);
    await expect.element(locator).toMatchScreenshot('implementing-collapsed');
  });

  it('collapsed without tasks: "No tasks", no tiles', async () => {
    const { element, locator, harness } = await shown(
      EVERY_STATUS,
      'contract-00000001-9',
      'Verifying epic',
    );
    await toggle(element, harness);
    expect(tiles(element)).toEqual([]);
    await expect.element(locator).toHaveTextContent('No tasks');
    await expect.element(locator).toMatchScreenshot('verifying-collapsed');
  });

  it('a feature with tasks past the board: a tile in its row’s gutter, above its id', async () => {
    const { element, locator } = await shown(
      EVERY_TASK_STATUS,
      'contract-00000001-1',
      'Epic in flight',
    );
    // The board's four tasks are cards; the verified and the done one are counted in the tile.
    expect(element.querySelectorAll('ui-board-card')).toHaveLength(4);
    await expect.element(locator).not.toHaveTextContent('Verified task');
    const row = element.querySelector('ui-board-row')!;
    const tile = row.querySelector('ui-board-count')!;
    expect(tile.querySelector('.sr-only')?.textContent?.trim()).toBe('2 verified');
    const id = row.querySelector('[row-id]')!.getBoundingClientRect();
    expect(tile.getBoundingClientRect().bottom).toBeLessThanOrEqual(id.top);
    await expect.element(locator).toMatchScreenshot('feature-verified-tasks');
  });

  it('in a campaign', async () => {
    const { locator } = await shown(CAMPAIGN, 'contract-00000001-2', 'Refined epic');
    await expect.element(locator).toHaveTextContent('Card campaign');
    await expect.element(locator).toMatchScreenshot('campaign');
  });

  it('in two campaigns', async () => {
    const { locator } = await shown(TWO_CAMPAIGNS, 'contract-00000001-3', 'Epic in two campaigns', [
      TWO_CAMPAIGNS,
      SECOND_CAMPAIGN,
    ]);
    await expect.element(locator).toHaveTextContent('First campaign');
    await expect.element(locator).toHaveTextContent('Second campaign');
    await expect.element(locator).toMatchScreenshot('two-campaigns');
  });
});
