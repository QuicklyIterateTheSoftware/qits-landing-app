import type { ReleaseRequest } from './release-request.consumes';
import { approvalDecision, gateSentence, gateToneOf } from './release-pipeline';
import { hasReleased, releaseConflict, shortShaOrNone } from './release-request-model';

/**
 * A release request's whole lifecycle, top to bottom, as its page draws it: the fold and its
 * automations, the QA run, the quality gates, publish, deployment, the deployment's gates, and
 * the tag reaching main. Every check is a row of its own, read from the answer as it comes:
 * automations and gates are drawn generically (their own label, state, detail, sub-checks and run),
 * so one the backend adds appears without a change here. Pure; `app-release-lifecycle` draws it.
 */

/** How a stage or a check stands. */
export type StepState =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'cancelled'
  | 'skipped'
  | 'unknown'
  | 'not-reported';

/** A named sub-check of a gate. */
export interface SubCheck {
  readonly name: string;
  readonly state: StepState;
  readonly word: string;
  readonly detail: string | null;
}

/** One check: a row in a stage. */
export interface Step {
  readonly key: string;
  readonly label: string;
  readonly state: StepState;
  /** The backend's own word for the state, for the chip. */
  readonly word: string;
  readonly detail: string | null;
  readonly checks: readonly SubCheck[];
  /** A CI run to link, if the answer names one. */
  readonly runId: string | null;
  /** What the row is, for the actions the page offers on it. */
  readonly kind: 'fold' | 'automations' | 'phase' | 'gate' | 'approval' | 'release' | 'finalized';
  /** The phase a `phase` row is (QA, PUBLISH, DEPLOY), to run it again. */
  readonly phase?: string;
  /** The phase may be run again. */
  readonly rerunnable?: boolean;
  /** The approval row asks a person now: Approve and Decline go here. */
  readonly asks?: boolean;
  /** It blocks the request and needs a person: an approval to give, a failure to act on. */
  readonly attention?: boolean;
  /** A deployment request to link (the deployment phase's id). */
  readonly deploymentRequestId?: string | null;
}

/** One stage of the lifecycle. */
export interface Stage {
  readonly key: 'fold' | 'qa' | 'gates' | 'publish' | 'deploy' | 'deploy-gates' | 'finalized';
  readonly label: string;
  readonly state: StepState;
  /** The first stage that has not passed: where the request is now. */
  readonly current: boolean;
  /** After the current stage: not reached yet. */
  readonly future: boolean;
  readonly steps: readonly Step[];
  /** A sentence under the stage's name, if it has one. */
  readonly note: string | null;
}

/** A gate in the shape the backend is adding (`external/release-gate-classes`). */
interface GenericGate {
  readonly kind?: string;
  readonly label?: string;
  readonly position?: string;
  readonly state?: string;
  readonly detail?: string;
  readonly checks?: readonly { name?: string; state?: string; detail?: string }[];
  readonly runId?: string;
  readonly between?: string;
}

/** Fallback labels for today's gate kinds, while the answer names no label. */
const GATE_LABELS: Readonly<Record<string, string>> = {
  CI: 'Tests passed',
  AUTOMATIONS: 'Automations passed or waived',
  APPROVAL: 'Approval',
  PUBLISH: 'Release pipeline of the tag green',
  DEPLOYMENT: 'Deployment live',
};

/** A backend word as a step state. */
export function stepStateOf(word: string | undefined): StepState {
  switch (word) {
    case 'SUCCESS':
    case 'PASSED':
    case 'FRESH':
    case 'COMMITTED':
    case 'APPROVED':
      return 'passed';
    case 'RUNNING':
    case 'REQUESTED':
      return 'running';
    case 'FAILED':
    case 'FAILURE':
    case 'DECLINED':
    case 'REJECTED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    case 'SUPERSEDED':
      return 'pending';
    case 'NOT_REQUIRED':
    case 'NOT_APPLICABLE':
    case 'WAIVED':
    case 'SKIPPED':
      return 'skipped';
    case 'PENDING':
    case 'WAITING':
    case undefined:
    case '':
      return 'pending';
    default:
      return 'unknown';
  }
}

/** A word for reading: `NOT_REQUIRED` → `not required`. */
const wordOf = (word: string | undefined, fallback = 'pending') =>
  (word || fallback).toLowerCase().replace(/_/g, ' ');

