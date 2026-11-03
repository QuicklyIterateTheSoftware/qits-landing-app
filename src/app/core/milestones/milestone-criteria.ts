import type { MilestoneGroupSpec } from '../../api/projects';
import type { Milestone } from './milestones.consumes';

/**
 * A milestone's condition as the editor holds it, and how it reads (epic qits-615). Groups are
 * OR'd, the criteria in a group AND'd: the milestone is met while one group holds. Pure functions,
 * no store.
 */

/** The kinds a criterion can be; the predicate shapes are qits-projects' `CriterionPredicate`. */
export const CRITERION_KINDS = [
  'ENTITY_STATUS',
  'DEPLOYMENT_ACTIVE',
  'SCM_RELEASE',
  'APPROVAL',
] as const;

export type CriterionKind = (typeof CRITERION_KINDS)[number];

/** Each kind's name, for a person. */
export const KIND_LABELS: Readonly<Record<CriterionKind, string>> = {
  ENTITY_STATUS: 'A work item reaches a status',
  DEPLOYMENT_ACTIVE: 'An application is deployed',
  SCM_RELEASE: 'A repository releases',
  APPROVAL: 'A person approves',
};

/** One field of a kind's predicate, as the editor asks for it. */
export interface PredicateField {
  readonly key: string;
  readonly label: string;
  readonly required: boolean;
  /** The words the field may hold, offered as a list; free text when absent. */
  readonly options?: readonly string[];
  readonly placeholder?: string;
}

/** The statuses an ENTITY_STATUS criterion can wait for (qits-projects' `EntityStatus`). */
export const TARGET_STATUSES = [
  'REFINED',
  'READY_FOR_DEV',
  'IMPLEMENTING',
  'IMPLEMENTED',
  'VERIFYING',
  'VERIFIED',
  'DONE',
] as const;

/** Each kind's predicate fields; APPROVAL takes none. */
export const PREDICATE_FIELDS: Readonly<Record<CriterionKind, readonly PredicateField[]>> = {
  ENTITY_STATUS: [
    { key: 'entityId', label: 'Work item', required: true, placeholder: 'qits-123' },
    { key: 'status', label: 'Status', required: true, options: TARGET_STATUSES },
  ],
  DEPLOYMENT_ACTIVE: [
    { key: 'applicationName', label: 'Application', required: true, placeholder: 'qits-ci' },
    { key: 'environmentName', label: 'Environment', required: false, placeholder: 'any' },
    { key: 'minimumVersion', label: 'At least version', required: false, placeholder: 'any' },
  ],
  SCM_RELEASE: [
    { key: 'repositoryName', label: 'Repository', required: true, placeholder: 'qits-qits' },
    { key: 'minimumVersion', label: 'At least version', required: false, placeholder: 'any' },
  ],
  APPROVAL: [],
};

/** Whether `kind` is one of {@link CRITERION_KINDS}. */
export function isCriterionKind(kind: string | undefined): kind is CriterionKind {
  return (CRITERION_KINDS as readonly (string | undefined)[]).includes(kind);
}

/** A predicate as the service answers it: its fields by name, any JSON value. */
export type Predicate = Readonly<Record<string, unknown>>;

/** One criterion in the editor: its id (an existing one keeps its latch), kind and fields. */
export interface CriterionDraft {
  readonly id?: string;
  readonly kind: string;
  /** The predicate's fields as text; a field the editor does not ask for is kept as it came. */
  readonly fields: Readonly<Record<string, string>>;
  /** The predicate as it came from the service, for the fields the editor does not ask for. */
  readonly original?: Predicate;
}

/** One group in the editor: its criteria, AND'd. */
export interface GroupDraft {
  readonly criteria: readonly CriterionDraft[];
}

/** A predicate's value as text: a string as it is, anything else empty. */
const text = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

/** A new criterion of `kind`, with its fields empty. */
export function newCriterion(kind: string = 'APPROVAL'): CriterionDraft {
  const fields = isCriterionKind(kind) ? PREDICATE_FIELDS[kind] : [];
  return {
    kind,
    fields: Object.fromEntries(fields.map((f) => [f.key, f.options ? f.options[0] : ''])),
  };
}

/** A new group of one approval criterion. */
export function newGroup(): GroupDraft {
  return { criteria: [newCriterion()] };
}

