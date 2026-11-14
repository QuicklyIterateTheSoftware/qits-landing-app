import {
  aboutProjectAgents,
  heardAgentState,
  namedAgentTerminalSocketUrl,
  promptAnswerLine,
  promptRefusalLine,
} from './named-agents';

const event = (payload: object) => ({
  name: 'NamedAgentStateChanged',
  payload: JSON.stringify(payload),
});

describe('namedAgentTerminalSocketUrl', () => {
  it('is the command’s terminal on qits-projects’ container proxy, ws for http', () => {
    expect(namedAgentTerminalSocketUrl('https://projects.qits.example', 'p 1', 'c/1')).toBe(
      'wss://projects.qits.example/projects/container/p%201/terminal/commands/c%2F1',
    );
    expect(namedAgentTerminalSocketUrl('http://localhost:8080/', 'p1', 'c1')).toBe(
      'ws://localhost:8080/projects/container/p1/terminal/commands/c1',
    );
  });
});

describe('aboutProjectAgents', () => {
  it('takes an event naming the project, and nothing without a project', () => {
    expect(aboutProjectAgents(event({ projectId: 'p1' }), 'p1')).toBe(true);
    expect(aboutProjectAgents(event({ projectId: 'p2' }), 'p1')).toBe(false);
    expect(aboutProjectAgents(event({ projectId: 'p1' }), undefined)).toBe(false);
    expect(aboutProjectAgents({ name: 'x', payload: 'not json' }, 'p1')).toBe(false);
  });
});

describe('heardAgentState', () => {
  it('reads the state and the command of the named agent of the project', () => {
    const heard = event({
      projectId: 'p1',
      agentName: 'ui-builder',
      state: 'BUSY',
      commandId: 'c1',
    });
    expect(heardAgentState(heard, 'p1', 'ui-builder')).toEqual({ state: 'BUSY', commandId: 'c1' });
  });

  it('reads a missing or empty command as none', () => {
    const starting = event({ projectId: 'p1', agentName: 'ui-builder', state: 'STARTING' });
    expect(heardAgentState(starting, 'p1', 'ui-builder')).toEqual({
      state: 'STARTING',
      commandId: null,
    });
    const blank = event({ projectId: 'p1', agentName: 'ui-builder', state: 'IDLE', commandId: '' });
    expect(heardAgentState(blank, 'p1', 'ui-builder')?.commandId).toBeNull();
  });

  it('ignores another agent, another project, and a state it does not know', () => {
    const of = (payload: object) => heardAgentState(event(payload), 'p1', 'ui-builder');
    expect(of({ projectId: 'p1', agentName: 'desk', state: 'IDLE' })).toBeNull();
    expect(of({ projectId: 'p2', agentName: 'ui-builder', state: 'IDLE' })).toBeNull();
    expect(of({ projectId: 'p1', agentName: 'ui-builder', state: 'RUNNING' })).toBeNull();
  });
});

describe('promptAnswerLine', () => {
  it('says delivered, queued at a position, queued, or held while the agent starts', () => {
    expect(
      promptAnswerLine({ state: 'IDLE', delivered: true, queued: false, position: null }),
    ).toBe('Delivered to the agent.');
    expect(promptAnswerLine({ state: 'BUSY', delivered: false, queued: true, position: 2 })).toBe(
      'Queued at position 2: the agent takes it after its current turn.',
    );
    expect(
      promptAnswerLine({ state: 'BUSY', delivered: false, queued: true, position: null }),
    ).toBe('Queued: the agent takes it after its current turn.');
    expect(
      promptAnswerLine({ state: 'STARTING', delivered: false, queued: true, position: null }),
    ).toBe('Starting the agent; your prompt is delivered when it is up.');
  });
});

describe('promptRefusalLine', () => {
  it('says the status and the server’s reason, else what the status means', () => {
    expect(promptRefusalLine(409, 'a prompt already waits for the agent')).toBe(
      'Not sent (409): a prompt already waits for the agent.',
    );
    expect(promptRefusalLine(429, undefined)).toBe(
      'Not sent (429): the agent’s prompt queue is full.',
    );
    expect(promptRefusalLine(503, ' ')).toBe(
      'Not sent (503): the agent’s daemon cannot be reached.',
    );
    expect(promptRefusalLine(500, undefined)).toBe('Not sent (500): the service refused it.');
    expect(promptRefusalLine(0, undefined)).toBe('Not sent: the service is unreachable.');
  });
});
