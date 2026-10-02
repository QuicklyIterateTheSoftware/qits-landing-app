import type { WorkEntry } from './work.consumes';
import { WorkGraph, type WorkNode } from './work-tree';

/**
 * The tree, its columns and its campaign tags, on inline entries: this is a pure function of entries and campaign
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

/**
 * `node` and its descendants as `id@column` (on the board) or `id`, context marked `~`, campaign
 * tags as `{campaign}`.
 */
function shape(node: WorkNode): string {
  const tags = node.campaigns.length ? `{${node.campaigns.map((c) => c.id).join(',')}}` : '';
  const own = `${node.context ? '~' : ''}${node.entry.id}${node.column === undefined ? '' : `@${node.column}`}${tags}`;
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

  it('nests features and tasks under their epic, each in its own column', () => {
    const tree = new WorkGraph(epic).tree('board');
    expect(tree.map(shape)).toEqual(['epic@0(shipped@1(t1@1 t2@0) open@0(t3@0))']);
  });

  it('moves everything to Verified once the epic is', () => {
    const verified = epic.map((e) => (e.id === 'epic' ? { ...e, status: 'VERIFIED' as const } : e));
    const tree = new WorkGraph(verified).tree('board');
    expect(tree.map(shape)).toEqual(['epic@2(shipped@2(t1@2 t2@2) open@2(t3@2))']);
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

  it('tags campaign members instead of nesting them; campaigns are in no tree', () => {
    const tree = new WorkGraph(campaign, members).tree('board');
    expect(tree.map(shape)).toEqual([
      'verified@2{campaign}',
      'running@0{campaign}(feature@0)',
      'standalone@1',
    ]);
    expect(new WorkGraph(campaign, members).tree('backlog').map(shape)).toEqual([
      'waiting{campaign}',
    ]);
  });

  it('tags a member of several campaigns with each of them', () => {
    const two = [...campaign, entry('second', 'CAMPAIGN', 'REFINED')];
    const graph = new WorkGraph(two, { ...members, second: ['verified'] });
    expect(graph.campaignsOf(two[1]).map((c) => c.id)).toEqual(['campaign', 'second']);
  });

  it('keeps a reported epic with its feature in the backlog', () => {
    const reportedEpic = [
      entry('epic', 'EPIC', 'REPORTED'),
      entry('f', 'FEATURE', undefined, 'epic'),
    ];
    expect(new WorkGraph(reportedEpic).tree('backlog').map(shape)).toEqual(['epic(f)']);
  });

  it('shows an ancestor from another phase as context', () => {
    // A child whose phase differs from its parent's: a feature carrying a status of its own
    // stands in for that case, which the tree must handle whatever the lifecycle allows today.
    const mixed = [entry('epic', 'EPIC', 'REFINED'), entry('odd', 'FEATURE', 'REPORTED', 'epic')];
    expect(new WorkGraph(mixed).tree('backlog').map(shape)).toEqual(['~epic(odd)']);
  });

  it('keeps an entity whose parent is not in the list as a root (an orphan)', () => {
    const orphan = [
      entry('lost', 'TASK', undefined, 'missing-epic'),
      entry('t', 'TICKET', 'REFINED'),
    ];
    const graph = new WorkGraph(orphan);
    // No status of its own and no ancestor with one: it belongs nowhere.
    expect(graph.phaseOf(orphan[0])).toBeUndefined();
    expect(graph.tree('board').map(shape)).toEqual(['t@0']);
  });

  it('archives done and dropped work, with no columns off the board', () => {
    const done = [
      entry('d', 'TICKET', 'DONE'),
      entry('x', 'EPIC', 'DROPPED'),
      entry('f', 'FEATURE', undefined, 'x'),
    ];
    expect(new WorkGraph(done).tree('archive').map(shape)).toEqual(['d', 'x(f)']);
  });
});
