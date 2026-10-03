import { workActions, type WorkActionGroupId, type WorkActionId } from './work-actions';

type Table = Partial<Record<WorkActionGroupId, readonly WorkActionId[]>>;

/** `workActions` as a plain object: group id → action ids. */
const shown = (archetype: string, status: string | null): Table =>
  Object.fromEntries(workActions(archetype, status).map((g) => [g.id, g.actions]));

const AGENT = ['dispatch', 'nextPhase'] as const;
const PLAN = ['edit', 'reshape'] as const;

describe('workActions', () => {
  // An epic and a ticket share one lifecycle, so one table.
  describe.each(['EPIC', 'TICKET'])('%s', (archetype) => {
    it.each<[string, Table]>([
      [
        'REPORTED',
        { agent: AGENT, status: ['markRefined', 'drop', 'block'], plan: [...PLAN, 'refine'] },
      ],
      ['REFINED', { agent: AGENT, status: ['drop', 'block'], plan: PLAN }],
      ['IMPLEMENTING', { agent: AGENT, status: ['drop', 'block'] }],
      ['IMPLEMENTED', { agent: AGENT, status: ['drop', 'block'] }],
      ['VERIFYING', { agent: AGENT, status: ['drop', 'block'] }],
      ['VERIFIED', { status: ['drop'] }],
      ['DONE', {}],
      ['DROPPED', {}],
    ])('at %s', (status, expected) => {
      expect(shown(archetype, status)).toEqual(expected);
    });
  });

  describe('CAMPAIGN', () => {
    it.each<[string, Table]>([
      ['REPORTED', { status: ['markRefined', 'drop'] }],
      ['REFINED', { agent: ['dispatch'], status: ['drop', 'block'] }],
      ['IMPLEMENTING', { status: ['drop'] }],
      ['IMPLEMENTED', { status: ['drop'] }],
      ['VERIFYING', { status: ['drop'] }],
      ['VERIFIED', { status: ['drop'] }],
      ['DONE', {}],
      ['DROPPED', {}],
    ])('at %s', (status, expected) => {
      expect(shown('CAMPAIGN', status)).toEqual(expected);
    });
  });

  // A feature or a task takes its epic's status, and has no lifecycle of its own.
  describe.each(['FEATURE', 'TASK'])('%s', (archetype) => {
    it.each<[string | null, Table]>([
      ['REPORTED', { plan: PLAN }],
      ['REFINED', { plan: PLAN }],
      ['IMPLEMENTING', {}],
      ['IMPLEMENTED', {}],
      ['VERIFYING', {}],
      ['VERIFIED', {}],
      ['DONE', {}],
      ['DROPPED', {}],
      [null, {}],
    ])('under an epic at %s', (status, expected) => {
      expect(shown(archetype, status)).toEqual(expected);
    });
  });

  it('offers nothing for an unknown archetype or a missing status', () => {
    expect(workActions(undefined, 'REPORTED')).toEqual([]);
    expect(workActions('EPIC', undefined)).toEqual([]);
  });

  it('keeps the groups in order: agent, status, plan', () => {
    expect(workActions('TICKET', 'REPORTED').map((g) => g.id)).toEqual(['agent', 'status', 'plan']);
  });
});
