import type { WorkEntry } from './work.consumes';
import { byNumber, WorkGraph, type WorkNode } from './work-tree';

/**
 * The tree, its columns and its campaign tags, on inline entries: this is a pure function of entries and campaign
 * membership. (The pages' specs use qits-projects' golden masters.)
 */
/** Each entry's qualified id is numbered in the order the entries are made: the list's order. */
let made = 0;
const entry = (id: string, archetype: string, status?: string, parent?: string): WorkEntry => ({
  id,
  qualifiedId: `qits-${++made}`,
  title: id,
  archetype: archetype as WorkEntry['archetype'],
  status: status as WorkEntry['status'],
  parent,
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
  // An IMPLEMENTING epic: one implemented feature (one of its tasks implemented, one started), one
  // open feature. Each item carries its own status, as qits-projects serves it since qits-763.
  const epic = [
    entry('epic', 'EPIC', 'IMPLEMENTING'),
    entry('shipped', 'FEATURE', 'IMPLEMENTED', 'epic'),
    entry('t1', 'TASK', 'IMPLEMENTED', 'shipped'),
    entry('t2', 'TASK', 'IMPLEMENTING', 'shipped'),
    entry('open', 'FEATURE', 'REFINED', 'epic'),
    entry('t3', 'TASK', 'REFINED', 'open'),
  ];
  const withStatus = (entries: readonly WorkEntry[], statuses: Record<string, string>) =>
    entries.map((e) =>
      e.id && statuses[e.id] ? { ...e, status: statuses[e.id] as WorkEntry['status'] } : e,
    );
  const withEpic = (status: string) => withStatus(epic, { epic: status });

  it('places every item by its own status', () => {
    const graph = new WorkGraph(epic);
    expect(epic.map((e) => graph.columnOf(e))).toEqual([1, 2, 2, 1, 0, 0]);
  });

  it('places work by its status: REFINED, IMPLEMENTING, IMPLEMENTED, VERIFYING', () => {
    const tickets = ['REFINED', 'IMPLEMENTING', 'IMPLEMENTED', 'VERIFYING'].map((status) =>
      entry(status, 'TICKET', status),
    );
    expect(new WorkGraph(tickets).tree('board').map(shape)).toEqual([
      'REFINED@0',
      'IMPLEMENTING@1',
      'IMPLEMENTED@2',
      'VERIFYING@3',
    ]);
  });

  it('nests features and tasks under their epic, each in its own column', () => {
    const tree = new WorkGraph(epic).tree('board');
    expect(tree.map(shape)).toEqual(['epic@1(shipped@2(t1@2 t2@1) open@0(t3@0))']);
  });

  it('moves only the epic to Verifying: its features and tasks stay where they are', () => {
    const tree = new WorkGraph(withEpic('VERIFYING')).tree('board');
    expect(tree.map(shape)).toEqual(['epic@3(shipped@2(t1@2 t2@1) open@0(t3@0))']);
  });

  it('verifies one task on its own: it goes to acceptance, its epic and feature there as context', () => {
    const graph = new WorkGraph(withStatus(epic, { t1: 'VERIFIED' }));
    expect(graph.tree('board').map(shape)).toEqual(['epic@1(shipped@2(t2@1) open@0(t3@0))']);
    expect(graph.tree('acceptance').map(shape)).toEqual(['~epic(~shipped(t1))']);
  });

  it('takes a VERIFIED epic off the board into acceptance, its unverified items with it', () => {
    const graph = new WorkGraph(withEpic('VERIFIED'));
    expect(graph.tree('board')).toEqual([]);
    expect(graph.tree('acceptance').map(shape)).toEqual(['epic(shipped(t1 t2) open(t3))']);
    expect(graph.columnOf(epic[2])).toBeUndefined();
  });

  it('archives a DONE epic with its whole tree, verified items included', () => {
    const graph = new WorkGraph(withStatus(epic, { epic: 'DONE', t1: 'VERIFIED' }));
    expect(graph.tree('acceptance')).toEqual([]);
    expect(graph.tree('archive').map(shape)).toEqual(['epic(shipped(t1 t2) open(t3))']);
  });

  // A REFINED campaign ordering a VERIFIED epic, a REFINED epic with a feature, a REPORTED ticket;
  // plus an IMPLEMENTED ticket outside it.
  const campaign = [
    entry('campaign', 'CAMPAIGN', 'REFINED'),
    entry('verified', 'EPIC', 'VERIFIED'),
    entry('running', 'EPIC', 'REFINED'),
    entry('feature', 'FEATURE', 'REFINED', 'running'),
    entry('waiting', 'TICKET', 'REPORTED'),
    entry('standalone', 'TICKET', 'IMPLEMENTED'),
  ];
  const members = { campaign: ['running', 'verified', 'waiting'] };

  it('tags campaign members instead of nesting them; campaigns are in no tree', () => {
    const tree = new WorkGraph(campaign, members).tree('board');
    expect(tree.map(shape)).toEqual(['running@0{campaign}(feature@0)', 'standalone@2']);
    expect(new WorkGraph(campaign, members).tree('acceptance').map(shape)).toEqual([
      'verified{campaign}',
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
      entry('f', 'FEATURE', 'REPORTED', 'epic'),
    ];
    expect(new WorkGraph(reportedEpic).tree('backlog').map(shape)).toEqual(['epic(f)']);
  });

  it('shows an ancestor from another phase as context', () => {
    // A child behind its parent: the backlog does not follow the parent onto the board.
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
      entry('f', 'FEATURE', 'REFINED', 'x'),
    ];
    expect(new WorkGraph(done).tree('archive').map(shape)).toEqual(['d', 'x(f)']);
  });

  it('counts an epic’s tasks per board column, zero columns included', () => {
    const [implementing] = new WorkGraph(epic).tree('board');
    expect(implementing.tasks).toEqual({ columns: [1, 1, 1, 0], verified: 0, total: 3 });
    const [verifying] = new WorkGraph(withStatus(epic, { t1: 'VERIFYING' })).tree('board');
    expect(verifying.tasks).toEqual({ columns: [1, 1, 0, 1], verified: 0, total: 3 });
  });

  it('counts verified and done tasks on a board epic, though the board tree does not hold them', () => {
    const graph = new WorkGraph(withStatus(epic, { t1: 'VERIFIED', t3: 'DONE' }));
    const [board] = graph.tree('board');
    expect(board.tasks).toEqual({ columns: [0, 1, 0, 0], verified: 2, total: 3 });
    // The epic in acceptance, there only as context to t1, counts the same tasks.
    const [acceptance] = graph.tree('acceptance');
    expect(acceptance.tasks).toEqual(board.tasks);
  });

  it('counts only the total off the board', () => {
    const reported = withStatus(epic, {
      epic: 'REPORTED',
      shipped: 'REPORTED',
      t1: 'REPORTED',
      t2: 'REPORTED',
      open: 'REPORTED',
      t3: 'REPORTED',
    });
    const [backlog] = new WorkGraph(reported).tree('backlog');
    expect(backlog.tasks).toEqual({ columns: [0, 0, 0, 0], verified: 0, total: 3 });
  });

  describe('order', () => {
    const numbered = (
      id: string,
      qualifiedId: string | undefined,
      archetype: string,
      parent?: string,
    ) =>
      ({
        ...entry(id, archetype, 'REFINED', parent),
        qualifiedId,
      }) as WorkEntry;

    it('sorts by the number of the qualified id, numerically, not lexically', () => {
      const list = [numbered('a', 'qits-10', 'TICKET'), numbered('b', 'qits-9', 'TICKET')];
      expect(new WorkGraph(list).tree('board').map(shape)).toEqual(['b@0', 'a@0']);
    });

    it('puts epics and tickets in one order, and each parent’s children in it too', () => {
      const list = [
        numbered('t12', 'qits-12', 'TICKET'),
        numbered('e3', 'qits-3', 'EPIC'),
        numbered('f20', 'qits-20', 'FEATURE', 'e3'),
        numbered('f4', 'qits-4', 'FEATURE', 'e3'),
        numbered('k11', 'qits-11', 'TASK', 'f4'),
        numbered('k5', 'qits-5', 'TASK', 'f4'),
        numbered('t7', 'qits-7', 'TICKET'),
      ];
      expect(new WorkGraph(list).tree('board').map(shape)).toEqual([
        'e3@0(f4@0(k5@0 k11@0) f20@0)',
        't7@0',
        't12@0',
      ]);
    });

    it('keeps the others in place when one goes', () => {
      const list = [
        numbered('t2', 'qits-2', 'TICKET'),
        numbered('e1', 'qits-1', 'EPIC'),
        numbered('t3', 'qits-3', 'TICKET'),
      ];
      const ids = (entries: WorkEntry[]) =>
        new WorkGraph(entries).tree('board').map((node) => node.entry.id);
      expect(ids(list)).toEqual(['e1', 't2', 't3']);
      expect(ids(list.filter((e) => e.id !== 't2'))).toEqual(['e1', 't3']);
    });

    it('falls back to the raw id, after the numbered ones, without a qualified id', () => {
      const sorted = [
        numbered('z', undefined, 'TICKET'),
        numbered('y', undefined, 'TICKET'),
        numbered('a', 'qits-2', 'TICKET'),
      ].sort(byNumber);
      expect(sorted.map((e) => e.id)).toEqual(['a', 'y', 'z']);
    });
  });
});
