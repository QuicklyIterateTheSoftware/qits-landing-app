import { TestBed } from '@angular/core/testing';
import { buildConversation, type ChatItem } from '$core/workspaces/chat-model';
import { workspaceDaemonGoldenMaster } from '../../../../testing/golden-masters';
import { Conversation } from './conversation';

/** The recorded transcript's lines: a prompt, the agent's text, a tool call and its result. */
const RECORDED: readonly string[] = workspaceDaemonGoldenMaster(
  'a workspace daemon with an agent that has taken turns',
  'getCommandLog',
).lines.map((line: { content: string }) => line.content);

function render(items: readonly ChatItem[]): HTMLElement {
  const fixture = TestBed.createComponent(Conversation);
  fixture.componentRef.setInput('items', items);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Conversation', () => {
  it('draws the person’s turns and the agent’s text open, and the tool traffic folded', () => {
    const element = render(buildConversation(RECORDED).items);
    const articles = [...element.querySelectorAll('article')].map((a) => a.textContent?.trim());
    expect(articles[0]).toContain('You');
    expect(articles[0]).toContain('Fix the login');
    expect(articles).toContain('Reading the login service first.');
    expect(articles).toContain('Fixed: the user name is trimmed before the lookup.');
    const folds = [...element.querySelectorAll('details')];
    expect(folds.map((d) => d.open)).toEqual([false, false]);
    expect(folds[0].querySelector('summary')?.textContent).toContain('Read');
    expect(folds[0].querySelector('summary')?.textContent).toContain(
      'src/main/java/app/Login.java',
    );
    expect(folds[1].querySelector('summary')?.textContent?.trim()).toBe('Tool result');
  });

  it('cannot let an error go unseen', () => {
    const element = render([{ kind: 'error', text: 'The run ended with error_max_turns.' }]);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('error_max_turns');
  });

  it('says where a side-chain is shown out of place, and draws its items', () => {
    const element = render([
      {
        kind: 'side-chain',
        agentType: 'Explore',
        description: 'find the login',
        anchored: false,
        items: [{ kind: 'assistant', text: 'Found it.' }],
      },
    ]);
    expect(element.querySelector('summary')?.textContent).toContain('Sub-agent: Explore');
    expect(element.textContent).toContain('no longer in the conversation');
    expect(element.querySelector('app-conversation')?.textContent).toContain('Found it.');
  });

  it('says how much of a long tool result it shows', () => {
    const element = render([
      { kind: 'tool-result', toolUseId: 't', text: 'x', truncatedFrom: 9000, isError: true },
    ]);
    expect(element.querySelector('summary')?.textContent?.trim()).toBe('Tool failed');
    expect(element.textContent).toContain('of 9000');
  });
});
