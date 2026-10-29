/**
 * What a project's agents need a person for, and what each of their waits waits on (epic qits-1681).
 * Pure: the caller hands in what the functions would otherwise inject — the project's slug, qits-ci's
 * page origin (`PlatformOrigins.page('ci')`), the project's release requests
 * (`ProjectsStore.releaseRequests()[projectId]`) and the open project's work (`SelectedWork`).
 *
 * The shapes are structural, so any cut of qits-workspaces' `AgentDto` and `WaitView`, and of
 * qits-projects' release requests and work entries, that holds these fields will do.
 */

/** What `attention.code` can be: the one thing an ACTIVE agent needs a person for. */
export type AttentionCode =
  'WAIT_SUBJECT_PASSED' | 'BLOCKED_NO_DESK' | 'IDLE_NO_WAIT' | 'WAIT_OVERDUE';

/** What a wait waits on. A `BRANCH` wait (qits-1721) reads as its label, as `OTHER` does. */
export type SubjectKind =
  'RELEASE_REQUEST' | 'CI_RUN' | 'WORK_ITEM' | 'COMMENTS' | 'BRANCH' | 'OTHER';

/** An agent's open wait, as the listing gives it. */
export interface WaitLike {
  readonly id?: string;
  readonly label?: string;
  readonly subjectKind?: SubjectKind;
  readonly subjectRef?: string;
  readonly subjectId?: string;
  readonly subjectQualifiedId?: string;
  readonly subjectState?: string;
}

/** What an agent needs a person for, as the listing gives it. */
export interface AttentionLike {
  readonly code?: AttentionCode;
  readonly reason?: string;
  readonly since?: string;
  readonly waitId?: string;
}

/** An agent, cut to what these functions read. */
export interface AttentionAgent {
  /** The agent's work item, by its qualified id (`<slug>-<n>`). */
  readonly entityId?: string;
  readonly waits?: readonly WaitLike[];
  readonly attention?: AttentionLike;
}

/** A release request's gate, as qits-projects lists it. */
export interface GateLike {
  readonly kind?: string;
  readonly state?: string;
}

/** A release request of the project, cut to what a wait's line reads. */
export interface ReleaseRequestLike {
  readonly id?: string;
  readonly qualifiedId?: string;
  readonly state?: string;
  readonly gates?: readonly GateLike[];
}

/** A work entity of the open project, cut to what a wait's line reads. */
export interface WorkLike {
  readonly id?: string;
  readonly qualifiedId?: string;
  readonly title?: string;
  readonly status?: string;
}

/** What `waitSubject` and `attentionAction` need beside the wait: the open project's context. */
export interface WaitContext {
  /** The open project's slug, for the app's own links. */
  readonly slug: string;
  /** qits-ci's page origin (`PlatformOrigins.page('ci')`); a run has no link without one. */
  readonly ciOrigin?: string;
  /** The project's release requests, matched by `subjectId` or `subjectQualifiedId`. */
  readonly releaseRequests?: readonly ReleaseRequestLike[];
  /** The open project's work, matched by `subjectId` or `subjectQualifiedId`. */
  readonly work?: readonly WorkLike[];
}

/** One wait's line: what it waits on, that subject's state, a request's gates, and where it is. */
export interface WaitSubject {
  readonly kind: SubjectKind;
  /** The subject in a few words: a request's or an item's qualified id, a run, or the wait's label. */
  readonly text: string;
  /** The subject's state: the store's when it holds the subject, else the listing's last known one. */
  readonly state?: string;
  /** A release request's gates, from the project's request; absent for any other subject. */
  readonly gates?: readonly GateLike[];
  /**
   * Where the subject is: an app path (`/projects/…`) or, for a run, an absolute URL into qits-ci.
   * Null when there is none to build (OTHER, a run without qits-ci's origin, an unresolved subject).
   */
  readonly link: string | null;
}

/**
 * The one thing to do about an agent's attention:
 * - `prompt`: Prompt agent (its Chat tab), with the passed wait's subject beside it, when there is one;
 * - `open-item`: Open item (`link`, the agent's work item page);
 * - `subject`: go to the overdue wait's subject.
 */
export type AttentionAction =
  | { readonly kind: 'prompt'; readonly label: string; readonly subject?: WaitSubject }
  | { readonly kind: 'open-item'; readonly label: string; readonly link: string | null }
  | { readonly kind: 'subject'; readonly label: string; readonly subject: WaitSubject };

/** Whether the agent needs a person: it carries an attention. */
export function needsAttention(agent: { readonly attention?: AttentionLike | null }): boolean {
  return agent.attention != null;
}

/** How many of `agents` need a person. */
export function attentionCount(
  agents: readonly { readonly attention?: AttentionLike | null }[],
): number {
  return agents.filter(needsAttention).length;
}

/** The app's page for a work item of the project. */
export function workItemPath(slug: string, qualifiedId: string): string {
  return `/projects/${encodeURIComponent(slug)}/work/detail/${encodeURIComponent(qualifiedId)}`;
}

