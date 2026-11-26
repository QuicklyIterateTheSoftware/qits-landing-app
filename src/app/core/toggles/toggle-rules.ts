/**
 * A toggle's ordered rules as the Toggles section draws and edits them (qits-2704): the first rule
 * that matches answers its own value. USER matches the chain's on-behalf-of user or the caller's own
 * bearer `sub`; TIME matches from its instant on; the one STATIC rule, always last, always matches.
 */
export type RuleKind = 'USER' | 'TIME' | 'STATIC';

/** One rule as the editor holds it: a person types subjects, and a TIME rule's instant. */
export interface RuleDraft {
  readonly kind: RuleKind;
  readonly value: boolean;
  /** USER: the bearer subjects, one per line or comma-separated as typed. */
  readonly subjects: string;
  /** TIME: an ISO-8601 instant (`2026-12-01T00:00:00Z`). */
  readonly after: string;
}

/** A rule as qits-toggles reads and answers it. */
export interface WireRule {
  readonly kind?: string;
  readonly value?: boolean;
  readonly userSubjects?: readonly string[] | null;
  readonly afterInstant?: string | null;
}

/** A rule as a save sends it: only the field its kind uses. */
export interface SentRule {
  kind: RuleKind;
  value: boolean;
  userSubjects?: string[];
  afterInstant?: string;
}

const KINDS: readonly RuleKind[] = ['USER', 'TIME', 'STATIC'];

const kindOf = (kind: string | undefined): RuleKind =>
  KINDS.includes(kind as RuleKind) ? (kind as RuleKind) : 'STATIC';

/** One rule in brief, for the list: `user alice, bob → on`, `from 1 Dec 2026 → on`, `else off`. */
export function ruleInBrief(rule: WireRule): string {
  const value = rule.value ? 'on' : 'off';
  switch (kindOf(rule.kind)) {
    case 'USER': {
      const subjects = rule.userSubjects ?? [];
      return `user ${subjects.length === 1 ? subjects[0] : `${subjects.length} subjects`} → ${value}`;
    }
    case 'TIME':
      return `from ${rule.afterInstant ?? '?'} → ${value}`;
    case 'STATIC':
      return `else ${value}`;
  }
}

/** The rules as the editor holds them, the STATIC rule kept last (one added when none is). */
export function draftsOf(rules: readonly WireRule[], declaredDefault: boolean): RuleDraft[] {
  const drafts = rules
    .filter((rule) => kindOf(rule.kind) !== 'STATIC')
    .map((rule): RuleDraft => ({
      kind: kindOf(rule.kind),
      value: rule.value ?? false,
      subjects: (rule.userSubjects ?? []).join('\n'),
      after: rule.afterInstant ?? '',
    }));
  const fixed = rules.find((rule) => kindOf(rule.kind) === 'STATIC');
  drafts.push({ kind: 'STATIC', value: fixed?.value ?? declaredDefault, subjects: '', after: '' });
  return drafts;
}

/** A typed list of subjects, split on commas and line breaks, blanks and repeats dropped. */
export function subjectsOf(typed: string): string[] {
  const seen = new Set<string>();
  for (const subject of typed.split(/[\s,]+/)) {
    if (subject) seen.add(subject);
  }
  return [...seen];
}

/** The rules as a save sends them, in order. The service checks the shape and names a fault. */
export function sentRules(drafts: readonly RuleDraft[]): SentRule[] {
  return drafts.map((draft): SentRule => {
    const rule: SentRule = { kind: draft.kind, value: draft.value };
    if (draft.kind === 'USER') rule.userSubjects = subjectsOf(draft.subjects);
    if (draft.kind === 'TIME' && draft.after.trim()) rule.afterInstant = draft.after.trim();
    return rule;
  });
}

/** A new rule of `kind`, answering `true`, to be placed before the STATIC rule. */
export function newRule(kind: 'USER' | 'TIME'): RuleDraft {
  return { kind, value: true, subjects: '', after: '' };
}

/** The drafts with a new rule just before the STATIC one. */
export function withRule(drafts: readonly RuleDraft[], rule: RuleDraft): RuleDraft[] {
  const next = [...drafts];
  next.splice(Math.max(next.length - 1, 0), 0, rule);
  return next;
}

/** The drafts without the rule at `index`; the STATIC rule is never removed. */
export function withoutRule(drafts: readonly RuleDraft[], index: number): RuleDraft[] {
  if (drafts[index]?.kind === 'STATIC') return [...drafts];
  return drafts.filter((_, at) => at !== index);
}

/** The drafts with the rule at `index` moved by `by`; nothing moves past the STATIC rule. */
export function movedRule(drafts: readonly RuleDraft[], index: number, by: -1 | 1): RuleDraft[] {
  const target = index + by;
  const last = drafts.length - 1;
  if (index < 0 || index >= last || target < 0 || target >= last) return [...drafts];
  const next = [...drafts];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
