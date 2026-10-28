import {
  attentionAction,
  attentionCount,
  needsAttention,
  waitSubject,
  type AttentionAgent,
  type WaitContext,
  type WaitLike,
} from './agent-attention';

const CI = 'https://ci.qits.example';
const REQUEST_ID = '00000000-0000-4000-8000-0000000000c1';
const RUN_ID = '00000000-0000-4000-8000-0000000000c2';
const ITEM_ID = '00000000-0000-4000-8000-000000000011';

/** The shapes of state `a project with agents needing attention`, inline. */
const ctx: WaitContext = {
  slug: 'contract',
  ciOrigin: CI,
  releaseRequests: [
    {
      id: REQUEST_ID,
      qualifiedId: 'contract-qits-rr-368',
      state: 'RELEASED',
      gates: [{ kind: 'QA', state: 'PASSED' }],
    },
  ],
  work: [{ id: ITEM_ID, qualifiedId: 'contract-5', title: 'PDF export', status: 'VERIFYING' }],
};

const requestWait: WaitLike = {
  id: 'w-request',
  label: 'release request contract-qits-rr-368 to end',
  subjectKind: 'RELEASE_REQUEST',
  subjectRef: REQUEST_ID,
  subjectId: REQUEST_ID,
  subjectQualifiedId: 'contract-qits-rr-368',
  subjectState: 'FINALIZED',
};
const runWait: WaitLike = {
  id: 'w-run',
  label: 'the run to end',
  subjectKind: 'CI_RUN',
  subjectRef: RUN_ID,
  subjectId: RUN_ID,
  subjectState: 'RUNNING',
};
const itemWait: WaitLike = {
  id: 'w-item',
  label: 'contract-5 to be VERIFIED',
  subjectKind: 'WORK_ITEM',
  subjectRef: ITEM_ID,
  subjectId: ITEM_ID,
  subjectQualifiedId: 'contract-5',
  subjectState: 'IMPLEMENTING',
};
const commentsWait: WaitLike = {
  id: 'w-comments',
  label: 'a comment on contract-5',
  subjectKind: 'COMMENTS',
  subjectRef: ITEM_ID,
  subjectId: ITEM_ID,
};
const otherWait: WaitLike = { id: 'w-other', label: 'the owner to reply', subjectKind: 'OTHER' };

describe('agent attention', () => {
  it('needs attention exactly when the agent carries one, and counts those', () => {
    const agents = [
      { attention: { code: 'IDLE_NO_WAIT' as const } },
      { attention: undefined },
      { attention: null },
      { attention: { code: 'WAIT_OVERDUE' as const } },
    ];
    expect(agents.map(needsAttention)).toEqual([true, false, false, true]);
    expect(attentionCount(agents)).toBe(2);
    expect(attentionCount([])).toBe(0);
  });

  describe('waitSubject', () => {
    it('shows a release request by its qualified id, with the store’s state and gates', () => {
      expect(waitSubject(requestWait, ctx)).toEqual({
        kind: 'RELEASE_REQUEST',
        text: 'contract-qits-rr-368',
        state: 'RELEASED',
        gates: [{ kind: 'QA', state: 'PASSED' }],
        link: '/projects/contract/release-requests/contract-qits-rr-368',
      });
    });

    it('matches the request by its qualified id too, and falls back to the listing’s state', () => {
      const byQualifiedId = { ...requestWait, subjectId: undefined, subjectRef: undefined };
      expect(waitSubject(byQualifiedId, ctx).state).toBe('RELEASED');
      const unknown = waitSubject(requestWait, { slug: 'contract' });
      expect(unknown.state).toBe('FINALIZED');
      expect(unknown.gates).toEqual([]);
      expect(unknown.link).toBe('/projects/contract/release-requests/contract-qits-rr-368');
      const unresolved = waitSubject(
        { ...requestWait, subjectId: undefined, subjectQualifiedId: undefined },
        { slug: 'contract' },
      );
      expect(unresolved.text).toBe('release request contract-qits-rr-368 to end');
      expect(unresolved.link).toBeNull();
    });

    it('links a run into qits-ci, and not without its origin', () => {
      expect(waitSubject(runWait, ctx)).toEqual({
        kind: 'CI_RUN',
        text: 'CI run 00000000',
        state: 'RUNNING',
        link: `${CI}/runs/${RUN_ID}`,
      });
      expect(waitSubject(runWait, { slug: 'contract' }).link).toBeNull();
    });

    it('links a work item to its page, with the open project’s status', () => {
      expect(waitSubject(itemWait, ctx)).toEqual({
        kind: 'WORK_ITEM',
        text: 'contract-5',
        state: 'VERIFYING',
        link: '/projects/contract/work/detail/contract-5',
      });
      expect(waitSubject(itemWait, { slug: 'contract' }).state).toBe('IMPLEMENTING');
    });

    it('links an item’s comments to the item, resolving it from the open project’s work', () => {
      expect(waitSubject(commentsWait, ctx)).toEqual({
        kind: 'COMMENTS',
        text: 'Comments on contract-5',
        state: undefined,
        link: '/projects/contract/work/detail/contract-5',
      });
      const unresolved = waitSubject(commentsWait, { slug: 'contract' });
      expect(unresolved.text).toBe('a comment on contract-5');
      expect(unresolved.link).toBeNull();
    });

    it('shows anything else by its label, with no link', () => {
      expect(waitSubject(otherWait, ctx)).toEqual({
        kind: 'OTHER',
        text: 'the owner to reply',
        state: undefined,
        link: null,
      });
    });
  });

  describe('attentionAction', () => {
    const agent = (attention: AttentionAgent['attention']): AttentionAgent => ({
      entityId: 'contract-10',
      waits: [requestWait, runWait],
      attention,
    });

    it('has nothing to do for an agent that needs nothing', () => {
      expect(attentionAction(agent(undefined), ctx)).toBeUndefined();
    });

    it('prompts the agent when its wait’s subject passed, beside the subject', () => {
      expect(
        attentionAction(agent({ code: 'WAIT_SUBJECT_PASSED', waitId: 'w-request' }), ctx),
      ).toEqual({
        kind: 'prompt',
        label: 'Prompt agent',
        subject: waitSubject(requestWait, ctx),
      });
    });

    it('prompts an idle agent with no wait', () => {
      expect(attentionAction(agent({ code: 'IDLE_NO_WAIT' }), ctx)).toEqual({
        kind: 'prompt',
        label: 'Prompt agent',
      });
    });

    it('opens the item of an agent blocked with no desk comment', () => {
      expect(attentionAction(agent({ code: 'BLOCKED_NO_DESK' }), ctx)).toEqual({
        kind: 'open-item',
        label: 'Open item',
        link: '/projects/contract/work/detail/contract-10',
      });
    });

    it('goes to an overdue wait’s subject', () => {
      expect(attentionAction(agent({ code: 'WAIT_OVERDUE', waitId: 'w-run' }), ctx)).toEqual({
        kind: 'subject',
        label: 'CI run 00000000',
        subject: waitSubject(runWait, ctx),
      });
    });

    it('falls back to prompting when the wait it names is gone', () => {
      expect(attentionAction(agent({ code: 'WAIT_OVERDUE', waitId: 'gone' }), ctx)).toEqual({
        kind: 'prompt',
        label: 'Prompt agent',
      });
      expect(attentionAction(agent({ code: 'WAIT_SUBJECT_PASSED', waitId: 'gone' }), ctx)).toEqual({
        kind: 'prompt',
        label: 'Prompt agent',
      });
    });
  });
});
