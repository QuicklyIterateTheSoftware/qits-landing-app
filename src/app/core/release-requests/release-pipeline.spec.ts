import type { ReleaseRequest } from './release-request.consumes';
import {
  automationRerunnable,
  automationSentence,
  automationsName,
  drawPipeline,
  failureLine,
  listed,
  movedFold,
  phaseRerunnable,
  terminalLine,
  verdictWord,
} from './release-pipeline';

// Pure rules, so hand-built requests (ported from qits-projects-frontend's pipeline, gates and
// automations panel specs).

const NOW = Date.parse('2026-10-09T12:00:00Z');
const FOLD = '20c377ee71fabe6f32429d1506989efecec7798b';

function request(overrides: Partial<ReleaseRequest> = {}): ReleaseRequest {
  return {
    id: 'r1',
    repoId: 'repo-1',
    repoName: 'qits-ci',
    backingBranch: 'release/r1',
    mergedSha: FOLD,
    state: 'PENDING',
    summary: 'A change worth releasing',
    ...overrides,
  };
}

/** A request before its tag: QA running, gates CI and approval pending, then publish and deploy. */
function pipelined(overrides: Partial<ReleaseRequest> = {}): ReleaseRequest {
  return request({
    pipeline: {
      phases: [{ phase: 'QA', state: 'RUNNING', runId: 'run-qa' }],
      gates: [
        { between: 'QA_PUBLISH', kind: 'CI', state: 'PENDING' },
        { between: 'QA_PUBLISH', kind: 'APPROVAL', state: 'PENDING' },
        { between: 'PUBLISH_DEPLOY', kind: 'PUBLISH', state: 'PENDING' },
        { between: 'DEPLOY_FINALIZED', kind: 'DEPLOYMENT', state: 'PENDING' },
      ],
    },
    ...overrides,
  });
}

