import type {
  CommitBuild,
  ReleaseAutomation,
  ReleasePipelineGate,
  ReleaseRequest,
} from './release-request.consumes';
import {
  awaitingApproval,
  formatRelativeTime,
  hasReleased,
  NONE,
  shortShaOrNone,
} from './release-request-model';

/**
 * A release request's pipeline as its page draws it (ported from qits-projects-frontend's
 * `release-pipeline-panel` and `release-gates-panel`): the phases QA → Publish → Deployment, the
 * gates between them, and the sentence for each. Pure: the panels draw what these answer.
 */

/** How a gate stands. */
export type GateTone = 'waiting' | 'passed' | 'failed' | 'unknown';

/** How a phase stands. */
export type PhaseTone = 'pending' | 'running' | 'success' | 'failed' | 'unsettled';

/** One gate, as drawn under the phase it follows. */
export interface DrawnGate {
  readonly key: string;
  /** The gate's name, with ✓ or ✗ once it has answered. */
  readonly name: string;
  readonly tone: GateTone;
  /** What the gate says, starting with "— ". */
  readonly sentence: string;
  /** The service's own detail, if any. */
  readonly detail: string | null;
  /** The approval gate that a person may answer now: Approve and Decline go here. */
  readonly asks: boolean;
  /** The automations gate with rows: the automations go here. */
  readonly automations: boolean;
}

/** One phase, with the gates drawn under it. */
export interface DrawnPhase {
  readonly phase: string;
  /** `P1 · QA`. */
  readonly label: string;
  /** The tree glyph before it: `├`, or `└` for the last. */
  readonly glyph: string;
  /** The tree glyph before its gates: `│`, or a blank under the last. */
  readonly trunk: string;
  /** The state as a mark: `✓ SUCCESS`, `● RUNNING`, `○ pending`… */
  readonly mark: string;
  readonly tone: PhaseTone;
  /** A sentence for CANCELLED and UNKNOWN, else null. */
  readonly sentence: string | null;
  /** The phase may be run again. */
  readonly rerunnable: boolean;
  readonly rerunLabel: string;
  readonly gates: readonly DrawnGate[];
}

const PHASE_ORDER: readonly { phase: string; name: string; rerunLabel: string }[] = [
  { phase: 'QA', name: 'QA', rerunLabel: 'Run the QA phase again' },
  { phase: 'PUBLISH', name: 'Publish', rerunLabel: 'Run the publish phase again' },
  { phase: 'DEPLOY', name: 'Deployment', rerunLabel: 'Run the deployment phase again' },
];

const GATE_NAMES: Readonly<Record<string, string>> = {
  CI: 'CI',
  APPROVAL: 'Approval',
  PUBLISH: 'Publish',
  DEPLOYMENT: 'Deployment',
  AUTOMATIONS: 'Automations',
};

const AUTOMATION_UNDERWAY_STATES: ReadonlySet<string> = new Set([
  'PENDING',
  'REQUESTED',
  'RUNNING',
]);