/** A stage's state from its steps: failed beats running beats pending; all passed or skipped: passed. */
export function stageState(steps: readonly Step[]): StepState {
  const states = steps.map((step) => step.state);
  if (states.length === 0) return 'pending';
  for (const state of ['failed', 'cancelled', 'unknown', 'running'] as const) {
    if (states.includes(state)) return state;
  }
  if (states.every((state) => state === 'skipped')) return 'skipped';
  if (states.every((state) => state === 'passed' || state === 'skipped')) return 'passed';
  if (states.some((state) => state === 'passed') && states.includes('pending')) return 'running';
  if (states.every((state) => state === 'not-reported')) return 'not-reported';
  return 'pending';
}

/** Where a gate sits: before publish (after QA), or after deployment (before finalized). */
function gateStage(gate: GenericGate): 'gates' | 'publish' | 'deploy-gates' {
  const where = whereOf(gate);
  const kind = kindOf(gate);
  if (kind === 'PUBLISH' || where === 'PUBLISH_DEPLOY') return 'publish';
  if (where.includes('FINALIZED') || where.startsWith('AFTER_DEPLOY')) return 'deploy-gates';
  if (kind === 'DEPLOYMENT' && !where) return 'deploy-gates';
  return 'gates';
}

/** A gate's position in one spelling: `qa-publish` (quality gates) and `QA_PUBLISH` alike. */
const whereOf = (gate: GenericGate) =>
  (gate.position ?? gate.between ?? '').toUpperCase().replace(/-/g, '_');

/** A gate's kind in one spelling: `ci` (quality gates) and `CI` alike. */
const kindOf = (gate: GenericGate) => (gate.kind ?? '').toUpperCase().replace(/-/g, '_');

/**
 * The gates of the request's current fold: its `qualityGates`, each with a label, a position and
 * its checks. An answer without them: the request's own `gates` (the service evaluates them for
 * `mergedSha`), placed by the pipeline's gates (`between`). A pipeline gate the request's list does
 * not name keeps its own state.
 */
export function currentGates(request: ReleaseRequest): readonly GenericGate[] {
  const quality: readonly GenericGate[] = request.qualityGates ?? [];
  if (quality.length > 0) return quality;
  const own: readonly GenericGate[] = request.gates ?? [];
  const pipeline: readonly GenericGate[] = request.pipeline?.gates ?? [];
  if (pipeline.length === 0) return own;
  const byKind = new Map(own.map((gate) => [gate.kind, gate]));
  return pipeline.map((gate) => {
    const fresh = byKind.get(gate.kind);
    return fresh ? { ...gate, state: fresh.state, detail: fresh.detail ?? gate.detail } : gate;
  });
}

/** Whether the answer's gates carry the generic shape (a label and a position on each). */
export function hasGenericGates(gates: readonly GenericGate[]): boolean {
  return gates.length > 0 && gates.every((gate) => !!gate.label && !!gate.position);
}

/** A gate as a row. */
function gateStep(request: ReleaseRequest, gate: GenericGate, generic: boolean): Step {
  const state = stepStateOf(gate.state);
  const fallback =
    gate.detail?.trim() ||
    (generic ? null : gateSentence(request, gate, gateToneOf(gate.state)).replace(/^— /, ''));
  return {
    key: `gate:${whereOf(gate)}:${kindOf(gate)}`,
    label: gate.label || GATE_LABELS[kindOf(gate)] || wordOf(gate.kind, 'gate'),
    state,
    word: wordOf(gate.state),
    detail: fallback || null,
    checks: (gate.checks ?? []).map((check) => ({
      name: check.name ?? '',
      state: stepStateOf(check.state),
      word: wordOf(check.state),
      detail: check.detail?.trim() || null,
    })),
    runId: gate.runId ?? null,
    kind: kindOf(gate) === 'APPROVAL' ? 'approval' : 'gate',
    attention: state === 'failed',
  };
}

/** The approval as a row, from the request's approval fields (the gate may not be reported). */
function approvalStep(request: ReleaseRequest, gate: Step | undefined): Step {
  const word = request.approvalState;
  const required = request.approvalRequired === true;
  const decided = word === 'APPROVED' || word === 'DECLINED';
  const note = request.approvalNote?.trim();
  const detail = !required
    ? 'This repository needs no person to approve its releases.'
    : decided
      ? `${approvalDecision(request).replace(/^./, (c) => c.toUpperCase())}${note ? ` — “${note}”` : ''}`
      : (gate?.detail ?? 'Waiting for a person.');
  return {
    key: gate?.key ?? 'approval',
    label: gate?.label ?? 'Approval',
    state: required ? (gate?.state ?? stepStateOf(word)) : 'skipped',
    word: required ? wordOf(word ?? gate?.word) : 'not required',
    detail,
    checks: gate?.checks ?? [],
    runId: gate?.runId ?? null,
    kind: 'approval',
    asks: required && request.state === 'PENDING' && !decided,
    attention: required && request.state === 'PENDING' && !decided,
  };
}

