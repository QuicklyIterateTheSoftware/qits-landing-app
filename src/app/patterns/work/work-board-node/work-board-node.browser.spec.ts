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
import { WorkBoardNode } from './work-board-node';

/**
 * Screenshots of one work node on the board, per case: one epic (with its features and tasks) or
 * one ticket on an empty board, 48rem wide. The node is the one the app builds from qits-projects'
 * golden masters (`recorded-work.ts`); each case names its state and the entity's qualified id in
 * the recorded answer.
 *
 * Only REFINED, IMPLEMENTED and VERIFIED work is on the board; REPORTED, DONE and DROPPED work is
 * in `work-list-node.browser.spec.ts`.
 */
@Component({
  imports: [Board, WorkBoardNode],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <ui-board [columns]="columns" gutter>
      @if (node(); as node) {
        <app-work-board-node [node]="node" base="/projects/contract/work" />
      }
    </ui-board>
  `,
})
class OneBoardNode {
  readonly columns = BOARD_COLUMNS.map((c) => ({ label: c.label, body: c.body, header: c.header }));
  private readonly work = inject(SelectedWork);
  private readonly qualifiedId = routedQualifiedId();
  readonly node = computed(() => nodeOf(this.work.graph().tree('board'), this.qualifiedId));
}

const EVERY_STATUS = 'a project with work in every status';
const NESTED = 'an epic with features and tasks';

/**
 * States recorded on qits-projects-service `external/card-states` (8c13d17e), not yet in the
 * installed `@qits/projects-golden-masters`. Their cases are skipped until the pin bump; then
 * drop the `.skip`.
 */
const EVERY_TYPE = 'a ticket of every type';
const VERIFIED_COMPLETE = 'a verified epic with every task implemented';
const CAMPAIGN = 'a campaign with work in every phase';

/** One case: the screenshot's name, the state, the entity's qualified id and its title. */
type Case = readonly [name: string, state: string, qualifiedId: string, title: string];

describe('WorkBoardNode (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/:view/:qualifiedId', component: OneBoardNode }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function shown(state: string, qualifiedId: string, title: string) {
    const { element, harness } = await openRecordedWork(http, 'board', qualifiedId, state);
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
    ['epic-refined', EVERY_STATUS, 'contract-00000001-3', 'Refined epic'],
    ['ticket-refined', EVERY_STATUS, 'contract-00000001-4', 'Refined ticket'],
    ['epic-implemented', EVERY_STATUS, 'contract-00000001-5', 'Implemented epic'],
    ['ticket-implemented', EVERY_STATUS, 'contract-00000001-6', 'Implemented ticket'],
    ['epic-verified', EVERY_STATUS, 'contract-00000001-7', 'Verified epic'],
    ['ticket-verified', EVERY_STATUS, 'contract-00000001-8', 'Verified ticket'],
  ])('%s', async (name, state, qualifiedId, title) => {
    const { locator } = await shown(state, qualifiedId, title);
    await expect.element(locator).toMatchScreenshot(name);
  });

  it('draws the finish button on a VERIFIED epic and ticket only', async () => {
    const { element } = await shown(EVERY_STATUS, 'contract-00000001-8', 'Verified ticket');
    const finish = element.querySelector('button[aria-label="Mark contract-00000001-8 done"]');
    expect(finish?.classList.contains('hidden')).toBe(false);
  });

  it('epic with features and tasks in a mixed state: expanded, then collapsed', async () => {
    const { element, locator, harness } = await shown(NESTED, 'contract-00000001-1', 'Nested epic');
    await expect.element(locator).toHaveTextContent('First shipped task');
    await expect.element(locator).toMatchScreenshot('epic-mixed-expanded');
    await toggle(element, harness);
    await expect.element(locator).toMatchScreenshot('epic-mixed-collapsed');
  });

  // Waiting on the pin bump of @qits/projects-golden-masters (qits-projects 8c13d17e).
  it.skip.each<Case>([
    // The card does not show the ticket type: the three draw alike but for their titles.
    ['ticket-bug', EVERY_TYPE, 'contract-00000001-1', 'Bug ticket'],
    ['ticket-improvement', EVERY_TYPE, 'contract-00000001-2', 'Improvement ticket'],
    ['ticket-maintenance', EVERY_TYPE, 'contract-00000001-3', 'Maintenance ticket'],
    ['epic-campaign', CAMPAIGN, 'contract-00000001-2', 'Refined epic'],
    ['ticket-campaign', CAMPAIGN, 'contract-00000001-3', 'Refined ticket'],
  ])('%s', async (name, state, qualifiedId, title) => {
    const { locator } = await shown(state, qualifiedId, title);
    await expect.element(locator).toMatchScreenshot(name);
  });

  // Waiting on the pin bump of @qits/projects-golden-masters (qits-projects 8c13d17e).
  it.skip('verified epic with every task implemented: collapsed, then expanded', async () => {
    const { element, locator, harness } = await shown(
      VERIFIED_COMPLETE,
      'contract-00000001-1',
      'Verified epic',
    );
    // Every task verified: the lane starts collapsed to its summary.
    await expect.element(locator).toHaveTextContent('2 / 2 ✅');
    await expect.element(locator).toMatchScreenshot('epic-verified-complete-collapsed');
    await toggle(element, harness);
    await expect.element(locator).toMatchScreenshot('epic-verified-complete-expanded');
  });
});