/** The editor's groups for a milestone's condition as the service answers it. */
export function draftOf(milestone: Pick<Milestone, 'groups'> | undefined): GroupDraft[] {
  return (milestone?.groups ?? []).map((group) => ({
    criteria: (group.criteria ?? []).map((criterion) => {
      const predicate = (criterion.predicate ?? {}) as Predicate;
      const kind = criterion.kind ?? '';
      const asked = isCriterionKind(kind) ? PREDICATE_FIELDS[kind] : [];
      return {
        id: criterion.id,
        kind,
        fields: Object.fromEntries(asked.map((f) => [f.key, text(predicate[f.key])])),
        original: predicate,
      };
    }),
  }));
}

/** The predicate a draft criterion states: its asked fields trimmed (blank is null). */
export function predicateOf(draft: CriterionDraft): Record<string, unknown> {
  if (draft.kind === 'APPROVAL') return {};
  const asked = isCriterionKind(draft.kind) ? PREDICATE_FIELDS[draft.kind] : [];
  const predicate: Record<string, unknown> = { ...(draft.original ?? {}) };
  for (const field of asked) {
    const value = (draft.fields[field.key] ?? '').trim();
    predicate[field.key] = value || null;
  }
  return predicate;
}

/**
 * What the editor sends (`createMilestone`'s and `setMilestoneGroups`' `groups`): every group with
 * every criterion, an existing one with its id (it keeps its latch while its kind and predicate
 * stay), a new one without. A group with no criteria is left out.
 */
export function groupSpecs(groups: readonly GroupDraft[]): MilestoneGroupSpec[] {
  return groups
    .filter((group) => group.criteria.length > 0)
    .map((group) => ({
      criteria: group.criteria.map((criterion) => ({
        ...(criterion.id ? { id: criterion.id } : {}),
        kind: criterion.kind,
        predicate: predicateOf(criterion),
      })),
    }));
}

/**
 * Why the editor cannot send yet, for a person; empty when it can. The service checks the rest
 * (an unknown work item, a version that is no version) and its 400 names each violation.
 */
export function draftProblems(name: string, groups: readonly GroupDraft[]): string[] {
  const problems: string[] = [];
  if (!name.trim()) problems.push('Name the milestone.');
  if (!groups.some((group) => group.criteria.length > 0)) {
    problems.push('Give it at least one criterion.');
  }
  groups.forEach((group, g) =>
    group.criteria.forEach((criterion, c) => {
      const asked = isCriterionKind(criterion.kind) ? PREDICATE_FIELDS[criterion.kind] : [];
      for (const field of asked) {
        if (field.required && !(criterion.fields[field.key] ?? '').trim()) {
          problems.push(`Group ${g + 1}, criterion ${c + 1}: ${field.label} is required.`);
        }
      }
    }),
  );
  return problems;
}

/** A criterion's predicate in words: "qits-12 reaches done", "qits-ci deployed at 2026.1.1 or later". */
export function describeCriterion(
  criterion: { readonly kind?: string; readonly predicate?: unknown },
  workTitle?: (entityId: string) => string | undefined,
): string {
  const predicate = (criterion.predicate ?? {}) as Predicate;
  const atLeast = text(predicate['minimumVersion'])
    ? ` at ${text(predicate['minimumVersion'])} or later`
    : '';
  switch (criterion.kind) {
    case 'ENTITY_STATUS': {
      const id = text(predicate['entityId']);
      const named = workTitle?.(id) ?? id;
      return `${named} reaches ${text(predicate['status']).toLowerCase().replaceAll('_', ' ')}`;
    }
    case 'DEPLOYMENT_ACTIVE': {
      const env = text(predicate['environmentName']);
      return `${text(predicate['applicationName'])} deployed${env ? ` in ${env}` : ''}${atLeast}`;
    }
    case 'SCM_RELEASE':
      return `${text(predicate['repositoryName'])} released${atLeast}`;
    case 'APPROVAL':
      return 'A person approves';
    default:
      return criterion.kind ?? '';
  }
}

/** A milestone as an item's or a member's reference: its id, name and since when it is met. */
export interface MilestoneRef {
  readonly id?: string;
  readonly displayName?: string;
  readonly satisfiedAt?: string | null;
}

/** The milestones of `refs` that are not met (`satisfiedAt` null). */
export function unmetOf<T extends MilestoneRef>(refs: readonly T[] | null | undefined): T[] {
  return (refs ?? []).filter((ref) => !ref.satisfiedAt);
}

/** The words a "needs" mark shows: `needs: <name>`. Never "waiting": that is an agent's word. */
export function needsLabel(ref: MilestoneRef): string {
  return `needs: ${ref.displayName ?? ref.id ?? ''}`;
}

/** Whether an item needs a milestone that is not met yet (its "needs" marks show). */
export function needsMilestone(item: {
  readonly milestones?: readonly MilestoneRef[] | null;
}): boolean {
  return unmetOf(item.milestones).length > 0;
}