/** A pipeline phase as a row. */
/** Without a pipeline (an older answer), a phase's state follows its gate. */
const PHASE_GATES: Readonly<Record<string, string>> = { QA: 'CI', PUBLISH: 'PUBLISH' };

function phaseStep(request: ReleaseRequest, phase: string, label: string): Step {
  const reported = request.pipeline?.phases?.find((entry) => entry.phase === phase);
  if (!request.pipeline && PHASE_GATES[phase]) {
    const gate = request.gates?.find((entry) => entry.kind === PHASE_GATES[phase]);
    if (gate) {
      const state = gate.state === 'PENDING' ? 'running' : stepStateOf(gate.state);
      return {
        key: `phase:${phase}`,
        label,
        state,
        word: wordOf(gate.state),
        detail: null,
        checks: [],
        runId: null,
        kind: 'phase',
        phase,
      };
    }
  }
  const word = reported?.state;
  const state = reported ? stepStateOf(word) : 'pending';
  return {
    key: `phase:${phase}`,
    label,
    state,
    word: wordOf(word),
    detail: reported?.detail?.trim() || null,
    checks: [],
    runId: phase === 'DEPLOY' ? null : (reported?.runId ?? null),
    deploymentRequestId: phase === 'DEPLOY' ? (reported?.runId ?? null) : null,
    kind: 'phase',
    phase,
    rerunnable: !!reported && word !== 'SUCCESS' && (word !== 'PENDING' || !!reported.runId),
  };
}

/** Whether the request deploys: the pipeline reports a deployment phase or gate. */
function deploys(request: ReleaseRequest): boolean {
  const pipeline = request.pipeline;
  return (
    !!pipeline?.phases?.some((phase) => phase.phase === 'DEPLOY') ||
    !!pipeline?.gates?.some((gate) => gate.kind === 'DEPLOYMENT') ||
    !!request.gates?.some((gate) => gate.kind === 'DEPLOYMENT')
  );
}

/** Not reported: a check the user wants that the answer does not carry. */
const notReported = (key: string, label: string): Step => ({
  key,
  label,
  state: 'not-reported',
  word: 'not reported',
  detail: null,
  checks: [],
  runId: null,
  kind: 'gate',
});

/**
 * The whole lifecycle of `request`. The fold starts both the QA run and the automations, which run
 * side by side (qits-projects' `ReleaseRequests`: a fold announces the request, which starts QA,
 * and asks qits-maintenance for the automations); the gates then decide in order.
 */
