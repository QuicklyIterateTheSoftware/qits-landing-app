import { Component, computed, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { page } from 'vitest/browser';
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
import { TicketCard } from './ticket-card';

/**
 * Screenshots of one ticket on the board, per case: alone on an empty board, 48rem wide. The
 * ticket is the node the app builds from qits-projects' golden masters (`recorded-work.ts`); each
 * case names its state and the ticket's qualified id in the recorded answer.
 *
 * Only REFINED, IMPLEMENTED and VERIFIED tickets are on the board; the Backlog and Archive ones
 * are in `work-list.browser.spec.ts`.
 */
@Component({
  imports: [Board, TicketCard],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <ui-board [columns]="columns" gutter>
      @if (node(); as node) {
        <app-ticket-card [node]="node" base="/projects/contract/work" />
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

/**
 * States recorded on qits-projects-service `external/card-states` (8c13d17e), not yet in the
 * installed `@qits/projects-golden-masters`. Their cases are skipped until the pin bump; then
 * drop the `.skip`.
 */
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
    ['implemented', EVERY_STATUS, 'contract-00000001-6', 'Implemented ticket'],
    ['verified', EVERY_STATUS, 'contract-00000001-8', 'Verified ticket'],
  ])('%s', async (name, state, qualifiedId, title) => {
    const { locator } = await shown(state, qualifiedId, title);
    await expect.element(locator).toMatchScreenshot(name);
  });

  it('draws the finish button on the bottom-right corner of a VERIFIED ticket', async () => {
    const { element } = await shown(EVERY_STATUS, 'contract-00000001-8', 'Verified ticket');
    const card = element.querySelector('ui-board-card') as HTMLElement;
    const finish = card.querySelector('button[aria-label="Mark contract-00000001-8 done"]');
    expect(finish?.classList.contains('hidden')).toBe(false);
    const box = card.getBoundingClientRect();
    const button = (finish as HTMLElement).getBoundingClientRect();
    // Centred on the corner (of the padding box: the border is 1px), nothing over it.
    const x = button.left + button.width / 2;
    const y = button.top + button.height / 2;
    expect(Math.abs(x - box.right)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(y - box.bottom)).toBeLessThanOrEqual(1.5);
    expect(finish?.contains(document.elementFromPoint(x + 8, y + 8))).toBe(true);
  });

  it('draws no finish button on a ticket that is not VERIFIED', async () => {
    const { element } = await shown(EVERY_STATUS, 'contract-00000001-6', 'Implemented ticket');
    const finish = element.querySelector('button[aria-label="Mark contract-00000001-6 done"]');
    expect(finish?.classList.contains('hidden')).toBe(true);
  });

  // Waiting on the pin bump of @qits/projects-golden-masters (qits-projects 8c13d17e).
  it.skip.each<Case>([
    // The card does not show the ticket type: the three draw alike but for their titles.
    ['bug', EVERY_TYPE, 'contract-00000001-1', 'Bug ticket'],
    ['improvement', EVERY_TYPE, 'contract-00000001-2', 'Improvement ticket'],
    ['maintenance', EVERY_TYPE, 'contract-00000001-3', 'Maintenance ticket'],
    ['campaign', CAMPAIGN, 'contract-00000001-3', 'Refined ticket'],
  ])('%s', async (name, state, qualifiedId, title) => {
    const { locator } = await shown(state, qualifiedId, title);
    await expect.element(locator).toMatchScreenshot(name);
  });
});
