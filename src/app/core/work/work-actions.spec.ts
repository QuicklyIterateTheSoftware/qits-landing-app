import { goldenMaster } from '../../../testing/golden-masters';
import type { ArchetypeEntry, LegalMove } from './archetypes.consumes';
import { lookOf, workActions, type WorkActionGroupId } from './work-actions';

/** qits-projects' recorded registry ("the archetype registry"), by archetype. */
const registry: Record<string, ArchetypeEntry> = Object.fromEntries(
  goldenMaster('the archetype registry', 'listArchetypes').archetypes.map((a: ArchetypeEntry) => [
    a.archetype,
    a,
  ]),
);

type Table = Partial<Record<WorkActionGroupId, readonly string[]>>;

/** `workActions` as group id → each action's label. */
const shown = (archetype: string, status: string | null, entry = registry[archetype]): Table =>
  Object.fromEntries(
    workActions(entry, archetype, status).map((g) => [g.id, g.actions.map((a) => lookOf(a).label)]),
  );

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
      // REFINED waits for a person to schedule it: nothing to dispatch (qits-887).
      ['REFINED', { status: ['Mark ready for dev', 'Back to reported', 'Drop'], plan: PLAN }],
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

  it('lists the flow in the Dispatch popover', () => {
    const [agent] = workActions(registry['EPIC'], 'EPIC', 'READY_FOR_DEV');
    expect(lookOf(agent.actions[0]).details).toEqual({
      title: 'Runs',
      items: ['implement → IMPLEMENTED', 'verify → VERIFIED'],
    });
  });

  it('labels each kind of move, and an unknown kind as a plain move', () => {
    const looks = ['FORWARD', 'SKIP', 'BACK', 'DROP', 'REOPEN', 'SIDEWAYS'].map((kind) =>
      lookOf({ kind: 'move', move: { to: 'REFINED', kind: kind as LegalMove['kind'] } }),
    );
    expect(looks).toEqual([
      { label: 'Mark refined', variant: 'success' },
      { label: 'Skip to refined', variant: 'muted' },
      { label: 'Back to refined', variant: 'muted' },
      { label: 'Drop', variant: 'danger' },
      { label: 'Reopen', variant: 'muted' },
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