export function releaseLifecycle(request: ReleaseRequest): readonly Stage[] {
  const allGates = currentGates(request);
  const generic = hasGenericGates(allGates);
  const gateSteps = allGates.map((gate) => ({
    stage: gateStage(gate),
    step: gateStep(request, gate, generic),
  }));

  // P1: the fold, then the automations.
  const conflict = releaseConflict(request);
  const conflicted = !!conflict || request.state === 'CONFLICTED';
  const fold: Step = {
    key: 'fold',
    label: 'Merge the sources',
    state: conflicted
      ? 'failed'
      : request.mergedSha
        ? 'passed'
        : request.state === 'PENDING'
          ? 'running'
          : 'pending',
    word: conflicted ? 'conflicted' : request.mergedSha ? 'folded' : 'not folded',
    detail: conflict
      ? null
      : request.mergedSha
        ? `${(request.sources ?? []).length} sources merged onto ${request.backingBranch} at ${shortShaOrNone(request.mergedSha)}`
        : null,
    checks: [],
    runId: null,
    kind: 'fold',
    attention: conflicted,
  };
  const automations = request.automations ?? [];
  const automationStep: Step = {
    key: 'automations',
    label: 'Automations',
    state:
      automations.length === 0
        ? 'skipped'
        : stageState(
            automations.map((row) => ({
              ...notReported('', ''),
              state: stepStateOf(row.state),
            })),
          ),
    word: automations.length === 0 ? 'none apply' : '',
    detail: null,
    checks: [],
    runId: null,
    kind: 'automations',
    attention: automations.some((row) => stepStateOf(row.state) === 'failed'),
  };

  // P3: the quality gates before publish; the approval among them, always shown.
  const beforePublish = gateSteps.filter((entry) => entry.stage === 'gates').map((e) => e.step);
  const approvalGate = beforePublish.find((step) => step.kind === 'approval');
  const gates = [
    ...beforePublish.filter((step) => step.kind !== 'approval'),
    approvalStep(request, approvalGate),
  ];

  // P4: publish: the phase, its gate, the version.
  const publishGates = gateSteps.filter((entry) => entry.stage === 'publish').map((e) => e.step);
  const release: Step = {
    key: 'release',
    label: 'Tag the release',
    state: hasReleased(request) ? 'passed' : 'pending',
    word: request.version ? request.version : 'no tag yet',
    detail: request.releasedSha ? `at ${shortShaOrNone(request.releasedSha)}` : null,
    checks: [],
    runId: null,
    kind: 'release',
  };
  const publish = [
    release,
    phaseStep(request, 'PUBLISH', 'Release run of the tag'),
    ...publishGates,
  ];

  // P5, P6: deployment, and its gates.
  const afterDeploy = gateSteps
    .filter((entry) => entry.stage === 'deploy-gates')
    .map((e) => e.step);
  const deploying = deploys(request) || afterDeploy.length > 0;
  const deploy = deploying
    ? [phaseStep(request, 'DEPLOY', 'Deploy the release')]
    : [
        {
          ...notReported('phase:DEPLOY', 'Deploy the release'),
          state: 'skipped' as const,
          word: 'nothing deploys',
          detail: 'Nothing deploys this repository.',
        },
      ];
  // The DEPLOYMENT gate passes once the tag reaches main ("went live"); a later rollback shows
  // only on the deployment phase, so "not rolled back" is a check the answer does not report.
  const deployGates = deploying
    ? generic
      ? afterDeploy
      : [...afterDeploy, notReported('gate:not-rolled-back', 'Not rolled back')]
    : [
        {
          ...notReported('gate:deploy', 'Deployment gates'),
          state: 'skipped' as const,
          word: 'none',
        },
      ];

  const finalized: Step = {
    key: 'finalized',
    label: 'The tag reaches main',
    state: request.mergedToMainAt ? 'passed' : 'pending',
    word: request.mergedToMainAt ? 'on main' : 'not on main yet',
    detail: null,
    checks: [],
    runId: null,
    kind: 'finalized',
  };

  const stages: Omit<Stage, 'current' | 'future' | 'state'>[] = [
    {
      key: 'fold',
      label: 'P1 · Merge & automations',
      steps: [fold, automationStep],
      note:
        'The automations run alongside the test run of the same fold. One that commits adds to the ' +
        'request, which folds again and starts a new test run.',
    },
    {
      key: 'qa',
      label: 'P2 · Test',
      steps: [phaseStep(request, 'QA', 'Test run of the fold')],
      note: 'Runs alongside the automations, on every fold.',
    },
    { key: 'gates', label: 'P3 · Quality gates', steps: gates, note: null },
    { key: 'publish', label: 'P4 · Publish', steps: publish, note: null },
    { key: 'deploy', label: 'P5 · Deployment', steps: deploy, note: null },
    { key: 'deploy-gates', label: 'P6 · Deployment quality gates', steps: deployGates, note: null },
    { key: 'finalized', label: '→ Finalized', steps: [finalized], note: null },
  ];
  const states = stages.map((stage) => stageState(stage.steps));
  const settled = (state: StepState) => state === 'passed' || state === 'skipped';
  const current = states.findIndex((state) => !settled(state));
  // P1 and P2 run side by side: while either is unsettled, both are where the request is now.
  const alongside = current === 0 || current === 1 ? [0, 1] : [current];
  const last = Math.max(...alongside);
  return stages.map((stage, index) => ({
    ...stage,
    state: states[index],
    current: alongside.includes(index) && !settled(states[index]),
    future: current >= 0 && index > last,
  }));
}

