import { QitsApiError, QitsOfflineError } from '@qits/angular';
import { START_PROCESS_RUN } from './processes.operations';
import { callPath, explainStart, processStatusTone, readableJson, took } from './process-runs';

/** The process page's pure parts (qits-2359). */
describe('process runs', () => {
  it('tones a status: running waits, succeeded is ok, failed failed, the rest neutral', () => {
    expect(processStatusTone('RUNNING')).toBe('waiting');
    expect(processStatusTone('SUCCEEDED')).toBe('ok');
    expect(processStatusTone('FAILED')).toBe('failed');
    expect(processStatusTone('PENDING')).toBe('neutral');
    expect(processStatusTone('SKIPPED')).toBe('neutral');
    expect(processStatusTone(undefined)).toBe('neutral');
  });

  it('says how long it took, and a dash while it runs or never finished', () => {
    expect(took('2026-01-01T00:00:00Z', '2026-01-01T00:03:30Z')).toBe('3m 30s');
    expect(took('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe('0s');
    expect(took('2026-01-01T00:00:00Z', null)).toBe('—');
    expect(took(null, null)).toBe('—');
  });

  it('drops the peer’s host from a call, keeping its query', () => {
    expect(callPath('http://dev-qits-artifacts:8080/artifacts/api/gc/plan')).toBe(
      '/artifacts/api/gc/plan',
    );
    expect(callPath('http://dev-qits-ci:8080/ci/api/daemon?x=1')).toBe('/ci/api/daemon?x=1');
    expect(callPath('not a url')).toBe('not a url');
    expect(callPath(null)).toBe('');
  });

  it('indents JSON text, and keeps text that is not JSON as it is', () => {
    expect(readableJson('{"dryRun":true}')).toBe('{\n  "dryRun": true\n}');
    const cut = '{"a":[1,2\n…truncated by qits-platform-orchestrator at 1048576 bytes';
    expect(readableJson(cut)).toBe(cut);
  });

  it('explains a start that brought no run', () => {
    const operation = START_PROCESS_RUN;
    const refusal = (status: number, message?: string) =>
      new QitsApiError(status, message ? { message } : undefined, operation);
    expect(explainStart(refusal(409, 'a gc run is already active: 00000000'))).toBe(
      'Not started: a gc run is already active: 00000000.',
    );
    expect(explainStart(refusal(403))).toBe('Starting a run needs an admin role.');
    expect(explainStart(refusal(404))).toBe('Not started: 404.');
    expect(explainStart(refusal(502))).toContain('whether a run started is not known');
    expect(explainStart(new QitsOfflineError('offline'))).toContain('never queued');
  });
});
