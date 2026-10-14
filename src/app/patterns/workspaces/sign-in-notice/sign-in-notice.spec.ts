import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as workspaceDaemonClient } from '../../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../../api/workspace-daemon/client/client.gen';
import { AgentSignInStore } from '$core/workspaces/agent-sign-in.store';
import { workspaceDaemonGoldenMaster } from '../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { SignInNotice } from './sign-in-notice';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const SIGNED_IN = 'a workspace daemon with a signed-in harness';
const SIGNED_OUT = 'a workspace daemon with a harness nobody signed in';
const ORIGIN = 'https://workspaces.qits.example';
const BASE = `${ORIGIN}/workspaces/container/1`;

@Component({
  imports: [SignInNotice],
  template: `<app-sign-in-notice [workspaceRowId]="1" [harness]="harness()" />`,
})
class Host {
  readonly harness = signal<string | null>('CLAUDE');
}

describe('SignInNotice', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspaceDaemonClient),
        provideTestPlatformOrigins({ workspaces: ORIGIN }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(report: string, harness: string | null = 'CLAUDE') {
    const loaded = TestBed.inject(AgentSignInStore).loadReport(1);
    await settle();
    http
      .expectOne(`${BASE}/agents/available`)
      .flush(workspaceDaemonGoldenMaster(report, 'availableAgents'));
    await loaded;
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.harness.set(harness);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, text: () => element.textContent?.replace(/\s+/g, ' ') ?? '' };
  }

  it('says nothing while the harness is signed in', async () => {
    const { text } = await render(SIGNED_IN);
    expect(text().trim()).toBe('');
  });

  it('says nothing about a harness other than the agent’s', async () => {
    const { text } = await render(SIGNED_OUT, 'KIMI');
    expect(text().trim()).toBe('');
  });

  it('says nobody signed in, opens the sign-in terminal, and steps aside', async () => {
    const { fixture, element, text } = await render(SIGNED_OUT);
    expect(text()).toContain('Nobody has signed Claude Code in on the shared credential volume');
    element.querySelector('button')!.click();
    fixture.detectChanges();
    expect(text()).toContain('Opening…');
    await settle();
    http
      .expectOne(`${BASE}/agents/sign-in`)
      .flush(workspaceDaemonGoldenMaster(SIGNED_OUT, 'openSignInTerminal'));
    await settle();
    fixture.detectChanges();
    expect(text().trim()).toBe('');
  });
});