/** One point of a request's lifecycle in a compact summary: a phase chip or a gate pip. */
export interface SummaryPoint {
  readonly key: string;
  /** It needs a person (see `Step.attention`). */
  readonly attention: boolean;
  /** A phase as a chip, a group of gates as a shield, the automations as a cog. */
  readonly kind: 'chip' | 'shield' | 'cog';
  /** The cog's "done/all" while automations run. */
  readonly count?: string;
  /** The chip's text, or the gate group's name. */
  readonly label: string;
  readonly state: StepState;
  /** A shield's look (`shieldOf`); for a chip, its state's. */
  readonly shield: ShieldState;
  /** The tooltip: the point's name and state; a shield's lists each gate. */
  readonly title: string;
  /** The id of the point's row on the request's page, to link straight to it. */
  readonly anchor: string;
}

/**
 * How a group of gates looks as a shield: `passed` (all passed or skipped), `failed` (one failed:
 * somebody must look), `waiting` (an approval waits for a person), `pending` (not reached, or
 * running without needing anyone).
 */
export type ShieldState = 'passed' | 'failed' | 'waiting' | 'pending';

/** How the automations look as a cog: all done, one failed, some running, none started. */
export type AutomationState = 'passed' | 'failed' | 'running' | 'pending';

/** A request's automations as one cog state (see `lifecycleSummary`). */

/** A group of gates as one shield. */
export function shieldOf(steps: readonly Step[]): ShieldState {
  if (steps.some((step) => step.state === 'failed' || step.state === 'cancelled')) return 'failed';
  if (steps.some((step) => step.kind === 'approval' && step.asks)) return 'waiting';
  if (
    steps.length > 0 &&
    steps.every((step) => step.state === 'passed' || step.state === 'skipped')
  ) {
    return 'passed';
  }
  return 'pending';
}

/**
 * The lifecycle as a compact line, in its order (the same model as the panel): automations (with
 * how many are done while some run), CI, a shield for the quality gates, publish, deployment (when
 * something deploys), a shield for the deployment gates, finalized.
 */
export function lifecycleSummary(request: ReleaseRequest): readonly SummaryPoint[] {
  const stages = releaseLifecycle(request);
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));
  const points: SummaryPoint[] = [];
  const chip = (key: string, label: string, state: StepState, word: string = state) =>
    points.push({
      key,
      kind: 'chip',
      label,
      state,
      shield: state === 'failed' ? 'failed' : state === 'passed' ? 'passed' : 'pending',
      title: `${label}: ${word}`,
      attention: state === 'failed' && key === 'automations',
      anchor:
        key === 'qa' && state === 'failed'
          ? FAILED_TESTS
          : stepAnchor(key === 'qa' ? 'phase:QA' : key),
    });
  const pips = (key: 'gates' | 'deploy-gates') => {
    const stage = byKey.get(key);
    const steps = stage?.steps ?? [];
    const shield = shieldOf(steps);
    const lines = steps.map(
      (step) =>
        `${step.label}: ${step.word || step.state}${step.detail ? ` — ${step.detail}` : ''}`,
    );
    const label = key === 'gates' ? 'Quality gates' : 'Deployment gates';
    const first = steps.find((step) => step.attention) ?? steps[0];
    const failedTests = first?.attention && first.key.endsWith(':CI');
    points.push({
      key,
      kind: 'shield',
      label,
      state: stage?.state ?? 'pending',
      shield,
      title: [label, ...lines].join('\n'),
      attention: shield === 'failed' || shield === 'waiting',
      anchor: failedTests ? FAILED_TESTS : stepAnchor(first?.key ?? key),
    });
  };
  points.push(preTestPoint(request, byKey.get('fold')!));
  const qa = byKey.get('qa')!;
  chip('qa', 'Test', qa.state, qa.steps[0]?.word);
  pips('gates');
  chip('publish', 'Publish', byKey.get('publish')!.state);
  const deploy = byKey.get('deploy')!;
  if (deploy.state !== 'skipped') {
    chip('deploy', 'Deploy', deploy.state, deploy.steps[0]?.word);
    pips('deploy-gates');
  }
  chip('finalized', 'Finalized', byKey.get('finalized')!.state);
  return points;
}

/** A check that needs a person, and where on the request's page it is. */
export interface AttentionPoint {
  readonly key: string;
  readonly label: string;
  /** What the person does there: "Approve", "Resolve", "Look". */
  readonly action: string;
  /** The id of its row on the request's page (`stepAnchor`). */
  readonly anchor: string;
}

/** The id a step's row carries on the request's page, for a link straight to it. */
export function stepAnchor(key: string): string {
  return `check-${key.replace(/[^A-Za-z0-9_-]+/g, '-')}`;
}

