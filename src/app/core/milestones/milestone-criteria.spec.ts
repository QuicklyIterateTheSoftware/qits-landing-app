import { pendingGoldenMaster } from '../../../testing/pending-golden-masters';
import {
  describeCriterion,
  draftOf,
  draftProblems,
  groupSpecs,
  needsLabel,
  needsMilestone,
  newCriterion,
  newGroup,
  unmetOf,
} from './milestone-criteria';

describe('milestone criteria', () => {
  it('turns a recorded condition into drafts and back into the same groups, ids kept', () => {
    const { milestone } = pendingGoldenMaster(
      'a ticket waiting on an unmet milestone',
      'setMilestoneGroups',
    );
    const drafts = draftOf(milestone);
    expect(drafts).toHaveLength(2);
    expect(groupSpecs(drafts)).toEqual([
      { criteria: [{ id: milestone.groups[0].criteria[0].id, kind: 'APPROVAL', predicate: {} }] },
      {
        criteria: [
          {
            id: milestone.groups[1].criteria[0].id,
            kind: 'ENTITY_STATUS',
            predicate: milestone.groups[1].criteria[0].predicate,
          },
        ],
      },
    ]);
  });

  it('states a new criterion without an id, blank optional fields as null', () => {
    const criterion = {
      ...newCriterion('DEPLOYMENT_ACTIVE'),
      fields: { applicationName: ' qits-ci ', environmentName: '', minimumVersion: '2026.1.1' },
    };
    expect(groupSpecs([{ criteria: [criterion] }, { criteria: [] }])).toEqual([
      {
        criteria: [
          {
            kind: 'DEPLOYMENT_ACTIVE',
            predicate: {
              applicationName: 'qits-ci',
              environmentName: null,
              minimumVersion: '2026.1.1',
            },
          },
        ],
      },
    ]);
    expect(newCriterion('ENTITY_STATUS').fields).toEqual({ entityId: '', status: 'REFINED' });
    expect(newGroup().criteria[0].kind).toBe('APPROVAL');
  });

  it('says what is missing before the form can send', () => {
    expect(draftProblems('', [])).toEqual([
      'Name the milestone.',
      'Give it at least one criterion.',
    ]);
    expect(
      draftProblems('node', [{ criteria: [newCriterion('SCM_RELEASE'), newCriterion()] }]),
    ).toEqual(['Group 1, criterion 1: Repository is required.']);
    expect(draftProblems('node', [newGroup()])).toEqual([]);
  });

  it('puts each kind into words, a work item by the name it is given', () => {
    expect(
      describeCriterion(
        { kind: 'ENTITY_STATUS', predicate: { entityId: 'u-1', status: 'READY_FOR_DEV' } },
        (id) => (id === 'u-1' ? 'qits-1 (Bootstrap)' : undefined),
      ),
    ).toBe('qits-1 (Bootstrap) reaches ready for dev');
    expect(
      describeCriterion({
        kind: 'DEPLOYMENT_ACTIVE',
        predicate: { applicationName: 'qits-ci', environmentName: 'dev', minimumVersion: '1.2' },
      }),
    ).toBe('qits-ci deployed in dev at 1.2 or later');
    expect(
      describeCriterion({ kind: 'SCM_RELEASE', predicate: { repositoryName: 'qits-qits' } }),
    ).toBe('qits-qits released');
    expect(describeCriterion({ kind: 'APPROVAL', predicate: {} })).toBe('A person approves');
  });

  it('marks only the milestones not met, as "needs", never "waiting"', () => {
    const refs = [
      { id: 'a', displayName: 'bootstrap test node', satisfiedAt: null },
      { id: 'b', displayName: 'arm64 runner', satisfiedAt: '2026-01-01T00:00:00Z' },
    ];
    expect(unmetOf(refs).map(needsLabel)).toEqual(['needs: bootstrap test node']);
    expect(needsMilestone({ milestones: refs })).toBe(true);
    expect(needsMilestone({ milestones: [refs[1]] })).toBe(false);
    expect(needsMilestone({})).toBe(false);
  });
});
