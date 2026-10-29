import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { workspacesGoldenMaster, workspacesGoldenMasters } from '../../../testing/golden-masters';
import { AgentPromptStore, draftContent, draftPicked, draftText } from './agent-prompt.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const SAVED = 'an agent with a saved prompt draft';
const NONE = 'an agent with no prompt draft';
const WORKING = 'an agent working on a ticket';
const { agentId } = workspacesGoldenMasters.operation(SAVED, 'getAgentPromptDraft').params;
const DRAFT = `/workspaces/api/agents/${agentId}/prompt-draft`;
const PROMPT = `/workspaces/api/agents/${agentId}/prompt`;

describe('draftContent and draftText', () => {
  it('write the prompt as the composition qits-workspaces records, and read it back', () => {
    const { content } = workspacesGoldenMasters.operation(SAVED, 'saveAgentPromptDraft').body as {
      content: string;
    };
    expect(draftContent(draftText(content))).toBe(content);
  });

  it('read a blob they cannot as an empty prompt', () => {
    expect(draftText('not json')).toBe('');
    expect(draftText('{"text":3}')).toBe('');
    expect(draftText(undefined)).toBe('');
  });

  it('carry the picked line ranges, and read none from a blob without them', () => {
    const picked = [{ path: 'pom.xml', startLine: 2, endLine: 4, excerpt: '<project>' }];
    const content = draftContent('Look here.', picked);
    expect(draftText(content)).toBe('Look here.');
    expect(draftPicked(content)).toEqual(picked);
    expect(draftPicked('not json')).toEqual([]);
    expect(draftPicked(undefined)).toEqual([]);
  });
});

/** `AgentPromptStore` on qits-workspaces' recorded states (epic qits-1230). */
describe('AgentPromptStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof AgentPromptStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AgentPromptStore);
  });

  afterEach(() => http.verify());

  it('restores the saved draft', async () => {
    const done = store.readDraft(agentId);
    await settle();
    const answer = workspacesGoldenMaster(SAVED, 'getAgentPromptDraft');
    http.expectOne(DRAFT).flush(answer);
    expect(await done).toEqual({
      ok: true,
      value: {
        text: draftText(answer.draft.content),
        picked: [],
        updatedAt: answer.draft.updatedAt,
      },
    });
  });

  it('reads a 404 as no draft, not as a failure', async () => {
    const done = store.readDraft(agentId);
    await settle();
    http.expectOne(DRAFT).flush(workspacesGoldenMaster(NONE, 'getAgentPromptDraft'), {
      status: 404,
      statusText: 'Not Found',
    });
    expect(await done).toEqual({ ok: true, value: null });
  });

  it('reads any other failure as one', async () => {
    const done = store.readDraft(agentId);
    await settle();
    http.expectOne(DRAFT).flush(null, { status: 503, statusText: 'Service Unavailable' });
    expect(await done).toEqual({ ok: false, status: 503 });
  });

  it('saves the prompt as its composition and its flat text', async () => {
    const done = store.saveDraft(agentId, 'Check the rounding, then the totals.');
    await settle();
    const request = http.expectOne(DRAFT);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(
      workspacesGoldenMasters.operation(SAVED, 'saveAgentPromptDraft').body,
    );
    const answer = workspacesGoldenMaster(SAVED, 'saveAgentPromptDraft');
    request.flush(answer);
    expect(await done).toEqual({
      ok: true,
      value: {
        text: 'Check the rounding, then the totals.',
        picked: [],
        updatedAt: answer.draft.updatedAt,
      },
    });
  });

  it('discards the draft', async () => {
    const done = store.discardDraft(agentId);
    await settle();
    const request = http.expectOne(DRAFT);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(await done).toEqual({ ok: true, value: undefined });
  });

  it('prompts the agent by its id, without compacting first', async () => {
    const done = store.prompt(agentId, 'Carry on.');
    await settle();
    const request = http.expectOne(PROMPT);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ text: 'Carry on.', compactFirst: false });
    const answer = workspacesGoldenMaster(WORKING, 'promptAgent');
    request.flush(answer);
    expect(await done).toEqual({ ok: true, value: answer });
  });

  it('says a refused prompt by its status', async () => {
    const done = store.prompt(agentId, 'Carry on.');
    await settle();
    http.expectOne(PROMPT).flush(null, { status: 404, statusText: 'Not Found' });
    expect(await done).toEqual({ ok: false, status: 404 });
  });
});
