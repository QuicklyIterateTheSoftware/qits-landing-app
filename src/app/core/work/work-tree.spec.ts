import type { WorkEntry } from './work.consumes';
import { WorkGraph, type WorkNode } from './work-tree';

/**
 * The tree and its spans, on inline entries: this is a pure function of entries and campaign
 * membership. (The pages' specs use qits-projects' golden masters.)
 */
const entry = (
  id: string,
  archetype: string,
  status?: string,
  parent?: string,
  implemented = false,
): WorkEntry => ({
  id,
  qualifiedId: id,
  title: id,
  archetype: archetype as WorkEntry['archetype'],
  status: status as WorkEntry['status'],
  parent,
  implementedAt: implemented ? '2026-10-02T00:00:00Z' : undefined,
});

/** `node` and its descendants as `id[from-to]` (spans) or `id` (no span), context marked `~`. */
function shape(node: WorkNode): string {
  const own = `${node.context ? '~' : ''}${node.entry.id}${node.span ? `[${node.span[0]}-${node.span[1]}]` : ''}`;
  return node.children.length ? `${own}(${node.children.map(shape).join(' ')})` : own;
}

describe('WorkGraph', () => {
  // A REFINED epic: one implemented feature (one of its tasks implemented), one open feature.
  const epic = [
    entry('epic', 'EPIC', 'REFINED'),
    entry('shipped', 'FEATURE', undefined, 'epic', true),
    entry('t1', 'TASK', undefined, 'shipped', true),
    entry('t2', 'TASK', undefined, 'shipped'),
    entry('open', 'FEATURE', undefined, 'epic'),
    entry('t3', 'TASK', undefined, 'open'),
  ];

  it('places features and tasks by their epic and implementedAt', () => {
    const graph = new WorkGraph(epic);
    expect(epic.map((e) => graph.columnOf(e))).toEqual([0, 1, 1, 0, 0, 0]);
  });

  it('spans a container from its leftmost to its rightmost column, descendants included', () => {
    const tree = new WorkGraph(epic).tree('board');
    expect(tree.map(shape)).toEqual([
      'epic[0-1](shipped[0-1](t1[1-1] t2[0-0]) open[0-0](t3[0-0]))',
    ]);
  });

  it('moves everything to Verified once the epic is', () => {
    const verified = epic.map((e) => (e.id === 'epic' ? { ...e, status: 'VERIFIED' as const } : e));
    const tree = new WorkGraph(verified).tree('board');
    expect(tree.map(shape)).toEqual([
      'epic[2-2](shipped[2-2](t1[2-2] t2[2-2]) open[2-2](t3[2-2]))',
    ]);
  });

  // A REFINED campaign ordering a VERIFIED epic, a REFINED epic with a feature, a REPORTED ticket;
  // plus an IMPLEMENTED ticket outside it.
  const campaign = [
    entry('campaign', 'CAMPAIGN', 'REFINED'),
    entry('verified', 'EPIC', 'VERIFIED'),
    entry('running', 'EPIC', 'REFINED'),
    entry('feature', 'FEATURE', undefined, 'running'),
    entry('waiting', 'TICKET', 'REPORTED'),
    entry('standalone', 'TICKET', 'IMPLEMENTED'),
  ];
  const members = { campaign: ['running', 'verified', 'waiting'] };

  it('nests campaign members in campaign order, and spans the campaign over them', () => {
    const tree = new WorkGraph(campaign, members).tree('board');
    expect(tree.map(shape)).toEqual([
      'campaign[0-2](running[0-0](feature[0-0]) verified[2-2])',
      'standalone[1-1]',
    ]);
  });

  it('shows a backlog item under its ancestors as context', () => {
    const tree = new WorkGraph(campaign, members).tree('backlog');
    expect(tree.map(shape)).toEqual(['~campaign(waiting)']);
  });

  it('shows a REPORTED task under its REFINED epic as context, in the backlog', () => {
    // Derived: the task's own status would come from its epic; give the epic a REPORTED sibling
    // ticket instead, the only way a backlog item sits under a board container (a campaign).
    const reportedEpic = [
      entry('epic', 'EPIC', 'REPORTED'),
      entry('task', 'TASK', undefined, 'epic'),
    ];
    expect(new WorkGraph(reportedEpic).tree('backlog').map(shape)).toEqual(['epic(task)']);
  });

  it('keeps an entity whose parent is not in the list as a root (an orphan)', () => {
    const orphan = [
      entry('lost', 'TASK', undefined, 'missing-epic'),
      entry('t', 'TICKET', 'REFINED'),
    ];
    const graph = new WorkGraph(orphan);
    // No status of its own and no ancestor with one: it belongs nowhere.
    expect(graph.phaseOf(orphan[0])).toBeUndefined();
    expect(graph.tree('board').map(shape)).toEqual(['t[0-0]']);
  });

  it('archives done and dropped work, with no spans off the board', () => {
    const done = [
      entry('d', 'TICKET', 'DONE'),
      entry('x', 'EPIC', 'DROPPED'),
      entry('f', 'FEATURE', undefined, 'x'),
    ];
    expect(new WorkGraph(done).tree('archive').map(shape)).toEqual(['d', 'x(f)']);
  });
});
