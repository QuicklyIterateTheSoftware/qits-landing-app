import { ciGoldenMaster } from '../../../testing/golden-masters';
import type { CiRunDetail } from './ci-run.consumes';
import {
  cancellationNote,
  defaultOpenStep,
  elapsedSince,
  formatEta,
  isTerminal,
  openSteps,
  queuePlace,
  stepOutput,
  toggledSteps,
  triggerLabel,
  triggerProvenance,
} from './ci-run';

/**
 * The run page's pure helpers (qits-2321), over qits-ci's recordings of a run of the project:
 * finished (FAILED, its third step FAILED with exit 137), running (a finished step and the live
 * one) and queued (no step yet).
 */
const finished = ciGoldenMaster<CiRunDetail>('a finished run of the project', 'getRun');
const running = ciGoldenMaster<CiRunDetail>('a running run of the project', 'getRun');
const queued = ciGoldenMaster<CiRunDetail>('a queued run of the project', 'getRun');

describe('ci-run', () => {
  it('opens the first failed step, else the live step, else the last, on arrival', () => {
    expect(defaultOpenStep(finished)).toBe('2');
    expect(defaultOpenStep(running)).toBe('live');
    expect(defaultOpenStep(queued)).toBeUndefined();
    // A green run (derived: the finished run without its failed step) opens its last step.
    expect(defaultOpenStep({ ...finished, steps: finished.steps?.slice(0, 2) })).toBe('1');
  });

  it('opens what ?step= names instead, none for an empty value', () => {
    expect([...openSteps(finished, ['0', 'live'])]).toEqual(['0', 'live']);
    expect([...openSteps(finished, [])]).toEqual(['2']);
    expect([...openSteps(finished, [''])]).toEqual(['']);
  });

  it('flips one step, the live step last and the rest by index', () => {
    expect(toggledSteps(new Set(['2']), '0')).toEqual(['0', '2']);
    expect(toggledSteps(new Set(['live', '2']), '10')).toEqual(['2', '10', 'live']);
    expect(toggledSteps(new Set(['2']), '2')).toEqual([]);
  });

  it('takes the truncation marker off a step’s output and says it was cut', () => {
    expect(stepOutput(finished.steps?.[0].output)).toEqual({
      text: '[INFO] Compiling 214 source files with javac [debug release 21] to target/classes\n[INFO] BUILD SUCCESS\n',
      truncated: true,
    });
    expect(stepOutput('done\n')).toEqual({ text: 'done\n', truncated: false });
    expect(stepOutput(null)).toEqual({ text: '', truncated: false });
  });

  it('says a run’s facts in words', () => {
    expect(isTerminal(finished.status)).toBe(true);
    expect(isTerminal(running.status)).toBe(false);
    expect(isTerminal(queued.status)).toBe(false);
    expect(queuePlace(queued.queuePosition)).toBe('#2 in the queue');
    expect(queuePlace(0)).toBe('next in the queue');
    expect(formatEta(queued.expectedStartInMillis ?? NaN)).toBe('in about 4 min');
    expect(formatEta(running.expectedFinishInMillis ?? NaN)).toBe('any moment now');
    expect(formatEta(9_000_000)).toBe('in about 2h 30m');
    expect(triggerLabel(finished.triggerType)).toBe('event');
    expect(triggerLabel('POST_RECEIVE')).toBe('push');
    expect(triggerProvenance(finished)).toBe('ReleaseRequestChanged · .config/qits/release.yml');
    expect(cancellationNote('HELD_BY_PRE_RUN_GATE')).toBe(
      'Held: an upstream release is still building.',
    );
    expect(cancellationNote('SOMETHING_NEW')).toContain('This run was stopped.');
  });

  it('counts a live step’s time up to a day, and gives it up past one', () => {
    const now = Date.parse('2026-01-01T00:02:05Z');
    expect(elapsedSince('2026-01-01T00:00:00Z', now)).toBe('2m 5s');
    expect(elapsedSince('2026-01-01T00:00:00Z', now + 86_400_000)).toBeUndefined();
    expect(elapsedSince(null, now)).toBe('–');
  });
});
