import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideQitsWorkBriefs, type QitsWorkBrief } from '@qits/ui-components';
import { commands, page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { branchGraph, type BranchCommit } from '$core/release-requests/branch-graph';
import { layoutGraph } from '$core/release-requests/commit-graph';
import { CommitGraphView, type GraphEntry } from './commit-graph';

/**
 * Screenshots of the commit graph, on synthetic commits: an octopus fold of main and two branches,
 * one branch two commits long, with the lane legend and a "22 earlier folds" button under the
 * fold; then one row opened.
 */
const commits = [
  { hash: 'fold', parents: ['main2', 'feat2', 'fix1'] },
  { hash: 'feat2', parents: ['feat1'] },
  { hash: 'fix1', parents: ['main1'] },
  { hash: 'main2', parents: ['main1'] },
  { hash: 'feat1', parents: ['main1'] },
  { hash: 'main1', parents: [] },
];

const entry = (hash: string, subject: string, label?: string): GraphEntry => ({
  hash,
  shortHash: hash.padEnd(7, '0'),
  subject,
  author: 'dana.weber',
  when: '3h ago',
  title: '9 Oct 2026 12:00:00Z',
  label,
});

@Component({
  imports: [CommitGraphView],
  host: { class: 'block w-[40rem] p-4' },
  template: `
    <ui-commit-graph
      [graph]="graph"
      [entries]="entries"
      [expanded]="expanded"
      [expansion]="opened"
      [lanes]="lanes"
      (toggle)="toggled = $event"
      (more)="more = $event"
    />
    <ng-template #opened let-hash
      ><p class="m-0 text-sm">The changes of {{ hash }}</p></ng-template
    >
  `,
})
class Graph {
  readonly graph = layoutGraph(commits);
  readonly entries = [
    { ...entry('fold', 'Release request r1: fold three sources'), more: '22 earlier folds' },
    entry('feat2', 'feat: the second half'),
    entry('fix1', 'fix: the rounding'),
    entry('main2', 'docs: say who approves'),
    entry('feat1', 'feat: the first half'),
    entry('main1', 'chore: start'),
  ];
  readonly lanes = [
    { label: 'release/r1 · main' },
    { label: 'feature/export' },
    { label: 'ticket/rounding' },
  ];
  expanded: ReadonlySet<string> = new Set();
  toggled = '';
  more = '';
}

describe('CommitGraphView (screenshots)', () => {
  it('draws one lane per line of history, merged at the fold', async () => {
    const fixture = TestBed.createComponent(Graph);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view).toMatchTextContent('feature/export');
    await expect.element(view).toMatchScreenshot('graph', { kind: 'DATA' });
    await view.getByRole('button', { name: '22 earlier folds' }).click();
    expect(fixture.componentInstance.more).toBe('fold');
  });

  it('opens a row with the lanes running on beside it, and says which was pressed', async () => {
    const fixture = TestBed.createComponent(Graph);
    fixture.componentInstance.expanded = new Set(['feat2']);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view).toMatchTextContent('The changes of feat2');
    await expect.element(view).toMatchScreenshot('opened', { kind: 'DATA' });
    await view.getByRole('button', { name: /the rounding/ }).click();
    expect(fixture.componentInstance.toggled).toBe('fix1');
  });
});

/** The graph with a column header over each lane, as a release request's page draws it. */
@Component({
  imports: [CommitGraphView],
  host: { class: 'block w-[52rem] p-4' },
  template: `
    <ui-commit-graph
      [graph]="graph"
      [entries]="entries"
      [lanes]="lanes"
      [laneWidth]="120"
      [header]="head"
    />
    <ng-template #head let-lane let-index="index">
      <p class="m-0 truncate font-mono text-xs font-semibold" [title]="lane.label">
        {{ lane.label }}
      </p>
      <p class="m-0 text-xs text-fg-muted">lane {{ index }}</p>
    </ng-template>
  `,
})
class Headed {
  readonly graph = layoutGraph(commits);
  readonly entries = new Graph().entries;
  readonly lanes = [
    { label: 'release/0d3a91f2-a long backing branch' },
    { label: 'feature/export' },
    { label: 'ticket/rounding' },
    { label: 'main' },
  ];
}

