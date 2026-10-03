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
 * Only REFINED, IMPLEMENTED and VERIFIED epics are on the board; the Backlog and Archive ones are
 * in `work-list.browser.spec.ts`.
 */
@Component({
  imports: [Board, EpicCard],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <ui-board [columns]="columns" gutter>
      @if (node(); as node) {
        <app-epic-card [node]="node" base="/projects/contract/work" />
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

/**
 * States recorded on qits-projects-service `external/card-states` (8c13d17e), not yet in the
 * installed `@qits/projects-golden-masters`. Their cases are skipped until the pin bump; then
 * drop the `.skip`.
 */
const VERIFIED_COMPLETE = 'a verified epic with every task implemented';
const CAMPAIGN = 'a campaign with work in every phase';
/**
 * Recorded on qits-projects-service `external/epic-campaigns-state` (eb00bb7c), on top of
 * 8c13d17e: one epic, member of two campaigns. The second campaign's answer is its own state.
 */
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

  it.each<Case>([
    ['refined', EVERY_STATUS, 'contract-00000001-3', 'Refined epic'],
    ['implemented', EVERY_STATUS, 'contract-00000001-5', 'Implemented epic'],
    ['verified', EVERY_STATUS, 'contract-00000001-7', 'Verified epic'],
  ])('%s', async (name, state, qualifiedId, title) => {
    const { locator } = await shown(state, qualifiedId, title);
    await expect.element(locator).toMatchScreenshot(name);
  });

  it('draws the finish button on the bottom-right corner of a VERIFIED epic', async () => {
    const { element } = await shown(EVERY_STATUS, 'contract-00000001-7', 'Verified epic');
    const lane = element.querySelector('ui-board-lane') as HTMLElement;
    const finish = lane.querySelector('button[aria-label="Mark contract-00000001-7 done"]');
    expect(finish?.classList.contains('hidden')).toBe(false);
    const box = lane.getBoundingClientRect();
    const button = (finish as HTMLElement).getBoundingClientRect();
    // Centred on the corner.
    expect(Math.abs(button.left + button.width / 2 - box.right)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(button.top + button.height / 2 - box.bottom)).toBeLessThanOrEqual(1.5);
  });

  it('draws no finish button on an epic that is not VERIFIED', async () => {
    const { element } = await shown(EVERY_STATUS, 'contract-00000001-5', 'Implemented epic');
    const finish = element.querySelector('button[aria-label="Mark contract-00000001-5 done"]');
    expect(finish?.classList.contains('hidden')).toBe(true);
  });

  it('several features with their tasks, in a mixed state: expanded, then collapsed', async () => {
    const { element, locator, harness } = await shown(NESTED, 'contract-00000001-1', 'Nested epic');
    await expect.element(locator).toHaveTextContent('Shipped feature');
    await expect.element(locator).toHaveTextContent('Open feature');
    await expect.element(locator).toHaveTextContent('First shipped task');
    await expect.element(locator).toMatchScreenshot('features-mixed-expanded');
    await toggle(element, harness);
    await expect.element(locator).toMatchScreenshot('features-mixed-collapsed');
  });

  // Waiting on the pin bump of @qits/projects-golden-masters (qits-projects 8c13d17e).
  it.skip('in a campaign', async () => {
    const { locator } = await shown(CAMPAIGN, 'contract-00000001-2', 'Refined epic');
    await expect.element(locator).toHaveTextContent('Card campaign');
    await expect.element(locator).toMatchScreenshot('campaign');
  });

  // Waiting on the pin bump of @qits/projects-golden-masters (qits-projects eb00bb7c).
  it.skip('in two campaigns', async () => {
    const { locator } = await shown(TWO_CAMPAIGNS, 'contract-00000001-3', 'Epic in two campaigns', [
      TWO_CAMPAIGNS,
      SECOND_CAMPAIGN,
    ]);
    await expect.element(locator).toHaveTextContent('First campaign');
    await expect.element(locator).toHaveTextContent('Second campaign');
    await expect.element(locator).toMatchScreenshot('two-campaigns');
  });

  // Waiting on the pin bump of @qits/projects-golden-masters (qits-projects 8c13d17e).
  it.skip('every task done (VERIFIED): collapsed, then expanded', async () => {
    const { element, locator, harness } = await shown(
      VERIFIED_COMPLETE,
      'contract-00000001-1',
      'Verified epic',
    );
    // Every task verified: the lane starts collapsed to its summary.
    await expect.element(locator).toHaveTextContent('2 / 2 ✅');
    await expect.element(locator).toMatchScreenshot('all-done-collapsed');
    await toggle(element, harness);
    await expect.element(locator).toHaveTextContent('Second shipped task');
    await expect.element(locator).toMatchScreenshot('all-done-expanded');
  });
});
