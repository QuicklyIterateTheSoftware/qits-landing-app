import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EVENT_SOURCE, type EventSourceLike } from '$core/events/domain-events';
import type { AgentDelivery } from '$core/workspaces/agent-prompt.consumes';
import { draftText } from '$core/workspaces/agent-prompt.store';
import {
  PickedContext,
  referenceText,
  serializePrompt,
  type CodeReference,
} from '$core/workspaces/picked-context';
import { WorkspaceHints } from '$core/workspaces/workspace-hints';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../api/workspaces/client/client.gen';
import { client as workspaceDaemonClient } from '../../../api/workspace-daemon/client.gen';
import {
  workspaceDaemonGoldenMaster,
  workspacesGoldenMaster,
  workspacesGoldenMasters,
} from '../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { DRAFT_DEBOUNCE_MS, deliveryNote, PromptComposer } from './prompt-composer';

const SAVED = 'an agent with a saved prompt draft';
const NONE = 'an agent with no prompt draft';
const WORKING = 'an agent working on a ticket';
const NO_AGENT = 'a work item with no workspaces';
const { agentId } = workspacesGoldenMasters.operation(SAVED, 'getAgentPromptDraft').params;
const DRAFT = `/workspaces/api/agents/${agentId}/prompt-draft`;
const DELIVERY = '/workspaces/api/agent-dispatches/delivery';
const ORIGIN = 'https://workspaces.test';
const WORK_ID = 'w-1';

@Component({
  imports: [PromptComposer],
  providers: [WorkspaceHints],
  template: `<app-prompt-composer
    [agentId]="agentId"
    [workId]="workId"
    [workspaceRowId]="rowId()"
    preamble="contract-00000001-10: Fix the login"
    (sent)="sent.push($event)"
    (openReference)="opened.push($event)"
  />`,
})
class Host {
  readonly agentId = agentId;
  readonly workId = WORK_ID;
  readonly rowId = signal(1);
  readonly sent: AgentDelivery[] = [];
  readonly opened: CodeReference[] = [];
}

/** Lines 4-6 of the daemon's recorded source file, as the Files tab picks them. */
const LOGIN = workspaceDaemonGoldenMaster(
  'a workspace daemon with an agent whose worktree holds files',
  'readFile',
);
const PICK: CodeReference = {
  path: LOGIN.path,
  startLine: 4,
  endLine: 6,
  excerpt: LOGIN.content.split('\n').slice(3, 6).join('\n'),
};

/** A pick made in the Files tab before the Chat tab opened. */
function pickedInFiles(): PickedContext {
  const picked = TestBed.inject(PickedContext);
  picked.use(agentId);
  picked.add(PICK);
  return picked;
}

