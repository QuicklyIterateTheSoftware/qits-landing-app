import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
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
    await expect.element(view).toHaveTextContent('feature/export');
    await expect.element(view).toMatchScreenshot('graph');
    await view.getByRole('button', { name: '22 earlier folds' }).click();
    expect(fixture.componentInstance.more).toBe('fold');
  });

  it('opens a row with the lanes running on beside it, and says which was pressed', async () => {
    const fixture = TestBed.createComponent(Graph);
    fixture.componentInstance.expanded = new Set(['feat2']);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view).toHaveTextContent('The changes of feat2');
    await expect.element(view).toMatchScreenshot('opened');
    await view.getByRole('button', { name: /the rounding/ }).click();
    expect(fixture.componentInstance.toggled).toBe('fix1');
  });
});