describe('CommitGraphView with lane headers (screenshots)', () => {
  it('heads each lane, cut to the column, with an empty lane for a branch without commits', async () => {
    const fixture = TestBed.createComponent(Headed);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    expect(view.getByRole('columnheader').elements()).toHaveLength(4);
    await expect.element(view).toMatchScreenshot('headed', { kind: 'DATA' });
  });
});

/**
 * The fold of a request shaped like dd113f4c: 23 chained fold merges (one shown, 22 counted), 25
 * bumps on maintenance/dependencies, two one-commit ticket branches merged at the first fold; main
 * owns no commit, so it has no lane.
 */
function dd113f4cShape(): BranchCommit[] {
  const commits: BranchCommit[] = [];
  for (let k = 23; k >= 1; k--) {
    commits.push({
      hash: `f${k}`,
      parents: k === 1 ? ['base', 'b3', 't1', 't2'] : [`f${k - 1}`, `b${k + 2}`],
      fold: true,
    });
    commits.push({ hash: `b${k + 2}`, parents: [`b${k + 1}`], fold: false });
  }
  commits.push({ hash: 'b2', parents: ['b1'], fold: false });
  commits.push({ hash: 'b1', parents: ['main-old'], fold: false });
  commits.push({ hash: 't2', parents: ['main-old'], fold: false });
  commits.push({ hash: 't1', parents: ['main-old'], fold: false });
  return commits;
}

@Component({
  imports: [CommitGraphView],
  host: { class: 'block w-[56rem] p-4' },
  template: `
    <ui-commit-graph
      [graph]="graph"
      [entries]="entries"
      [lanes]="graph.lanes"
      [laneWidth]="96"
      [header]="head"
    />
    <ng-template #head let-lane>
      <p class="m-0 truncate font-mono text-xs font-semibold" [title]="lane.label">
        {{ lane.label }}
      </p>
    </ng-template>
  `,
})
class Folded {
  readonly graph = branchGraph({
    commits: dd113f4cShape(),
    mergedSha: 'f23',
    backingBranch: 'release/dd113f4c',
    sources: [
      { name: 'main', tipSha: 'main-tip' },
      { name: 'maintenance/dependencies', tipSha: 'b25' },
      { name: 'ticket/runner-placed-row', tipSha: 't1' },
      { name: 'ticket/remove-the-workspace-services', tipSha: 't2' },
    ],
  });
  readonly entries = this.graph.shown.map((hash, index) => ({
    ...entry(
      hash,
      hash.startsWith('f')
        ? 'Release request dd113f4c: bump(dependencies): 5 dependencies'
        : hash.startsWith('b')
          ? `bump(dependencies): ${hash.slice(1)} dependencies`
          : `fix: ${hash}`,
    ),
    more: index === 0 ? `${this.graph.earlierFolds} earlier folds` : undefined,
  }));
}

describe('CommitGraphView on a chain of folds (screenshots)', () => {
  it('pulls every source lane into the newest fold, earlier folds counted', async () => {
    await page.viewport(900, 1000);
    const fixture = TestBed.createComponent(Folded);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view).toMatchTextContent('22 earlier folds');
    await expect.element(view).toMatchScreenshot('folds', { kind: 'DATA' });
    await page.viewport(800, 600);
  });
});

/** The briefs door's recording: a ticket and an epic of the project `contract-00000001`. */
const BRIEFS = 'a project with work to brief';
/** An hour and a half after the recorded `updatedAt`, so the brief reads "1h ago" on every run. */
const NOW = new Date('2026-01-01T01:30:00Z');

