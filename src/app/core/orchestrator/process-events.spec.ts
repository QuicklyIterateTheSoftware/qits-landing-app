import { ofProcess, ofRun, ofStep, PROCESS_RUN_EVENTS } from './process-events';

const event = (name: string, payload: object) => ({ name, payload: JSON.stringify(payload) });

/**
 * The process page's staleness (qits-1270, qits-2472): its runs are read again after a run event
 * of its process (`ofProcess`), the shown run after either event naming it (`ofRun`), and the open
 * step after a step event naming it (`ofStep`); nothing else does.
 */
describe('process run events', () => {
  const opened = event('ProcessRunChanged', { kind: 'gc', runId: 'run-1', status: 'RUNNING' });
  const step = event('ProcessRunStepChanged', {
    kind: 'gc',
    runId: 'run-1',
    stepId: 'pins.ci',
    status: 'SUCCEEDED',
  });

  it('names qits-orchestrator’s two run events', () => {
    expect(PROCESS_RUN_EVENTS).toEqual(['ProcessRunChanged', 'ProcessRunStepChanged']);
  });

  it('is about a process when its kind is that process', () => {
    expect(ofProcess(opened, 'gc')).toBe(true);
    expect(ofProcess(opened, 'other')).toBe(false);
    expect(ofProcess(event('ProcessRunChanged', { runId: 'run-1' }), undefined)).toBe(false);
  });

  it('is about a run when its runId is that run', () => {
    expect(ofRun(opened, 'run-1')).toBe(true);
    expect(ofRun(step, 'run-1')).toBe(true);
    expect(ofRun(opened, 'run-2')).toBe(false);
    expect(ofRun(event('ProcessRunChanged', { kind: 'gc' }), undefined)).toBe(false);
  });

  it('is about a step when its runId and stepId are that step’s', () => {
    expect(ofStep(step, 'run-1', 'pins.ci')).toBe(true);
    expect(ofStep(step, 'run-2', 'pins.ci')).toBe(false);
    expect(ofStep(step, 'run-1', 'artifacts.plan')).toBe(false);
    // A run's own event names no step.
    expect(ofStep(opened, 'run-1', undefined)).toBe(false);
  });

  it('reads nothing from an event without a JSON payload', () => {
    expect(ofRun({ name: 'ProcessRunChanged', payload: 'not json' }, 'run-1')).toBe(false);
  });
});