describe('release pipeline', () => {
  describe('the phases', () => {
    it('draws every expected phase before the tag, the unreached ones as pending', () => {
      const phases = drawPipeline(pipelined(), NOW);
      expect(phases.map((p) => p.label)).toEqual(['P1 · QA', 'P2 · Publish', 'P3 · Deployment']);
      expect(phases.map((p) => p.mark)).toEqual(['● RUNNING', '○ pending', '○ pending']);
      expect(phases.map((p) => p.glyph)).toEqual(['├', '├', '└']);
    });

    it('draws two phases for a repository with no deployment at all', () => {
      const phases = drawPipeline(
        request({
          pipeline: {
            phases: [{ phase: 'QA', state: 'SUCCESS' }],
            gates: [{ between: 'PUBLISH_DEPLOY', kind: 'PUBLISH', state: 'PASSED' }],
          },
        }),
        NOW,
      );
      expect(phases.map((p) => p.phase)).toEqual(['QA', 'PUBLISH']);
      expect(phases[1].glyph).toBe('└');
    });

    it('hangs the gates after the last phase under it', () => {
      const phases = drawPipeline(
        request({
          pipeline: {
            phases: [],
            gates: [{ between: 'DEPLOY_FINALIZED', kind: 'CUSTOM', state: 'PENDING' }],
          },
        }),
        NOW,
      );
      expect(phases[phases.length - 1].gates.map((g) => g.key)).toEqual([
        'DEPLOY_FINALIZED:CUSTOM',
      ]);
    });

    it('says out loud that a cancelled or unknown phase refused nothing', () => {
      const phases = drawPipeline(
        pipelined({
          pipeline: {
            phases: [
              { phase: 'QA', state: 'SUCCESS' },
              { phase: 'PUBLISH', state: 'CANCELLED', runId: 'p' },
              { phase: 'DEPLOY', state: 'UNKNOWN', runId: 'd' },
            ],
          },
        }),
        NOW,
      );
      expect(phases[1].mark).toBe('✗ CANCELLED');
      expect(phases[1].sentence).toContain('Nothing refused the release');
      expect(phases[2].tone).toBe('unsettled');
      expect(phases[2].sentence).toContain('nothing has refused it');
    });

    it('offers no rerun on a succeeded phase, or a pending one nothing was started for', () => {
      expect(phaseRerunnable('SUCCESS', 'run')).toBe(false);
      expect(phaseRerunnable('PENDING', undefined)).toBe(false);
      expect(phaseRerunnable(undefined, undefined)).toBe(false);
      expect(phaseRerunnable('PENDING', 'run')).toBe(true);
      expect(phaseRerunnable('RUNNING', 'run')).toBe(true);
      expect(phaseRerunnable('FAILED', 'run')).toBe(true);
    });

    it('draws the finalized terminus, ticked once the tag has reached main', () => {
      expect(terminalLine(request(), NOW).name).toBe('FINALIZED');
      expect(terminalLine(request(), NOW).sentence).toContain('once everything');
      expect(terminalLine(request({ state: 'RELEASED' }), NOW).sentence).toBe(
        '— released, waiting for the tag to reach main',
      );
      const done = terminalLine(
        request({ state: 'FINALIZED', mergedToMainAt: '2026-10-09T09:00:00Z' }),
        NOW,
      );
      expect(done).toEqual({
        name: '✓ FINALIZED',
        sentence: '— the tag is on main and this release is finished, 3h ago',
      });
    });
  });

  describe('the gates', () => {
    it('words a pending gate as a wait, never as a refusal', () => {
      const [qa] = drawPipeline(pipelined(), NOW);
      expect(qa.gates.map((g) => [g.name, g.sentence])).toEqual([
        ['CI', '— waiting on a build of this fold'],
        ['Approval', '— waiting for a person'],
      ]);
    });

    it('marks answered gates and words them', () => {
      const phases = drawPipeline(
        pipelined({
          state: 'RELEASED',
          approvalState: 'APPROVED',
          approvedBy: 'alice',
          approvedAt: '2026-10-09T11:00:00Z',
          pipeline: {
            gates: [
              { between: 'QA_PUBLISH', kind: 'CI', state: 'PASSED' },
              { between: 'QA_PUBLISH', kind: 'APPROVAL', state: 'PASSED' },
              { between: 'PUBLISH_DEPLOY', kind: 'PUBLISH', state: 'FAILED' },
              { between: 'DEPLOY_FINALIZED', kind: 'DEPLOYMENT', state: 'PENDING' },
            ],
          },
        }),
        NOW,
      );
      const gates = phases.flatMap((p) => p.gates);
      expect(gates.map((g) => g.name)).toEqual(['✓ CI', '✓ Approval', '✗ Publish', 'Deployment']);
      expect(gates[1].sentence).toBe('— approved by alice, 1h ago');
      expect(gates[2].sentence).toContain('That is the environment rather than a refusal');
      expect(gates[3].sentence).toBe('— released, waiting on its deployment to go live');
    });

    it('draws a gate kind it has never heard of as itself, and says nothing refused', () => {
      const [qa] = drawPipeline(
        request({
          pipeline: { gates: [{ between: 'QA_PUBLISH', kind: 'SECURITY_SCAN', state: 'PENDING' }] },
        }),
        NOW,
      );
      expect(qa.gates[0].name).toBe('SECURITY SCAN');
      expect(qa.gates[0].sentence).toBe('— waiting on this gate; nothing has refused the release');
    });

    it('says an unreadable gate holds the request, and shows the service’s detail', () => {
      const [qa] = drawPipeline(
        request({
          pipeline: {
            gates: [{ between: 'QA_PUBLISH', kind: 'CI', state: 'UNKNOWN', detail: ' no config ' }],
          },
        }),
        NOW,
      );
      expect(qa.gates[0].sentence).toContain('could not be read');
      expect(qa.gates[0].detail).toBe('no config');
    });

    it('asks a person only on the pending approval gate of a request awaiting approval', () => {
      const asked = { approvalRequired: true, approvalState: 'REQUESTED' };
      expect(drawPipeline(pipelined(asked), NOW)[0].gates.map((g) => g.asks)).toEqual([
        false,
        true,
      ]);
      expect(drawPipeline(pipelined(), NOW)[0].gates.some((g) => g.asks)).toBe(false);
      expect(
        drawPipeline(pipelined({ ...asked, state: 'READY' }), NOW)[0].gates.some((g) => g.asks),
      ).toBe(false);
    });

    it('says which automations failed or are still running', () => {
      const automations = [
        { kind: 'a', label: 'Bump', state: 'FAILED' },
        { kind: 'b', label: 'Docs', state: 'RUNNING' },
        { kind: 'c', label: 'Lint', state: 'PENDING' },
      ];
      const failed = drawPipeline(
        request({
          automations,
          pipeline: { gates: [{ between: 'QA_PUBLISH', kind: 'AUTOMATIONS', state: 'FAILED' }] },
        }),
        NOW,
      )[0].gates[0];
      expect(failed.name).toBe('✗ Automations');
      expect(failed.sentence).toBe(
        '— Bump failed. The run says why; Re-run asks again once it is fixed.',
      );
      expect(failed.automations).toBe(true);
      const waiting = drawPipeline(
        request({
          automations,
          pipeline: { gates: [{ between: 'QA_PUBLISH', kind: 'AUTOMATIONS', state: 'PENDING' }] },
        }),
        NOW,
      )[0].gates[0];
      expect(waiting.sentence).toBe(
        '— Docs and Lint are still running; nothing has refused the release',
      );
    });

    it('draws no automation rows where the request carries none', () => {
      const [qa] = drawPipeline(
        request({
          pipeline: { gates: [{ between: 'QA_PUBLISH', kind: 'AUTOMATIONS', state: 'PASSED' }] },
        }),
        NOW,
      );
      expect(qa.gates[0].automations).toBe(false);
    });
  });

  describe('a refused decision', () => {
    it('says the fold moved when the 409 names another fold', () => {
      const message = `The request is on 9f1c2b3d4e5f, not ${FOLD}`;
      expect(movedFold(409, message, FOLD, 'Nothing was decided', 'refused')).toBe(
        'The fold changed while this was being read — this request is on 9f1c2b3 now, not ' +
          '20c377e. Nothing was decided; look at the new fold.',
      );
    });

    it('gives any other 409 in the service’s words, or the fallback', () => {
      expect(movedFold(409, 'Already decided.', FOLD, 'x', 'refused')).toBe('Already decided.');
      expect(movedFold(409, undefined, FOLD, 'x', 'refused')).toBe('refused');
    });

    it('leaves anything else to be reported as a failure', () => {
      expect(movedFold(500, 'boom', FOLD, 'x', 'refused')).toBeNull();
    });
  });

  describe('automations and verdicts', () => {
    it('words a row by its state and detail', () => {
      expect(automationSentence({ state: 'RUNNING' })).toBe('running');
      expect(automationSentence({ state: 'FRESH', detail: 'up to date' })).toBe(
        'fresh (up to date)',
      );
      expect(automationSentence({ state: 'COMMITTED', detail: 'pushed abc' })).toBe(
        'committed; pushed abc',
      );
      expect(automationSentence({ state: 'FAILED', detail: 'exit 1' })).toBe('failed: exit 1');
      expect(automationSentence({ state: 'NEEDS_PUSH', detail: 'x' })).toBe('needs push — x');
      expect(automationSentence({})).toBe('unknown');
    });

    it('offers Re-run on a failed, unknown or fresh row, never on a running one', () => {
      expect(
        ['FAILED', 'UNKNOWN', 'FRESH', 'RUNNING', 'PENDING'].map((state) =>
          automationRerunnable({ state }),
        ),
      ).toEqual([true, true, true, false, false]);
    });

    it('names the step, the image by its short name and the exit code of a failure', () => {
      expect(failureLine({ stepIndex: 2, image: 'registry.x/qits/node-base:1', exitCode: 1 })).toBe(
        'step 2 · node-base:1 · exit 1',
      );
      expect(failureLine({ stepIndex: 0, image: 'alpine' })).toBe('step 0 · alpine');
    });

    it('ticks the automations once every row is fresh or waived, crosses them on a failure', () => {
      expect(automationsName([])).toBe('✓ Automations');
      expect(automationsName([{ state: 'FRESH' }, { state: 'WAIVED' }])).toBe('✓ Automations');
      expect(automationsName([{ state: 'FRESH' }, { state: 'NOT_APPLICABLE' }])).toBe(
        '✓ Automations',
      );
      expect(automationsName([{ state: 'FAILED' }, { state: 'RUNNING' }])).toBe('✗ Automations');
      expect(automationsName([{ state: 'RUNNING' }])).toBe('Automations');
    });

    it('draws a verdict this build has never heard of as itself', () => {
      expect(verdictWord({ status: 'SUCCESS' })).toBe('success');
      expect(verdictWord({ status: 'TIMED_OUT' })).toBe('timed out');
      expect(verdictWord({})).toBe('unknown');
    });

    it('lists names as a sentence', () => {
      expect(listed([])).toBe('');
      expect(listed(['a'])).toBe('a');
      expect(listed(['a', 'b', 'c'])).toBe('a, b and c');
    });
  });
});