/** "a", "a and b", "a, b and c". */
export function listed(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** A gate's state as a tone. */
export function gateToneOf(state: string | undefined): GateTone {
  switch (state) {
    case 'PASSED':
      return 'passed';
    case 'FAILED':
      return 'failed';
    case 'PENDING':
      return 'waiting';
    default:
      return 'unknown';
  }
}

/** A phase's state as a mark. */
export function phaseMark(state: string | undefined): string {
  switch (state) {
    case 'SUCCESS':
      return '✓ SUCCESS';
    case 'RUNNING':
      return '● RUNNING';
    case 'FAILED':
      return '✗ FAILED';
    case 'CANCELLED':
      return '✗ CANCELLED';
    case 'UNKNOWN':
      return '○ UNKNOWN';
    default:
      return '○ pending';
  }
}

/** A phase's state as a tone. */
export function phaseTone(state: string | undefined): PhaseTone {
  switch (state) {
    case 'SUCCESS':
      return 'success';
    case 'RUNNING':
      return 'running';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
    case 'UNKNOWN':
      return 'unsettled';
    default:
      return 'pending';
  }
}

/** The sentence under a CANCELLED or UNKNOWN phase. */
export function phaseSentence(state: string | undefined): string | null {
  if (state === 'CANCELLED') {
    return (
      'This phase was cancelled before it answered. Nothing refused the release, and nothing ' +
      'happens here until it is run again.'
    );
  }
  if (state === 'UNKNOWN') {
    return (
      'What this phase came to could not be read, so nothing about it is known. The request is ' +
      'held — nothing has refused it — and running the phase again is what settles it.'
    );
  }
  return null;
}

/** A phase may be run again unless it succeeded, or it is pending and never ran. */
export function phaseRerunnable(state: string | undefined, runId: string | undefined): boolean {
  if (state === 'SUCCESS') return false;
  return (state ?? 'PENDING') !== 'PENDING' || !!runId;
}

/** Who decided the approval, and when: `approved by x, 3h ago` or `declined by x`. */
export function approvalDecision(request: ReleaseRequest, now = Date.now()): string {
  const who = request.approvedBy || NONE;
  return request.approvalState === 'DECLINED'
    ? `declined by ${who}`
    : `approved by ${who}, ${formatRelativeTime(request.approvedAt, now)}`;
}

function automationsSentence(rows: readonly ReleaseAutomation[], tone: GateTone): string | null {
  if (tone === 'failed') {
    const failed = rows.filter((row) => row.state === 'FAILED').map((row) => row.label ?? '');
    return failed.length > 0
      ? `— ${listed(failed)} failed. The run says why; Re-run asks again once it is fixed.`
      : null;
  }
  if (tone === 'waiting') {
    const underway = rows
      .filter((row) => AUTOMATION_UNDERWAY_STATES.has(row.state ?? ''))
      .map((row) => row.label ?? '');
    if (underway.length === 0) return null;
    return (
      `— ${listed(underway)} ${underway.length === 1 ? 'is' : 'are'} still running; ` +
      'nothing has refused the release'
    );
  }
  return null;
}

/** What a pipeline gate says. */
export function gateSentence(
  request: ReleaseRequest,
  gate: ReleasePipelineGate,
  tone: GateTone,
  now = Date.now(),
): string {
  if (gate.kind === 'APPROVAL' && (tone === 'passed' || tone === 'failed')) {
    return `— ${approvalDecision(request, now)}`;
  }
  if (tone === 'unknown') {
    return gate.state === 'UNKNOWN' || !gate.state
      ? '— what this gate says could not be read. The request is held, and nothing has refused it.'
      : `— ${gate.state.toLowerCase().replace(/_/g, ' ')}`;
  }
  const waiting = tone === 'waiting';
  const released = hasReleased(request);
  switch (gate.kind) {
    case 'CI':
      return waiting
        ? '— waiting on a build of this fold'
        : tone === 'passed'
          ? '— every build of this fold is green'
          : '— a build of this fold went red. That is content: a push onto a ' +
            'participating branch re-folds the request and asks again.';
    case 'APPROVAL':
      return '— waiting for a person';
    case 'AUTOMATIONS': {
      const sentence = automationsSentence(request.automations ?? [], tone);
      if (sentence) return sentence;
      break;
    }
    case 'PUBLISH':
      return waiting
        ? released
          ? '— released, waiting on the release pipeline of this tag'
          : '— answered after the tag, never before it'
        : tone === 'passed'
          ? '— the release pipeline of this tag is green'
          : '— the release pipeline of this tag failed. That is the environment rather than a ' +
            'refusal, and this request stays open until it goes green.';
    case 'DEPLOYMENT':
      return waiting
        ? released
          ? '— released, waiting on its deployment to go live'
          : '— answered after the tag, never before it'
        : tone === 'passed'
          ? '— live, and main carries this release'
          : '— the deployment of this release did not go live, and this request stays open ' +
            'until it does.';
  }
  return waiting
    ? '— waiting on this gate; nothing has refused the release'
    : tone === 'passed'
      ? '— answered, and it passed'
      : '— this gate refused the release';
}

function drawGate(request: ReleaseRequest, gate: ReleasePipelineGate, now: number): DrawnGate {
  const tone = gateToneOf(gate.state);
  const name = GATE_NAMES[gate.kind ?? ''] ?? (gate.kind || 'gate').replace(/_/g, ' ');
  const marked = tone === 'passed' ? `✓ ${name}` : tone === 'failed' ? `✗ ${name}` : name;
  const qaPublish = gate.between === 'QA_PUBLISH';
  return {
    key: `${gate.between}:${gate.kind}`,
    name: marked,
    tone,
    sentence: gateSentence(request, gate, tone, now),
    detail: gate.detail?.trim() || null,
    asks: gate.kind === 'APPROVAL' && qaPublish && awaitingApproval(request),
    automations: gate.kind === 'AUTOMATIONS' && qaPublish && (request.automations?.length ?? 0) > 0,
  };
}

/**
 * The phases to draw, in order. DEPLOY is drawn only when the pipeline reports it or names a
 * DEPLOYMENT gate; the edge after the last phase (DEPLOY_FINALIZED) hangs under the last one.
 */
export function drawPipeline(request: ReleaseRequest, now = Date.now()): readonly DrawnPhase[] {
  const pipeline = request.pipeline;
  const reported = new Map((pipeline?.phases ?? []).map((phase) => [phase.phase, phase]));
  const gates = pipeline?.gates ?? [];
  const deploys = reported.has('DEPLOY') || gates.some((gate) => gate.kind === 'DEPLOYMENT');
  const expected = PHASE_ORDER.filter((entry) => entry.phase !== 'DEPLOY' || deploys);
  return expected.map((entry, index) => {
    const last = index === expected.length - 1;
    const phase = reported.get(entry.phase);
    const state = phase?.state ?? 'PENDING';
    const edges = new Set<string>();
    if (entry.phase === 'QA') edges.add('QA_PUBLISH');
    if (entry.phase === 'PUBLISH') edges.add('PUBLISH_DEPLOY');
    if (entry.phase === 'DEPLOY' || last) edges.add('DEPLOY_FINALIZED');
    return {
      phase: entry.phase,
      label: `P${index + 1} · ${entry.name}`,
      glyph: last ? '└' : '├',
      trunk: last ? ' ' : '│',
      mark: phaseMark(state),
      tone: phaseTone(state),
      sentence: phaseSentence(state),
      rerunnable: phaseRerunnable(state, phase?.runId),
      rerunLabel: entry.rerunLabel,
      gates: gates
        .filter((gate) => edges.has(gate.between ?? ''))
        .map((gate) => drawGate(request, gate, now)),
    };
  });
}

/** The line after the last phase: FINALIZED, with ✓ once the tag is on main. */
export function terminalLine(
  request: ReleaseRequest,
  now = Date.now(),
): { readonly name: string; readonly sentence: string } {
  const at = request.mergedToMainAt;
  if (at) {
    return {
      name: '✓ FINALIZED',
      sentence: `— the tag is on main and this release is finished, ${formatRelativeTime(at, now)}`,
    };
  }
  return {
    name: 'FINALIZED',
    sentence: hasReleased(request)
      ? '— released, waiting for the tag to reach main'
      : '— the tag reaches main once everything this release promised has happened',
  };
}

/**
 * Why a decision about a fold (approve, decline, waive) was refused. A 409 whose message names
 * another fold than the one sent means the fold moved under the reader; say so. Any other 409 is
 * the service's own sentence (or `refused`); anything else is a failure (null here).
 */
export function movedFold(
  status: number,
  message: string | undefined,
  sent: string,
  nothing: string,
  refused: string,
): string | null {
  if (status !== 409) return null;
  const now = [...(message?.matchAll(/\b[0-9a-f]{7,64}\b/g) ?? [])]
    .map((match) => match[0])
    .find((sha) => sha !== sent);
  return now
    ? `The fold changed while this was being read — this request is on ${shortShaOrNone(now)} ` +
        `now, not ${shortShaOrNone(sent)}. ${nothing}; look at the new fold.`
    : (message ?? refused);
}

/** A CI verdict's word: `success`, `failed`, `unknown`. */
export function verdictWord(build: CommitBuild): string {
  return (build.status || 'unknown').toLowerCase().replace(/_/g, ' ');
}

/** Automation states after which the gate holds nothing back. */
const AUTOMATION_SETTLED_STATES: ReadonlySet<string> = new Set([
  'FRESH',
  'WAIVED',
  'NOT_APPLICABLE',
]);

/** The automations gate's name in the plain gates list: ✓ when settled, ✗ when one failed. */
export function automationsName(rows: readonly ReleaseAutomation[]): string {
  if (rows.length === 0 || rows.every((row) => AUTOMATION_SETTLED_STATES.has(row.state ?? ''))) {
    return '✓ Automations';
  }
  return rows.some((row) => row.state === 'FAILED') ? '✗ Automations' : 'Automations';
}

/** Automation states a person may run again. */
const AUTOMATION_RERUNNABLE_STATES: ReadonlySet<string> = new Set(['FAILED', 'UNKNOWN', 'FRESH']);

/** The automation may be run again. */
export function automationRerunnable(row: ReleaseAutomation): boolean {
  return AUTOMATION_RERUNNABLE_STATES.has(row.state ?? '');
}

/** An automation's state and detail as one sentence. */
export function automationSentence(row: ReleaseAutomation): string {
  const word = (row.state || 'unknown').toLowerCase().replace(/_/g, ' ');
  const detail = row.detail?.trim() || null;
  if (!detail) return word;
  switch (row.state) {
    case 'FRESH':
      return `${word} (${detail})`;
    case 'COMMITTED':
      return `${word}; ${detail}`;
    case 'FAILED':
      return `${word}: ${detail}`;
    default:
      return `${word} — ${detail}`;
  }
}

/** Where a failed automation stopped: `step 2 · node-base · exit 1`. */
export function failureLine(failure: NonNullable<ReleaseAutomation['failure']>): string {
  const image = (failure.image ?? '').trim();
  const parts = [`step ${failure.stepIndex}`, image.split('/').pop() || image];
  if (failure.exitCode !== null && failure.exitCode !== undefined) {
    parts.push(`exit ${failure.exitCode}`);
  }
  return parts.join(' · ');
}