/** Lets the generated client's awaits and the fake timers run. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('PromptComposer', () => {
  let http: HttpTestingController;
  let source: EventSourceLike | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    source = undefined;
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
        provideHeyApiClient(workspaceDaemonClient),
        provideTestPlatformOrigins({ workspaces: ORIGIN }),
        {
          provide: EVENT_SOURCE,
          useValue: () =>
            (source = { onmessage: null, onerror: null, readyState: 1, close: () => undefined }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  async function render(draft: 'saved' | 'none' = 'saved') {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await settle();
    if (draft === 'saved') {
      http.expectOne(DRAFT).flush(workspacesGoldenMaster(SAVED, 'getAgentPromptDraft'));
    } else {
      http.expectOne(DRAFT).flush(workspacesGoldenMaster(NONE, 'getAgentPromptDraft'), {
        status: 404,
        statusText: 'Not Found',
      });
    }
    await settle();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const prompt = () => element.querySelectorAll('textarea')[1];
    const notes = () => element.querySelectorAll('textarea')[0];
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    const type = (box: HTMLTextAreaElement, value: string) => {
      box.value = value;
      box.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, element, prompt, notes, button, type };
  }

  it('restores the saved draft and says so, with a way to discard it', async () => {
    const { element, prompt, button, fixture } = await render();
    const recorded = workspacesGoldenMaster(SAVED, 'getAgentPromptDraft');
    expect(prompt().value).toBe(draftText(recorded.draft.content));
    expect(element.textContent).toContain('Restored draft from');
    button('Discard')!.click();
    await settle();
    const request = http.expectOne(DRAFT);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    fixture.detectChanges();
    expect(prompt().value).toBe('');
    expect(element.textContent).not.toContain('Restored draft');
  });

  it('starts empty when nothing was ever composed', async () => {
    const { element, prompt, button } = await render('none');
    expect(prompt().value).toBe('');
    expect(element.textContent).not.toContain('Restored draft');
    expect(button('Send to the agent')!.disabled).toBe(true);
  });

  it('saves the prompt once typing stops, so it survives a reload', async () => {
    const { element, prompt, type, fixture } = await render('none');
    type(prompt(), 'Check the rounding');
    type(prompt(), 'Check the rounding, then the totals.');
    expect(element.textContent).toContain('Not saved yet');
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS - 1);
    http.expectNone(DRAFT);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    const request = http.expectOne(DRAFT);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(
      workspacesGoldenMasters.operation(SAVED, 'saveAgentPromptDraft').body,
    );
    request.flush(workspacesGoldenMaster(SAVED, 'saveAgentPromptDraft'));
    await settle();
    fixture.detectChanges();
    expect(element.textContent).not.toContain('Not saved');
  });

  it('marks a draft that did not save, and says why', async () => {
    const { element, prompt, type, fixture } = await render('none');
    type(prompt(), 'Check the rounding');
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS);
    await settle();
    http.expectOne(DRAFT).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await settle();
    fixture.detectChanges();
    expect(element.textContent).toContain('Not saved: the next edit retries');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('503');
  });

  it('writes the draft, then delivers the prompt, then empties the draft', async () => {
    const { fixture, prompt, type, button } = await render('none');
    type(prompt(), 'Check the rounding, then the totals.');
    button('Send to the agent')!.click();
    await settle();
    http.expectOne(DRAFT).flush(workspacesGoldenMaster(SAVED, 'saveAgentPromptDraft'));
    await settle();
    const delivery = http.expectOne(DELIVERY);
    expect(delivery.request.body).toEqual({
      workId: WORK_ID,
      text: 'Check the rounding, then the totals.',
      compactFirst: false,
    });
    const answer = workspacesGoldenMaster(WORKING, 'deliverAgentTurn');
    delivery.flush(answer);
    await settle();
    const discard = http.expectOne(DRAFT);
    expect(discard.request.method).toBe('DELETE');
    discard.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    fixture.detectChanges();
    expect(fixture.componentInstance.sent).toEqual([answer]);
    expect(prompt().value).toBe('');
  });

  it('keeps the prompt when no agent works on the item any more', async () => {
    const { fixture, element, prompt, button } = await render();
    button('Send to the agent')!.click();
    await settle();
    http.expectOne(DELIVERY).flush(workspacesGoldenMaster(NO_AGENT, 'deliverAgentTurn'));
    await settle();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'No agent works on this item any more',
    );
    expect(prompt().value).not.toBe('');
    expect(fixture.componentInstance.sent).toEqual([]);
  });

  it('refines rough notes into the prompt, after what was typed', async () => {
    const { fixture, prompt, notes, type, button } = await render();
    const before = prompt().value;
    type(notes(), 'uh so the login um it fails when the name has spaces');
    button('Refine into prompt')!.click();
    await settle();
    const request = http.expectOne(`${ORIGIN}/workspaces/container/1/prompt-refinements`);
    expect(request.request.body).toEqual({
      transcript: 'uh so the login um it fails when the name has spaces',
      preamble: 'contract-00000001-10: Fix the login',
    });
    const answer = workspaceDaemonGoldenMaster(
      'a workspace daemon with a signed-in harness',
      'refinePrompt',
    );
    request.flush(answer);
    await settle();
    fixture.detectChanges();
    expect(prompt().value).toBe(`${before}\n\n${answer.prompt}`);
    expect(notes().value).toBe('');
    // A promotion is an edit: it is saved like one.
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS);
    await settle();
    http.expectOne(DRAFT).flush(workspacesGoldenMaster(SAVED, 'saveAgentPromptDraft'));
    await settle();
  });

  it('offers no rewrite to a queued agent, only the notes as they are', async () => {
    const { fixture, prompt, notes, type, button } = await render('none');
    fixture.componentInstance.rowId.set(0);
    type(notes(), 'trim the name');
    expect(button('Refine into prompt')).toBeUndefined();
    button('Use as-is')!.click();
    fixture.detectChanges();
    expect(prompt().value).toBe('trim the name');
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS);
    await settle();
    http.expectOne(DRAFT).flush(workspacesGoldenMaster(SAVED, 'saveAgentPromptDraft'));
    await settle();
  });

  it('adopts another device’s draft on the prompt-draft hint, when nothing here is unsaved', async () => {
    const { fixture, prompt } = await render('none');
    const channel = fixture.debugElement.injector.get(WorkspaceHints);
    channel.watch(1);
    source!.onmessage?.(new MessageEvent('message', { data: 'prompt-draft' }));
    fixture.detectChanges();
    await settle();
    const answer = workspacesGoldenMaster(SAVED, 'getAgentPromptDraft');
    http.expectOne(DRAFT).flush(answer);
    await settle();
    fixture.detectChanges();
    expect(prompt().value).toBe(draftText(answer.draft.content));
  });

  it('restores the draft and keeps what was picked since, saving them together', async () => {
    pickedInFiles();
    const { element, prompt } = await render();
    const recorded = workspacesGoldenMaster(SAVED, 'getAgentPromptDraft');
    expect(prompt().value).toBe(draftText(recorded.draft.content));
    expect(element.querySelector('[aria-label="Picked context"]')?.textContent).toContain(
      'src/main/java/app/Login.java:4-6',
    );
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS);
    await settle();
    const request = http.expectOne(DRAFT);
    const text = draftText(recorded.draft.content);
    expect(JSON.parse(request.request.body.content)).toEqual({ text, picked: [PICK] });
    expect(request.request.body.serializedPrompt).toBe(serializePrompt({ text, picked: [PICK] }));
    request.flush(workspacesGoldenMaster(SAVED, 'saveAgentPromptDraft'));
    await settle();
  });

  it('puts a pick in the prompt on a press, opens it on ↗, and drops it on ✕', async () => {
    const picked = pickedInFiles();
    const { fixture, element, prompt } = await render('none');
    const row = element.querySelector<HTMLButtonElement>(
      '[aria-label="Picked context"] li button',
    )!;
    row.click();
    fixture.detectChanges();
    expect(prompt().value).toBe(referenceText(PICK));
    element.querySelector<HTMLButtonElement>(`[aria-label="Open ${PICK.path}:4-6"]`)!.click();
    expect(fixture.componentInstance.opened).toEqual([PICK]);
    element.querySelector<HTMLButtonElement>(`[aria-label="Remove ${PICK.path}:4-6"]`)!.click();
    fixture.detectChanges();
    expect(picked.any()).toBe(false);
    expect(element.querySelector('[aria-label="Picked context"]')).toBeNull();
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS);
    await settle();
    const request = http.expectOne(DRAFT);
    expect(JSON.parse(request.request.body.content)).toEqual({
      text: referenceText(PICK),
      picked: [],
    });
    request.flush(workspacesGoldenMaster(SAVED, 'saveAgentPromptDraft'));
    await settle();
  });

  it('sends the picks never pressed in after the prompt, and empties them', async () => {
    const picked = pickedInFiles();
    const { prompt, type, button } = await render('none');
    type(prompt(), 'Trim the e-mail too.');
    button('Send to the agent')!.click();
    await settle();
    http.expectOne(DRAFT).flush(workspacesGoldenMaster(SAVED, 'saveAgentPromptDraft'));
    await settle();
    const delivery = http.expectOne(DELIVERY);
    expect(delivery.request.body.text).toBe(
      `Trim the e-mail too.\n\nContext picked in the worktree:\n\n${referenceText(PICK)}`,
    );
    delivery.flush(workspacesGoldenMaster(WORKING, 'deliverAgentTurn'));
    await settle();
    http.expectOne(DRAFT).flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    expect(picked.any()).toBe(false);
  });

  it('shows no speech control', async () => {
    const { element } = await render();
    const labels = [...element.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).not.toContain('Record');
    expect(labels).not.toContain('Stop');
    expect(element.textContent).not.toMatch(/dictat|microphone|record/i);
  });
});

describe('deliveryNote', () => {
  it('says what became of a delivered prompt', () => {
    expect(deliveryNote(workspacesGoldenMaster(WORKING, 'deliverAgentTurn'))).toBe(
      'Sent. The agent hears it as its first turn, once it starts.',
    );
    expect(deliveryNote({ resumed: true })).toBe('Sent. The agent resumes to hear it.');
    expect(deliveryNote({ delivered: true })).toBe(
      'Sent. The agent hears it at its next turn boundary.',
    );
  });
});
