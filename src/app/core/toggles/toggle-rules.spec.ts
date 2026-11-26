import {
  draftsOf,
  movedRule,
  newRule,
  ruleInBrief,
  sentRules,
  subjectsOf,
  withoutRule,
  withRule,
} from './toggle-rules';

describe('toggle rules', () => {
  const rules = [
    { kind: 'USER', value: true, userSubjects: ['alice'], afterInstant: null },
    { kind: 'TIME', value: false, userSubjects: null, afterInstant: '2026-12-01T00:00:00Z' },
    { kind: 'STATIC', value: false, userSubjects: null, afterInstant: null },
  ];

  it('says each rule in brief', () => {
    expect(rules.map(ruleInBrief)).toEqual([
      'user alice → on',
      'from 2026-12-01T00:00:00Z → off',
      'else off',
    ]);
    expect(ruleInBrief({ kind: 'USER', value: false, userSubjects: ['a', 'b'] })).toBe(
      'user 2 subjects → off',
    );
  });

  it('keeps the STATIC rule last, adding the declared default when none is', () => {
    expect(draftsOf(rules, true).map((draft) => draft.kind)).toEqual(['USER', 'TIME', 'STATIC']);
    expect(draftsOf([], true)).toEqual([{ kind: 'STATIC', value: true, subjects: '', after: '' }]);
  });

  it('sends what the editor holds, subjects split and deduplicated', () => {
    expect(subjectsOf(' alice,bob\nalice  tok-agent-x ')).toEqual(['alice', 'bob', 'tok-agent-x']);
    expect(sentRules(draftsOf(rules, false))).toEqual([
      { kind: 'USER', value: true, userSubjects: ['alice'] },
      { kind: 'TIME', value: false, afterInstant: '2026-12-01T00:00:00Z' },
      { kind: 'STATIC', value: false },
    ]);
  });

  it('adds before the STATIC rule, never removes it, and moves nothing past it', () => {
    const drafts = draftsOf(rules, false);
    expect(withRule(drafts, newRule('TIME')).map((draft) => draft.kind)).toEqual([
      'USER',
      'TIME',
      'TIME',
      'STATIC',
    ]);
    expect(withoutRule(drafts, 2)).toEqual(drafts);
    expect(withoutRule(drafts, 0).map((draft) => draft.kind)).toEqual(['TIME', 'STATIC']);
    expect(movedRule(drafts, 0, 1).map((draft) => draft.kind)).toEqual(['TIME', 'USER', 'STATIC']);
    expect(movedRule(drafts, 1, 1)).toEqual(drafts);
    expect(movedRule(drafts, 2, -1)).toEqual(drafts);
  });
});