/**
 * The app's page for an agent of the project (epic qits-1681), or one of its tabs (`chat`, `files`,
 * `terminal`).
 */
export function agentPath(slug: string, agentId: string, tab?: string): string {
  const page = `/projects/${encodeURIComponent(slug)}/agents/${encodeURIComponent(agentId)}`;
  return tab ? `${page}/${tab}` : page;
}

/** The app's page for a release request of the project. */
export function releaseRequestPath(slug: string, qualifiedId: string): string {
  return `/projects/${encodeURIComponent(slug)}/release-requests/${encodeURIComponent(qualifiedId)}`;
}

/** qits-ci's page for a run, as the lightning menu's active-run chips link it. */
export function ciRunUrl(ciOrigin: string | undefined, runId: string): string | null {
  return ciOrigin ? `${ciOrigin}/runs/${encodeURIComponent(runId)}` : null;
}

/** Whether `entry` is the subject the wait names: by its uuid, or by its qualified id. */
function names(wait: WaitLike, entry: { readonly id?: string; readonly qualifiedId?: string }) {
  const ids = [wait.subjectId, wait.subjectRef].filter((id): id is string => !!id);
  const qualified = [wait.subjectQualifiedId, wait.subjectRef].filter((id): id is string => !!id);
  return (
    (!!entry.id && ids.includes(entry.id)) ||
    (!!entry.qualifiedId && qualified.includes(entry.qualifiedId))
  );
}

/** What the wait `wait` waits on, as one line (see {@link WaitSubject}). */
export function waitSubject(wait: WaitLike, ctx: WaitContext): WaitSubject {
  const label = wait.label ?? '';
  switch (wait.subjectKind) {
    case 'RELEASE_REQUEST': {
      const request = ctx.releaseRequests?.find((r) => names(wait, r));
      const qualifiedId = request?.qualifiedId ?? wait.subjectQualifiedId;
      return {
        kind: 'RELEASE_REQUEST',
        text: qualifiedId ?? (label || (wait.subjectRef ?? '')),
        state: request?.state ?? wait.subjectState,
        gates: request?.gates ?? [],
        link: qualifiedId ? releaseRequestPath(ctx.slug, qualifiedId) : null,
      };
    }
    case 'CI_RUN': {
      const runId = wait.subjectId ?? wait.subjectRef;
      return {
        kind: 'CI_RUN',
        text: runId ? `CI run ${runId.slice(0, 8)}` : label,
        state: wait.subjectState,
        link: runId ? ciRunUrl(ctx.ciOrigin, runId) : null,
      };
    }
    case 'WORK_ITEM':
    case 'COMMENTS': {
      const item = ctx.work?.find((w) => names(wait, w));
      const qualifiedId = wait.subjectQualifiedId ?? item?.qualifiedId;
      const itemText = qualifiedId ?? (label || (wait.subjectRef ?? ''));
      return wait.subjectKind === 'WORK_ITEM'
        ? {
            kind: 'WORK_ITEM',
            text: itemText,
            state: item?.status ?? wait.subjectState,
            link: qualifiedId ? workItemPath(ctx.slug, qualifiedId) : null,
          }
        : {
            kind: 'COMMENTS',
            text: qualifiedId ? `Comments on ${qualifiedId}` : label,
            state: wait.subjectState,
            link: qualifiedId ? workItemPath(ctx.slug, qualifiedId) : null,
          };
    }
    default:
      return { kind: 'OTHER', text: label, state: wait.subjectState, link: null };
  }
}

/** The wait the agent's attention is about, if it names one the agent still has. */
function attentionWait(agent: AttentionAgent): WaitLike | undefined {
  const waitId = agent.attention?.waitId;
  return waitId ? agent.waits?.find((wait) => wait.id === waitId) : undefined;
}

/**
 * The one thing to do about what `agent` needs a person for (see {@link AttentionAction}); undefined
 * when it needs nothing. An unknown code, or a wait the agent no longer lists, falls back to
 * Prompt agent.
 */
export function attentionAction(
  agent: AttentionAgent,
  ctx: WaitContext,
): AttentionAction | undefined {
  const attention = agent.attention;
  if (attention == null) return undefined;
  const wait = attentionWait(agent);
  const subject = wait ? waitSubject(wait, ctx) : undefined;
  switch (attention.code) {
    case 'BLOCKED_NO_DESK':
      return {
        kind: 'open-item',
        label: 'Open item',
        link: agent.entityId ? workItemPath(ctx.slug, agent.entityId) : null,
      };
    case 'WAIT_OVERDUE':
      if (subject) return { kind: 'subject', label: subject.text, subject };
      return { kind: 'prompt', label: 'Prompt agent' };
    case 'WAIT_SUBJECT_PASSED':
      return subject
        ? { kind: 'prompt', label: 'Prompt agent', subject }
        : { kind: 'prompt', label: 'Prompt agent' };
    default:
      return { kind: 'prompt', label: 'Prompt agent' };
  }
}