/**
 * What in a request needs a person now, in lifecycle order: an approval to give, a conflict to
 * resolve, a failed gate or automation to rerun or waive. Empty: nothing waits on anybody.
 */
export function attentionOf(request: ReleaseRequest): readonly AttentionPoint[] {
  return releaseLifecycle(request).flatMap((stage) =>
    stage.steps.flatMap((step) => {
      if (!step.attention) return [];
      return [
        {
          key: step.key,
          label: step.label,
          action: step.kind === 'approval' ? 'Approve' : step.kind === 'fold' ? 'Resolve' : 'Look',
          // A red test run is looked at in its failing tests.
          anchor: step.key.endsWith(':CI') ? FAILED_TESTS : stepAnchor(step.key),
        },
      ];
    }),
  );
}

/** The id of the failing tests on the request's overview (the test run's reports). */
export const FAILED_TESTS = 'failed-tests';

/** One step of the phase before the tests, as the cog counts it. */
interface PreTestStep {
  readonly label: string;
  readonly state: StepState;
  readonly word: string;
  readonly detail: string | null;
  /** Not applicable to this repository: listed with its reason, not counted. */
  readonly notApplicable: boolean;
}

/**
 * The phase before the tests (P1) as its steps: the merge of the sources (where an upstream
 * version bump on `maintenance/dependencies` also comes in), then every automation the answer
 * lists, the ones that do not apply (`NOT_APPLICABLE`) with their reason. Without automation rows
 * (an answer that carries none), the automations gate stands for them.
 */
export function preTestSteps(request: ReleaseRequest, fold: Stage): readonly PreTestStep[] {
  const merge = fold.steps.find((step) => step.kind === 'fold');
  const steps: PreTestStep[] = [
    {
      label: 'Merge',
      state: merge?.state ?? 'pending',
      word: merge?.word ?? 'not folded',
      detail: null,
      notApplicable: false,
    },
  ];
  const rows = request.automations;
  if (rows && rows.length > 0) {
    for (const row of rows) {
      steps.push({
        label: row.label ?? row.kind ?? 'automation',
        state: stepStateOf(row.state),
        word: wordOf(row.state),
        detail: row.detail?.trim() || null,
        notApplicable: row.state === 'NOT_APPLICABLE',
      });
    }
  } else {
    const gate = (request.pipeline?.gates ?? request.gates ?? []).find(
      (entry) => entry.kind === 'AUTOMATIONS',
    );
    if (gate) {
      steps.push({
        label: 'Automations',
        state: stepStateOf(gate.state),
        word: wordOf(gate.state),
        detail: null,
        notApplicable: false,
      });
    }
  }
  return steps;
}

/**
 * The phase before the tests as one cog: done / applicable steps including the merge, with the
 * ones that do not apply counted apart ("2/3 · 1 skipped") and listed with their reason in the
 * tooltip. Red when the merge conflicted or an automation failed (somebody must act), green when
 * every applicable step is done, blue while some run or some are done, grey before.
 */
function preTestPoint(request: ReleaseRequest, fold: Stage): SummaryPoint {
  const steps = preTestSteps(request, fold);
  const applicable = steps.filter((step) => !step.notApplicable);
  const skipped = steps.filter((step) => step.notApplicable);
  const done = applicable.filter((step) => step.state === 'passed' || step.state === 'skipped');
  const cog: AutomationState = applicable.some((step) => step.state === 'failed')
    ? 'failed'
    : done.length === applicable.length
      ? 'passed'
      : done.length > 0 || applicable.some((step) => step.state === 'running')
        ? 'running'
        : 'pending';
  const count =
    cog === 'passed'
      ? undefined
      : `${done.length}/${applicable.length}${skipped.length ? ` · ${skipped.length} skipped` : ''}`;
  const line = (step: PreTestStep) =>
    `${step.label}: ${step.word}${step.detail ? ` — ${step.detail}` : ''}`;
  return {
    key: 'automations',
    kind: 'cog',
    label: 'Merge and automations',
    state: cog,
    shield: cog === 'running' ? 'pending' : cog,
    count,
    title: [
      'Merge and automations',
      ...applicable.map(line),
      ...skipped.map((step) => `Skipped: ${step.label}${step.detail ? ` — ${step.detail}` : ''}`),
    ].join('\n'),
    attention: cog === 'failed',
    anchor: stepAnchor(
      applicable.find((step) => step.state === 'failed')?.label === 'Merge'
        ? 'fold'
        : 'automations',
    ),
  };
}
