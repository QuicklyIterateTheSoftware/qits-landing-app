import { goldenMaster } from '../../../testing/golden-masters';
import type { ArchetypeEntry, LegalMove } from './archetypes.consumes';
import { allClosed, lookOf, workActions, type WorkActionGroupId } from './work-actions';

/** qits-projects' recorded registry ("the archetype registry"), by archetype. */
const registry: Record<string, ArchetypeEntry> = Object.fromEntries(
  goldenMaster('the archetype registry', 'listWorkArchetypes').archetypes.map(
    (a: ArchetypeEntry) => [a.archetype, a],
  ),
);

type Table = Partial<Record<WorkActionGroupId, readonly string[]>>;

/** `workActions` as group id → each action's label; `children` are the direct children's statuses. */
const shown = (
  archetype: string,
  status: string | null,
  entry = registry[archetype],
  children?: readonly (string | null | undefined)[],
): Table =>
  Object.fromEntries(
    workActions(entry, archetype, status, children).map((g) => [
      g.id,
      g.actions.map((a) => lookOf(a).label),
    ]),
  );

/**
 * `archetype`'s recorded entry with a CLOSE move to DONE out of `status` (qits-1757), placed before
 * DROP as the service serves it. Derived: the recording installed here predates the CLOSE kind.
 */
const withClose = (archetype: string, status: string): ArchetypeEntry => {
  const entry = registry[archetype];
  const moves = (entry.transitions?.[status] ?? []).filter((m) => m.kind !== 'CLOSE');
  const drop = moves.findIndex((m) => m.kind === 'DROP');
  const close: LegalMove = { to: 'DONE', kind: 'CLOSE', gates: ['CHILDREN_CLOSED'] };
  const at = drop < 0 ? moves.length : drop;
  return {
    ...entry,
    transitions: {
      ...entry.transitions,
      [status]: [...moves.slice(0, at), close, ...moves.slice(at)],
    },
  };
};

const PLAN = ['Edit', 'Reshape'];

