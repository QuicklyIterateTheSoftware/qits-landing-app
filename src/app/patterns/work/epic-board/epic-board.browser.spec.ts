import { Component, computed, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { SelectedWork } from '$core/work/selected-work';
import {
  nodeOf,
  openRecordedWork,
  openWorkspaces,
  routedQualifiedId,
} from '../../../../testing/browser/recorded-work';
import { EpicBoard } from './epic-board';

/**
 * Screenshots of one epic with its own board, per case, 48rem wide. The epic is the node the app
 * builds from qits-projects' golden masters (`recorded-work.ts`): the whole epic
 * (`WorkGraph.nodeOf`), as the epic's page and a campaign draw it. Each case names its state and the
 * epic's qualified id in the recorded answer. Only REFINED, IMPLEMENTING, IMPLEMENTED and VERIFYING
 * epics get a board; this covers each of them in every recorded state that has one.
 */
@Component({
  imports: [EpicBoard],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    @if (node(); as node) {
      <app-epic-board [node]="node" base="/projects/contract/work/detail" />
    }
  `,
})
class OneEpic {
  private readonly work = inject(SelectedWork);
  private readonly qualifiedId = routedQualifiedId();
  readonly node = computed(() => {
    // An epic on the board is a top-level node of the board's tree; drawn whole, as its page does.
    const graph = this.work.graph();
    const entry = nodeOf(graph.tree('board'), this.qualifiedId)?.entry;
    return entry ? graph.nodeOf(entry) : undefined;
  });
}

const EVERY_STATUS = 'a project with work in every status';
/** Two features, one with two tasks (one implemented), one with an open task. */
const NESTED = 'an epic with features and tasks';
/** One feature with a task in each status. */
const EVERY_TASK_STATUS = 'an epic with tasks in every status';
/** Two features: one whose three tasks are all VERIFIED, one with open tasks. */
const ALL_VERIFIED = 'an epic with a feature whose tasks are all verified';
/** As ALL_VERIFIED, but the feature with only VERIFIED tasks is VERIFIED itself. */
const VERIFIED_FEATURE = 'an epic with a verified feature whose tasks are all verified';
/** Four features: VERIFIED, IMPLEMENTED (its task VERIFIED), REFINED, IMPLEMENTING (two tasks). */
const MIXED = 'an implementing epic with features in mixed statuses';
const CAMPAIGN = 'a campaign with work in every phase';
/** One epic, member of two campaigns. The second campaign's answer is its own state. */
const TWO_CAMPAIGNS = 'an epic in two campaigns';
const SECOND_CAMPAIGN = 'the second campaign of an epic in two campaigns';
/** Two features, the PDF one implementing; workspaces bound to some of its items. */
const IN_DETAIL = 'an epic in detail';

/** One case: the screenshot's name, the state, the epic's qualified id and its title. */
type Case = readonly [name: string, state: string, qualifiedId: string, title: string];

describe('EpicBoard (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/:view/:qualifiedId', component: OneEpic }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
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

  /**
   * Shoots the board as a whole, or, when it is taller than the viewport (a taller one is scaled
   * down to fit the test window), in parts: the bar, the column headings, then each row
   * (`<name>-bar`, `<name>-columns`, `<name>-row-<n>`).
   */
  async function shoot(element: HTMLElement, name: string): Promise<void> {
    if (element.offsetHeight <= 560) {
      await expect.element(page.elementLocator(element)).toMatchScreenshot(name);
      return;
    }
    const parts: [string, Element | null][] = [
      ['bar', element.querySelector('app-epic-board header')],
      ['columns', element.querySelector('ui-board > div:first-child')],
      ...[...element.querySelectorAll('ui-board-row')].map((row, i): [string, Element] => [
        `row-${i + 1}`,
        row,
      ]),
    ];
    for (const [part, found] of parts) {
      if (found instanceof HTMLElement) {
        await expect.element(page.elementLocator(found)).toMatchScreenshot(`${name}-${part}`);
      }
    }
  }

  /** The column heading each card sits under, by the card's title. */
  function columnsOf(element: HTMLElement): Record<string, string> {
    const headers = [...element.querySelectorAll('ui-board > div:first-child > div')];
    return Object.fromEntries(
      [...element.querySelectorAll('ui-board-card')].map((card) => {
        const box = card.getBoundingClientRect();
        const middle = box.left + box.width / 2;
        const header = headers.find((h) => {
          const column = h.getBoundingClientRect();
          return middle > column.left && middle < column.right;
        });
        const title = card.querySelector('a')!.textContent!.trim();
        return [title, header?.textContent?.replace(/\d+/g, '').trim() ?? 'none'];
      }),
    );
  }

  /** The column headings with their counts. */
  function headings(element: HTMLElement): string[] {
    return [...element.querySelectorAll('ui-board > div:first-child > div')]
      .map((h) => h.textContent!.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  it.each<Case>([
    ['refined-no-features', EVERY_STATUS, 'contract-00000001-3', 'Refined epic'],
    ['implementing-no-features', EVERY_STATUS, 'contract-00000001-5', 'Implementing epic'],
    ['implemented-no-features', EVERY_STATUS, 'contract-00000001-7', 'Implemented epic'],
    ['verifying-no-features', EVERY_STATUS, 'contract-00000001-9', 'Verifying epic'],
  ])('%s: the bar, the five columns, "No features"', async (name, state, qualifiedId, title) => {
    const { element, locator } = await shown(state, qualifiedId, title);
    expect(headings(element)).toEqual([
      'Refined 0',
      'Implementing 0',
      'Implemented 0',
      'Verifying 0',
      'Verified 0',
    ]);
    await expect.element(locator.getByText('No features')).toBeVisible();
    // Its id up the grey left strip, whole, from the bar's top to the board's end.
    const board = element.querySelector('app-epic-board article')!.getBoundingClientRect();
    const id = locator.getByRole('link', { name: qualifiedId, exact: true }).element();
    const strip = id.parentElement!;
    expect(getComputedStyle(strip).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(Math.round(strip.getBoundingClientRect().top)).toBe(Math.round(board.top));
    expect(Math.round(strip.getBoundingClientRect().bottom)).toBe(Math.round(board.bottom));
    // The columns end with the board, not below it.
    const columns = element.querySelector('ui-board > div:nth-child(2)')!.getBoundingClientRect();
    expect(Math.round(columns.bottom)).toBe(Math.round(board.bottom));
    // In the bar: the tags at the left, the title at the right.
    const bar = element.querySelector('app-epic-board header')!.getBoundingClientRect();
    const titleLink = locator.getByRole('link', { name: title, exact: true }).element();
    const tag = element.querySelector('app-epic-board header ui-tag')!.getBoundingClientRect();
    expect(bar.right - titleLink.getBoundingClientRect().right).toBeLessThan(16);
    expect(tag.left - bar.left).toBeLessThan(16);
    expect(id.getBoundingClientRect().top).toBeGreaterThan(board.top);
    expect(id.getBoundingClientRect().bottom).toBeLessThan(board.bottom);
    await shoot(element, name);
  });

  it('an epic with tasks in every status: each in its column, VERIFIED and DONE in Verified', async () => {
    const { element, locator } = await shown(
      EVERY_TASK_STATUS,
      'contract-00000001-1',
      'Epic in flight',
    );
    expect(columnsOf(element)).toEqual({
      'Refined task': 'Refined',
      'Implementing task': 'Implementing',
      'Implemented task': 'Implemented',
      'Verifying task': 'Verifying',
      'Verified task': 'Verified',
      'Done task': 'Verified',
    });
    // Not refined yet, or dropped: not on the board.
    await expect.element(locator).not.toHaveTextContent('Reported task');
    await expect.element(locator).not.toHaveTextContent('Dropped task');
    // The done one is drawn muted.
    const done = [...element.querySelectorAll('ui-board-card')].filter((card) =>
      card.classList.contains('opacity-60'),
    );
    expect(done.map((card) => card.querySelector('a')!.textContent!.trim())).toEqual(['Done task']);
    expect(headings(element)).toEqual([
      'Refined 1',
      'Implementing 1',
      'Implemented 1',
      'Verifying 1',
      'Verified 2',
    ]);
    await expect.element(locator.getByText('No features')).not.toBeVisible();
    // No chin: the columns end with the last feature's title bar.
    const rows = element.querySelectorAll('ui-board-row');
    const last = rows[rows.length - 1].getBoundingClientRect();
    const columns = element.querySelector('ui-board > div:nth-child(2)')!.getBoundingClientRect();
    expect(Math.round(columns.bottom)).toBe(Math.round(last.bottom));
    // The feature's title bar and id strip are solid, not translucent.
    const bar = rows[0].querySelector('[row-footer]')!.parentElement!;
    const strip = rows[0].querySelector('[row-id]')!.parentElement!.parentElement!;
    for (const part of [bar, strip]) {
      expect(getComputedStyle(part).backgroundColor).not.toMatch(/\/ 0\.|, 0\.\d+\)$/);
    }
    await shoot(element, 'every-task-status');
  });

  it('a refined epic with two features in a mixed state', async () => {
    const { element, locator } = await shown(NESTED, 'contract-00000001-1', 'Nested epic');
    expect(element.querySelectorAll('ui-board-row')).toHaveLength(2);
    expect(columnsOf(element)).toEqual({
      'First shipped task': 'Implemented',
      'Second shipped task': 'Refined',
      'Open task': 'Refined',
    });
    await shoot(element, 'refined-features');
  });

  it('an implementing epic with a started feature and task', async () => {
    const { element, locator } = await shown(EVERY_STATUS, 'contract-00000001-17', 'Started epic');
    expect(columnsOf(element)).toEqual({ 'Started task': 'Implementing' });
    await shoot(element, 'implementing-started');
  });

  it('a feature whose tasks are all verified: its cards in Verified', async () => {
    const { element, locator } = await shown(ALL_VERIFIED, 'contract-00000001-1', 'Epic in flight');
    expect(columnsOf(element)).toEqual({
      'First verified task': 'Verified',
      'Second verified task': 'Verified',
      'Third verified task': 'Verified',
      'Refined task': 'Refined',
      'Implementing task': 'Implementing',
    });
    await shoot(element, 'feature-all-verified');
  });

  it('a verified feature whose tasks are all verified: its cards in Verified', async () => {
    const { element, locator } = await shown(
      VERIFIED_FEATURE,
      'contract-00000001-1',
      'Epic in flight',
    );
    expect(columnsOf(element)).toEqual({
      'First verified task': 'Verified',
      'Second verified task': 'Verified',
      'Third verified task': 'Verified',
      'Refined task': 'Refined',
      'Implementing task': 'Implementing',
    });
    await shoot(element, 'verified-feature');
  });

  it('features in mixed statuses: each task in its own column, whatever its feature’s', async () => {
    const { element, locator } = await shown(
      MIXED,
      'contract-00000001-1',
      'Epic with mixed features',
    );
    const rows = [...element.querySelectorAll('ui-board-row')].map((row) =>
      row.querySelector('[row-footer]')!.textContent!.trim(),
    );
    expect(rows).toEqual([
      'Verified feature',
      'Implemented feature',
      'Refined feature',
      'Implementing feature',
    ]);
    expect(columnsOf(element)).toEqual({
      'Verified task': 'Verified',
      'Verified task of an implemented feature': 'Verified',
      'Refined task': 'Refined',
      'Implementing task': 'Implementing',
      'Verifying task': 'Verifying',
    });
    expect(headings(element)).toEqual([
      'Refined 1',
      'Implementing 1',
      'Implemented 0',
      'Verifying 1',
      'Verified 2',
    ]);
    await shoot(element, 'mixed-features');
  });

  it('in a campaign: its tag in the bar', async () => {
    const { element, locator } = await shown(CAMPAIGN, 'contract-00000001-2', 'Refined epic');
    await expect.element(locator).toHaveTextContent('Card campaign');
    await shoot(element, 'campaign');
  });

  it('in two campaigns', async () => {
    const { element, locator } = await shown(
      TWO_CAMPAIGNS,
      'contract-00000001-3',
      'Epic in two campaigns',
      [TWO_CAMPAIGNS, SECOND_CAMPAIGN],
    );
    await expect.element(locator).toHaveTextContent('First campaign');
    await expect.element(locator).toHaveTextContent('Second campaign');
    await shoot(element, 'two-campaigns');
  });

  it('with workspaces: a tag in the bar, at a feature’s title, a bubble on a task', async () => {
    // qits-workspaces' "a project with workspaces bound to work items" shares the "… in detail"
    // seed: the epic, its PDF feature and the CSV task "Download button …" have an ACTIVE one.
    const { element, locator, harness } = await shown(
      IN_DETAIL,
      'contract-00000001-2',
      'Export invoices for the accountants',
      [IN_DETAIL],
    );
    await openWorkspaces(http, harness);
    const shownLinks = [...element.querySelectorAll('app-workspace-link:not(.hidden) a')].map((a) =>
      a.getAttribute('href')?.split('/').pop(),
    );
    // In the order drawn: the bar's tag, the CSV task's bubble, then the PDF feature's title line.
    expect(shownLinks).toEqual([
      'contract-00000001-2',
      'contract-00000001-5',
      'contract-00000001-6',
    ]);
    expect(columnsOf(element)).toEqual({
      'Stream invoices as CSV': 'Implemented',
      'Download button on the invoice list': 'Implemented',
      'Render one invoice as PDF': 'Implementing',
      'Preview the PDF before download': 'Refined',
    });
    await shoot(element, 'workspaces');
  });
});
