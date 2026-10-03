import type { WorkEntry } from './work.consumes';
import { byNumber, taskDistribution, WorkGraph, type WorkNode } from './work-tree';

/**
 * The tree, its columns and its campaign tags, on inline entries: this is a pure function of entries and campaign
 * membership. (The pages' specs use qits-projects' golden masters.)
 */
/** Each entry's qualified id is numbered in the order the entries are made: the list's order. */
let made = 0;
const entry = (
  id: string,
  archetype: string,
  status?: string,
  parent?: string,
  implemented = false,
  implementing = false,
): WorkEntry => ({
  id,
  qualifiedId: `qits-${++made}`,
  title: id,
  archetype: archetype as WorkEntry['archetype'],
  status: status as WorkEntry['status'],
  parent,
  implementedAt: implemented ? '2026-10-02T00:00:00Z' : undefined,
  implementingAt: implementing || implemented ? '2026-10-01T00:00:00Z' : undefined,
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
  // open feature.
  const epic = [
    entry('epic', 'EPIC', 'IMPLEMENTING'),
    entry('shipped', 'FEATURE', undefined, 'epic', true),
    entry('t1', 'TASK', undefined, 'shipped', true),
    entry('t2', 'TASK', undefined, 'shipped', false, true),
    entry('open', 'FEATURE', undefined, 'epic'),
    entry('t3', 'TASK', undefined, 'open'),
  ];
  const withEpic = (status: string) =>
    epic.map((e) => (e.id === 'epic' ? { ...e, status: status as WorkEntry['status'] } : e));

  it('places features and tasks by their epic, implementingAt and implementedAt', () => {
    const graph = new WorkGraph(epic);
    expect(epic.map((e) => graph.columnOf(e))).toEqual([1, 2, 2, 1, 0, 0]);
  });

  it('gives a feature and a task their epic’s status, and an orphan none', () => {
    const entries = [...epic, entry('lost', 'TASK', undefined, 'gone')];
    const graph = new WorkGraph(entries);
    expect(entries.map((e) => graph.statusOf(e))).toEqual([
      'IMPLEMENTING',
      'IMPLEMENTING',
      'IMPLEMENTING',
      'IMPLEMENTING',
      'IMPLEMENTING',
      'IMPLEMENTING',
      undefined,
    ]);
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

  it('moves everything to Verifying once the epic is', () => {
    const tree = new WorkGraph(withEpic('VERIFYING')).tree('board');
    expect(tree.map(shape)).toEqual(['epic@3(shipped@3(t1@3 t2@3) open@3(t3@3))']);
  });

  it('takes a VERIFIED epic off the board into acceptance, its children with it', () => {
    const graph = new WorkGraph(withEpic('VERIFIED'));
    expect(graph.tree('board')).toEqual([]);
    expect(graph.tree('acceptance').map(shape)).toEqual(['epic(shipped(t1 t2) open(t3))']);
    expect(graph.columnOf(epic[2])).toBeUndefined();
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

  it('counts an epic’s tasks per board column, zero columns included', () => {
    const [implementing] = new WorkGraph(epic).tree('board');
    expect(taskDistribution(implementing)).toEqual({
      columns: [1, 1, 1, 0],
      verified: 0,
      total: 3,
    });
    const [verifying] = new WorkGraph(withEpic('VERIFYING')).tree('board');
    expect(taskDistribution(verifying)).toEqual({ columns: [0, 0, 0, 3], verified: 0, total: 3 });
  });

  it('counts tasks past the board as verified', () => {
    // No recorded tree holds a task with its own status yet: a node built by hand, one task
    // REFINED (column 0), one VERIFIED and one DONE (past the board).
    const task = (id: string, status?: string, column?: number): WorkNode => ({
      entry: entry(id, 'TASK', status),
      children: [],
      context: false,
      column,
      campaigns: [],
    });
    const feature: WorkNode = {
      entry: entry('f', 'FEATURE'),
      children: [task('open', undefined, 0), task('checked', 'VERIFIED'), task('closed', 'DONE')],
      context: false,
      column: 0,
      campaigns: [],
    };
    const root: WorkNode = {
      entry: entry('e', 'EPIC', 'REFINED'),
      children: [feature],
      context: false,
      column: 0,
      campaigns: [],
    };
    expect(taskDistribution(root)).toEqual({ columns: [1, 0, 0, 0], verified: 2, total: 3 });
  });

  it('counts only the total off the board', () => {
    const [backlog] = new WorkGraph(withEpic('REPORTED')).tree('backlog');
    expect(taskDistribution(backlog)).toEqual({ columns: [0, 0, 0, 0], verified: 0, total: 3 });
  });

  describe('order', () => {
    const numbered = (
      id: string,
      qualifiedId: string | undefined,
      archetype: string,
      parent?: string,
    ) =>
      ({
        ...entry(id, archetype, parent ? undefined : 'REFINED', parent),
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