/** A row whose subject names the recorded ticket, inside a link, as a commit row in a list is. */
@Component({
  imports: [CommitGraphView],
  host: { class: 'block h-64 w-[40rem] p-4' },
  template: `
    <a id="around" href="#followed" class="block">
      <ui-commit-graph
        [graph]="graph"
        [entries]="entries"
        [project]="project"
        (toggle)="toggled.push($event)"
      />
    </a>
    <p id="outside" class="m-0 mt-24 text-sm">Somewhere else on the page</p>
  `,
})
class Referenced {
  project = '';
  readonly graph = layoutGraph([
    { hash: 'b', parents: ['a'] },
    { hash: 'a', parents: [] },
  ]);
  entries: GraphEntry[] = [];
  readonly toggled: string[] = [];
}

describe('CommitGraphView with work references (browser)', () => {
  let ticket: QitsWorkBrief;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    const recorded = await goldenMaster(BRIEFS, 'listProjectWorkBriefs');
    const briefs: readonly QitsWorkBrief[] = recorded.briefs;
    ticket = briefs[0];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        // The briefs as qits-projects recorded them, without the HTTP read `workBriefSource` makes.
        provideQitsWorkBriefs(async (_project, ids) =>
          briefs.filter((brief) => ids.includes(brief.qualifiedId)),
        ),
      ],
    });
    history.replaceState(null, '', location.pathname + location.search);
  });

  afterEach(async () => {
    await commands.touch('cancel', 0, 0);
    await commands.parkPointer();
    vi.useRealTimers();
    history.replaceState(null, '', location.pathname + location.search);
  });

  async function render() {
    const fixture = TestBed.createComponent(Referenced);
    fixture.componentInstance.project = ticket.qualifiedId.replace(/-\d+$/, '');
    fixture.componentInstance.entries = [
      entry('b', `feat(${ticket.qualifiedId}): show the status beside the link`),
      entry('a', 'chore: start'),
    ];
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    const ref = view.getByText(ticket.qualifiedId, { exact: true }).first();
    await expect.element(ref).toHaveClass('qits-work-ref');
    // The brief's title is in the panel only; the panel is in the accessibility tree only open.
    const panel = view.getByText(ticket.title);
    const centre = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const tap = async (element: Element) => {
      const at = centre(element);
      await commands.touch('down', at.x, at.y);
      await commands.touch('up', at.x, at.y);
    };
    return { fixture, view, ref, panel, tap };
  }

  it('opens the brief on hover: the id, its status, when it changed, its title', async () => {
    const { view, ref, panel } = await render();
    await expect.element(panel).not.toBeVisible();
    await userEvent.hover(ref);
    await expect.element(panel).toBeVisible();
    const tooltip = view.getByRole('tooltip');
    await expect.element(tooltip.getByRole('link', { name: ticket.qualifiedId })).toBeVisible();
    const status = ticket.status.toLowerCase().replace(/_/g, ' ');
    await expect
      .element(tooltip)
      .toHaveTextContent(`${ticket.qualifiedId}${status}1h ago${ticket.title}`);
    await expect.element(ref).toHaveAccessibleDescription(new RegExp(ticket.title));
    await expect.element(view).toMatchScreenshot('work-ref-open', { kind: 'DATA' });
  });

  it('on a finger, a tap opens the brief without following the row or the link around it', async () => {
    const { fixture, ref, panel, tap } = await render();
    await tap(ref.element());
    await expect.element(panel).toBeVisible();
    expect(location.hash).toBe('');
    expect(fixture.componentInstance.toggled).toEqual([]);

    // A second tap on the id closes it, and follows nothing either.
    await tap(ref.element());
    await expect.element(panel).not.toBeVisible();
    expect(location.hash).toBe('');
    expect(fixture.componentInstance.toggled).toEqual([]);

    // A tap anywhere outside closes it too.
    await tap(ref.element());
    await expect.element(panel).toBeVisible();
    await tap(document.querySelector('#outside')!);
    await expect.element(panel).not.toBeVisible();
    expect(location.hash).toBe('');
  });
});