describe('workActions', () => {
  // An epic and a ticket hold one lifecycle in the recording, so one table.
  describe.each(['EPIC', 'TICKET'])('%s, from the registry', (archetype) => {
    it.each<[string, Table]>([
      [
        'REPORTED',
        {
          agent: ['Dispatch', 'Refine'],
          status: ['Mark refined', 'Drop', 'Block'],
          plan: [...PLAN, 'Refinement room'],
        },
      ],
      // A person's Dispatch pre-approves the scheduling, running the whole flow in one press
      // (qits-1075); `next` stays null, so only Dispatch appears, not Implement.
      [
        'REFINED',
        {
          agent: ['Dispatch'],
          status: ['Mark ready for dev', 'Back to reported', 'Drop', 'Block'],
          plan: PLAN,
        },
      ],
      [
        'READY_FOR_DEV',
        {
          agent: ['Dispatch', 'Implement'],
          status: ['Mark implementing', 'Skip to implemented', 'Back to refined', 'Drop', 'Block'],
        },
      ],
      [
        'IMPLEMENTING',
        {
          agent: ['Dispatch', 'Implement'],
          status: ['Mark implemented', 'Drop', 'Block'],
        },
      ],
      [
        'IMPLEMENTED',
        {
          agent: ['Dispatch', 'Verify'],
          status: ['Mark verifying', 'Skip to verified', 'Back to implementing', 'Drop', 'Block'],
        },
      ],
      [
        'VERIFYING',
        {
          agent: ['Dispatch', 'Verify'],
          status: ['Mark verified', 'Back to implemented', 'Drop', 'Block'],
        },
      ],
      ['VERIFIED', { status: ['Mark done', 'Back to verifying', 'Drop'] }],
      ['DONE', {}],
      ['DROPPED', { status: ['Reopen'] }],
    ])('at %s', (status, expected) => {
      expect(shown(archetype, status)).toEqual(expected);
    });
  });

  it('gives a feature or a task its moves and the plan, but nothing to dispatch', () => {
    for (const archetype of ['FEATURE', 'TASK']) {
      expect(shown(archetype, 'REFINED')).toEqual({
        status: ['Mark ready for dev', 'Back to reported', 'Drop'],
        plan: PLAN,
      });
      expect(shown(archetype, 'IMPLEMENTED')).toEqual({
        status: ['Mark verifying', 'Skip to verified', 'Back to implementing', 'Drop'],
      });
    }
  });

  it('gives a campaign its moves and the interim start, and no plan', () => {
    expect(shown('CAMPAIGN', 'REFINED')).toEqual({
      agent: ['Start campaign'],
      status: ['Mark ready for dev', 'Back to reported', 'Drop', 'Block'],
    });
    expect(shown('CAMPAIGN', 'VERIFIED')).toEqual({
      status: ['Mark done', 'Back to implemented', 'Drop'],
    });
  });

  describe('Close as done (qits-1757)', () => {
    const feature = withClose('FEATURE', 'IMPLEMENTED');
    const featureMoves = (children?: readonly (string | null | undefined)[]) =>
      shown('FEATURE', 'IMPLEMENTED', feature, children).status;

    it('shows when every child is DONE or DROPPED', () => {
      expect(featureMoves(['DONE', 'DROPPED', 'DONE'])).toEqual([
        'Mark verifying',
        'Skip to verified',
        'Back to implementing',
        'Close as done',
        'Drop',
      ]);
      expect(featureMoves(['DROPPED'])).toContain('Close as done');
    });

    it('hides while one child is still open', () => {
      expect(featureMoves(['DONE', 'VERIFIED'])).not.toContain('Close as done');
      expect(featureMoves(['DONE', null])).not.toContain('Close as done');
    });

    it('hides when there are no children, or they are not known', () => {
      expect(featureMoves([])).not.toContain('Close as done');
      expect(featureMoves(undefined)).not.toContain('Close as done');
    });

    it('leaves a campaign’s start alone: CLOSE is not a forward move', () => {
      const campaign = withClose('CAMPAIGN', 'REFINED');
      expect(shown('CAMPAIGN', 'REFINED', campaign, ['DONE', 'DROPPED'])).toEqual({
        agent: ['Start campaign'],
        status: ['Mark ready for dev', 'Back to reported', 'Close as done', 'Drop', 'Block'],
      });
      expect(shown('CAMPAIGN', 'REFINED', campaign, ['DONE', 'REFINED'])).toEqual({
        agent: ['Start campaign'],
        status: ['Mark ready for dev', 'Back to reported', 'Drop', 'Block'],
      });
      // One start, whatever the CLOSE move beside it.
      const reported = withClose('CAMPAIGN', 'REPORTED');
      expect(shown('CAMPAIGN', 'REPORTED', reported, ['DONE']).agent).toEqual(['Start campaign']);
    });

    it('counts DONE and DROPPED as closed, and nothing else', () => {
      expect(allClosed(['DONE', 'DROPPED'])).toBe(true);
      expect(allClosed(['DONE', 'VERIFIED'])).toBe(false);
      expect(allClosed(['DONE', undefined])).toBe(false);
      expect(allClosed([])).toBe(false);
      expect(allClosed(undefined)).toBe(false);
    });
  });

  it('lists the flow in the Dispatch popover', () => {
    const [agent] = workActions(registry['EPIC'], 'EPIC', 'READY_FOR_DEV');
    expect(lookOf(agent.actions[0]).details).toEqual({
      title: 'Runs',
      items: ['implement → IMPLEMENTED', 'verify → VERIFIED'],
    });
  });

  it('labels each kind of move, and an unknown kind as a plain move', () => {
    const looks = ['FORWARD', 'SKIP', 'BACK', 'DROP', 'REOPEN', 'CLOSE', 'SIDEWAYS'].map((kind) =>
      lookOf({ kind: 'move', move: { to: 'REFINED', kind: kind as LegalMove['kind'] } }),
    );
    expect(looks).toEqual([
      { label: 'Mark refined', variant: 'success' },
      { label: 'Skip to refined', variant: 'muted' },
      { label: 'Back to refined', variant: 'muted' },
      { label: 'Drop', variant: 'danger' },
      { label: 'Reopen', variant: 'muted' },
      { label: 'Close as done', variant: 'success' },
      { label: 'Move to refined', variant: 'muted' },
    ]);
  });

  it('spells a status word with underscores as words', () => {
    const look = lookOf({ kind: 'move', move: { to: 'READY_FOR_DEV', kind: 'BACK' } });
    expect(look.label).toBe('Back to ready for dev');
  });

  it('offers only the plan until the registry is in', () => {
    const groups = workActions(undefined, 'EPIC', 'REPORTED');
    expect(groups.map((g) => [g.id, g.actions.map((a) => lookOf(a).label)])).toEqual([
      ['plan', PLAN],
    ]);
  });
});
