import { computed, Injectable, signal } from '@angular/core';

/** A range of lines picked in the Files tab: a reference the prompt can carry. */
export interface CodeReference {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  /** What those lines said when they were picked: the snapshot the prompt carries. */
  readonly excerpt: string;
}

/** A composition: the prompt's text and what was picked for it (the draft's `content`). */
export interface DraftComposition {
  readonly text: string;
  readonly picked: readonly CodeReference[];
}

/** The `path:start-end` label a reference is known by, on its chip and in the text it inserts. */
export function referenceLabel(reference: CodeReference): string {
  return reference.startLine === reference.endLine
    ? `${reference.path}:${reference.startLine}`
    : `${reference.path}:${reference.startLine}-${reference.endLine}`;
}

/** What pressing a reference puts in the prompt: the label, then the lines, fenced. */
export function referenceText(reference: CodeReference): string {
  return `${referenceLabel(reference)}\n\`\`\`\n${reference.excerpt}\n\`\`\``;
}

/**
 * The prompt the agent is handed. A picked reference pressed into the box is already in `text`;
 * the ones never pressed are appended under a heading, so a chip never lies about what the agent
 * sees.
 */
export function serializePrompt(composition: DraftComposition): string {
  const parts: string[] = [];
  if (composition.text.trim()) parts.push(composition.text.trim());
  const extras = composition.picked
    .filter((reference) => !composition.text.includes(referenceLabel(reference)))
    .map(referenceText);
  if (extras.length > 0) parts.push(`Context picked in the worktree:\n\n${extras.join('\n\n')}`);
  return parts.join('\n\n');
}

/** Whether a value read from a draft is a reference this build can use. */
function isReference(value: unknown): value is CodeReference {
  const ref = value as Partial<CodeReference> | null;
  return (
    typeof ref === 'object' &&
    ref !== null &&
    typeof ref.path === 'string' &&
    typeof ref.startLine === 'number' &&
    typeof ref.endLine === 'number' &&
    typeof ref.excerpt === 'string'
  );
}

/**
 * The references a draft's `content` carries: its `picked`, or, from a draft
 * qits-workspaces-frontend wrote, its `references`. Anything unreadable is nothing picked.
 */
export function draftReferences(value: unknown): readonly CodeReference[] {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const list = Array.isArray(record['picked'])
    ? record['picked']
    : Array.isArray(record['references'])
      ? record['references']
      : [];
  return list.filter(isReference);
}

/**
 * The line ranges picked in the agent's Files tab, which its Chat tab's prompt is composed from
 * (epic qits-1230), as qits-workspaces-frontend's `PickedContext`. Application-wide, so a pick
 * survives the move from the Files tab to the Chat tab; keyed by agent: `use` empties it when the
 * agent changes, since a range in one agent's worktree means nothing in another's. The prompt
 * composer saves the picks with the draft (`picked`) and restores them from it.
 */
@Injectable({ providedIn: 'root' })
export class PickedContext {
  private readonly agentId = signal('');
  private readonly refs = signal<readonly CodeReference[]>([]);

  /** The picks, in the order they were made. */
  readonly references = this.refs.asReadonly();

  /** Whether anything has been picked. */
  readonly any = computed(() => this.refs().length > 0);

  /** Point at an agent. Another agent empties the picks; the same one is a no-op. */
  use(agentId: string): void {
    if (this.agentId() === agentId) return;
    this.agentId.set(agentId);
    this.refs.set([]);
  }

  /** Pick a range. The same range twice is kept once. */
  add(reference: CodeReference): void {
    this.refs.update((current) =>
      current.some((entry) => referenceLabel(entry) === referenceLabel(reference))
        ? current
        : [...current, reference],
    );
  }

  /** Drop the pick with this label. */
  remove(label: string): void {
    this.refs.update((current) => current.filter((entry) => referenceLabel(entry) !== label));
  }

  clear(): void {
    this.refs.set([]);
  }

  /**
   * Adopt what a restored draft carried, keeping what was picked here since that the draft does
   * not hold. Whether anything was kept: then the draft is behind and wants saving.
   */
  restore(saved: readonly CodeReference[]): boolean {
    const known = new Set(saved.map(referenceLabel));
    const local = this.refs().filter((entry) => !known.has(referenceLabel(entry)));
    this.refs.set([...saved, ...local]);
    return local.length > 0;
  }

  /** Take another device's draft as it is. */
  replace(saved: readonly CodeReference[]): void {
    this.refs.set(saved);
  }
}
