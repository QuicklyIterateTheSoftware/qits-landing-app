import type { WorkEntry } from './work.consumes';
import { byNumber, taskDistribution, WorkGraph, type WorkNode } from './work-tree';

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
  // scheduled feature, not started. Features and tasks hold their own status (qits-763).
  const epic = [
    entry('epic', 'EPIC', 'IMPLEMENTING'),
    entry('shipped', 'FEATURE', 'IMPLEMENTED', 'epic'),
    entry('t1', 'TASK', 'IMPLEMENTED', 'shipped'),
    entry('t2', 'TASK', 'IMPLEMENTING', 'shipped'),
    entry('open', 'FEATURE', 'READY_FOR_DEV', 'epic'),
    entry('t3', 'TASK', 'READY_FOR_DEV', 'open'),
  ];
  const withStatus = (statuses: Record<string, string>) =>
    epic.map((e) =>
      e.id && statuses[e.id] ? { ...e, status: statuses[e.id] as WorkEntry['status'] } : e,
    );
  const withEpic = (status: string) => withStatus({ epic: status });

  it('places features and tasks by their own status', () => {
    const graph = new WorkGraph(epic);
    expect(epic.map((e) => graph.columnOf(e))).toEqual([1, 2, 2, 1, 0, 0]);
  });

  it('gives a feature or a task without a status its epic’s, and an orphan none', () => {
    const bare = epic.map((e) => (e.id === 'epic' ? e : { ...e, status: undefined }));
    const entries = [...bare, entry('lost', 'TASK', undefined, 'gone')];
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

  it('places work by its status: READY_FOR_DEV, IMPLEMENTING, IMPLEMENTED, VERIFYING', () => {
    const tickets = ['READY_FOR_DEV', 'IMPLEMENTING', 'IMPLEMENTED', 'VERIFYING'].map((status) =>
      entry(status, 'TICKET', status),
    );
    expect(new WorkGraph(tickets).tree('board').map(shape)).toEqual([
      'READY_FOR_DEV@0',
      'IMPLEMENTING@1',
      'IMPLEMENTED@2',
      'VERIFYING@3',
    ]);
  });

  it('lands a READY_FOR_DEV epic and ticket on the board, in the Ready for Dev column', () => {
    const entries = [entry('e', 'EPIC', 'READY_FOR_DEV'), entry('t', 'TICKET', 'READY_FOR_DEV')];
    const graph = new WorkGraph(entries);
    expect(entries.map((e) => graph.phaseOf(e))).toEqual(['board', 'board']);
    expect(graph.tree('board').map(shape)).toEqual(['e@0', 't@0']);
  });

  it('puts REFINED work in the schedule, off the board, its pieces with it', () => {
    const entries = [
      entry('e', 'EPIC', 'REFINED'),
      entry('f', 'FEATURE', 'REFINED', 'e'),
      entry('t', 'TICKET', 'REFINED'),
    ];
    const graph = new WorkGraph(entries);
    expect(entries.map((e) => graph.phaseOf(e))).toEqual(['schedule', 'schedule', 'schedule']);
    expect(entries.map((e) => graph.columnOf(e))).toEqual([undefined, undefined, undefined]);
    expect(graph.tree('board')).toEqual([]);
    expect(graph.tree('schedule').map(shape)).toEqual(['e(f)', 't']);
    expect(graph.count('schedule')).toBe(2);
  });

  it('lists REFINED and READY_FOR_DEV epics and tickets for the Schedule tab, in number order', () => {
    const entries = [
      entry('scheduled-ticket', 'TICKET', 'READY_FOR_DEV'),
      entry('refined-epic', 'EPIC', 'REFINED'),
      entry('refined-feature', 'FEATURE', 'REFINED', 'refined-epic'),
      entry('refined-task', 'TASK', 'REFINED', 'refined-feature'),
      entry('scheduled-epic', 'EPIC', 'READY_FOR_DEV'),
      entry('scheduled-feature', 'FEATURE', 'READY_FOR_DEV', 'scheduled-epic'),
      entry('refined-campaign', 'CAMPAIGN', 'REFINED'),
      entry('refined-ticket', 'TICKET', 'REFINED'),
      entry('started', 'TICKET', 'IMPLEMENTING'),
      entry('reported', 'EPIC', 'REPORTED'),
    ];
    const { toSchedule, scheduled } = new WorkGraph(entries).scheduling();
    expect(toSchedule.map((e) => e.id)).toEqual(['refined-epic', 'refined-ticket']);
    expect(scheduled.map((e) => e.id)).toEqual(['scheduled-ticket', 'scheduled-epic']);
  });

  it('falls a status this map does not know back to the backlog, rather than drawing it nowhere', () => {
    const entries = [entry('e', 'EPIC', 'SOME_FUTURE_STATUS')];
    const graph = new WorkGraph(entries);
    expect(graph.phaseOf(entries[0])).toBe('backlog');
    expect(graph.tree('backlog').map(shape)).toEqual(['e']);
    expect(graph.tree('board')).toEqual([]);
  });

  it('nests features and tasks under their epic, each in its own column', () => {
    const tree = new WorkGraph(epic).tree('board');
    expect(tree.map(shape)).toEqual(['epic@1(shipped@2(t1@2 t2@1) open@0(t3@0))']);
  });

  it('leaves the pieces of a VERIFYING epic where their own status puts them', () => {
    const tree = new WorkGraph(withEpic('VERIFYING')).tree('board');
    expect(tree.map(shape)).toEqual(['epic@3(shipped@2(t1@2 t2@1) open@0(t3@0))']);
  });

  it('takes a VERIFIED epic into acceptance and leaves its open pieces on the board', () => {
    const graph = new WorkGraph(withEpic('VERIFIED'));
    expect(graph.tree('board').map(shape)).toEqual(['~epic(shipped@2(t1@2 t2@1) open@0(t3@0))']);
    expect(graph.tree('acceptance').map(shape)).toEqual(['epic']);
  });

  it('takes a VERIFIED task into acceptance, its feature and epic as context', () => {
    const entries = withStatus({ t1: 'VERIFIED' });
    const graph = new WorkGraph(entries);
    expect(graph.tree('acceptance').map(shape)).toEqual(['~epic(~shipped(t1))']);
    expect(graph.columnOf(entries[2])).toBeUndefined();
    expect(graph.tree('board').map(shape)).toEqual(['epic@1(shipped@2(t2@1) open@0(t3@0))']);
  });

  it('archives a DONE epic with its whole tree, verified items included', () => {
    const graph = new WorkGraph(withStatus({ epic: 'DONE', t1: 'VERIFIED' }));
    expect(graph.tree('board')).toEqual([]);
    expect(graph.tree('acceptance')).toEqual([]);
    expect(graph.tree('archive').map(shape)).toEqual(['epic(shipped(t1 t2) open(t3))']);
  });

  it('archives a DROPPED epic with its whole tree', () => {
    const graph = new WorkGraph(withEpic('DROPPED'));
    expect(graph.tree('board')).toEqual([]);
    expect(graph.tree('archive').map(shape)).toEqual(['epic(shipped(t1 t2) open(t3))']);
  });

  // A REFINED campaign ordering a VERIFIED epic, a READY_FOR_DEV epic with a feature, a REPORTED
  // ticket; plus an IMPLEMENTED ticket outside it.
  const campaign = [
    entry('campaign', 'CAMPAIGN', 'REFINED'),
    entry('verified', 'EPIC', 'VERIFIED'),
    entry('running', 'EPIC', 'READY_FOR_DEV'),
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

  it('lists the campaigns in the board’s order, whatever the list’s order', () => {
    const second = entry('second', 'CAMPAIGN', 'REFINED');
    const graph = new WorkGraph([second, ...campaign], members);
    expect(graph.campaigns().map((c) => c.id)).toEqual(['campaign', 'second']);
    expect(new WorkGraph(epic).campaigns()).toEqual([]);
  });

  it('splits the campaigns into open and archived by their phase', () => {
    const done = entry('done', 'CAMPAIGN', 'DONE');
    const dropped = entry('dropped', 'CAMPAIGN', 'DROPPED');
    const reported = entry('reported', 'CAMPAIGN', 'REPORTED');
    const verified = entry('verified-campaign', 'CAMPAIGN', 'VERIFIED');
    const graph = new WorkGraph([dropped, ...campaign, done, reported, verified], members);
    expect(graph.openCampaigns().map((c) => c.id)).toEqual([
      'campaign',
      'reported',
      'verified-campaign',
    ]);
    // In the board's order (by number), not the list's.
    expect(graph.archivedCampaigns().map((c) => c.id)).toEqual(['done', 'dropped']);
    // Campaigns stay out of the phase counts.
    expect(graph.count('archive')).toBe(0);
  });

  it('gives a campaign’s members in campaign order, each with its whole subtree', () => {
    const graph = new WorkGraph(campaign, members);
    expect(graph.membersOf(campaign[0]).map(shape)).toEqual([
      'running(feature)',
      'verified',
      'waiting',
    ]);
  });

  it('tags a member with its other campaigns only, and leaves out a member not in the list', () => {
    const two = [...campaign, entry('second', 'CAMPAIGN', 'REFINED')];
    const graph = new WorkGraph(two, { campaign: ['verified', 'gone'], second: ['verified'] });
    expect(graph.membersOf(two[0]).map(shape)).toEqual(['verified{second}']);
    expect(graph.membersOf(two[6]).map(shape)).toEqual(['verified{campaign}']);
  });

  it('gives an item with its whole subtree and every campaign tag, whatever the phase', () => {
    const graph = new WorkGraph(campaign, members);
    expect(shape(graph.nodeOf(campaign[2]))).toBe('running{campaign}(feature)');
    const epics = new WorkGraph(epic);
    expect(shape(epics.nodeOf(epic[0]))).toBe('epic(shipped(t1 t2) open(t3))');
    expect(shape(epics.nodeOf(epic[1]))).toBe('shipped(t1 t2)');
    expect(shape(epics.nodeOf(epic[2]))).toBe('t1');
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
      entry('t', 'TICKET', 'READY_FOR_DEV'),
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

  it('counts the epics and tickets in a phase, not their features, tasks or campaigns', () => {
    const graph = new WorkGraph([
      entry('r', 'TICKET', 'REPORTED'),
      entry('s', 'TICKET', 'REFINED'),
      entry('e', 'EPIC', 'IMPLEMENTING'),
      entry('f', 'FEATURE', 'IMPLEMENTING', 'e'),
      entry('k', 'TASK', 'REPORTED', 'f'),
      entry('t', 'TICKET', 'VERIFYING'),
      entry('c', 'CAMPAIGN', 'REFINED'),
      entry('d', 'TICKET', 'DONE'),
      entry('x', 'EPIC', 'DROPPED'),
    ]);
    expect(graph.count('backlog')).toBe(1);
    expect(graph.count('schedule')).toBe(1);
    expect(graph.count('board')).toBe(2);
    expect(graph.count('acceptance')).toBe(0);
    expect(graph.count('archive')).toBe(2);
  });

  it('counts an epic’s tasks per board column, zero columns included', () => {
    const [implementing] = new WorkGraph(epic).tree('board');
    expect(taskDistribution(implementing)).toEqual({
      columns: [1, 1, 1, 0],
      verified: 0,
      total: 3,
    });
    const [verifying] = new WorkGraph(withStatus({ t1: 'VERIFYING' })).tree('board');
    expect(taskDistribution(verifying)).toEqual({
      columns: [1, 1, 0, 1],
      verified: 0,
      total: 3,
    });
  });

  it('counts the tasks below a node whose own status is VERIFIED or DONE, wherever they are', () => {
    const graph = new WorkGraph(withStatus({ t1: 'VERIFIED', t2: 'DONE' }));
    const [board] = graph.tree('board');
    expect(shape(board)).toBe('epic@1(shipped@2 open@0(t3@0))');
    expect(taskDistribution(board)).toEqual({ columns: [1, 0, 0, 0], verified: 2, total: 3 });
    // The epic in acceptance, there only as context to t1, counts the same tasks.
    const [acceptance] = graph.tree('acceptance');
    expect(acceptance.tasks).toEqual(board.tasks);
    // A feature whose tasks are all past the board: on the board, no task in a column, both counted.
    const shipped = board.children[0];
    expect(taskDistribution(shipped)).toEqual({ columns: [0, 0, 0, 0], verified: 2, total: 2 });
    expect(taskDistribution(board.children[1])).toEqual({
      columns: [1, 0, 0, 0],
      verified: 0,
      total: 1,
    });
  });

  it('counts only the total off the board', () => {
    const reported = withStatus({
      epic: 'REPORTED',
      shipped: 'REPORTED',
      t1: 'REPORTED',
      t2: 'REPORTED',
      open: 'REPORTED',
      t3: 'REPORTED',
    });
    const [backlog] = new WorkGraph(reported).tree('backlog');
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
        ...entry(id, archetype, parent ? undefined : 'READY_FOR_DEV', parent),
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
