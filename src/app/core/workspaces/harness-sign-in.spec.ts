import { workspaceDaemonGoldenMaster } from '../../../testing/golden-masters';
import { signedOutHarness } from './harness-sign-in';

const SIGNED_IN = 'a workspace daemon with a signed-in harness';
const SIGNED_OUT = 'a workspace daemon with a harness nobody signed in';

describe('signedOutHarness', () => {
  const report = (state: string) =>
    workspaceDaemonGoldenMaster(state, 'availableAgents').capabilities;

  it('names the harness nobody signed in, with the daemon’s hint', () => {
    const out = signedOutHarness(report(SIGNED_OUT), 'CLAUDE');
    expect(out?.harness).toBe('CLAUDE');
    expect(out?.message).toBe(
      'Nobody has signed Claude Code in on the shared credential volume, so the agent cannot ' +
        `start. ${report(SIGNED_OUT)[0].authDetail}`,
    );
  });

  it('says nothing for a signed-in harness, or one the report does not hold', () => {
    expect(signedOutHarness(report(SIGNED_IN), 'CLAUDE')).toBeNull();
    expect(signedOutHarness(report(SIGNED_OUT), 'KIMI')).toBeNull();
  });

  it('takes any harness when the agent’s is not known', () => {
    expect(signedOutHarness(report(SIGNED_OUT), null)?.harness).toBe('CLAUDE');
  });
});
