import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as workspaceDaemonClient } from '../../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../../api/workspace-daemon/client/client.gen';
import { AgentPluginsStore } from '$core/workspaces/agent-plugins.store';
import { workspaceDaemonGoldenMaster } from '../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { PluginsSection } from './plugins-section';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const INSTALLED = 'a workspace daemon with plugins installed';
const ORIGIN = 'https://workspaces.qits.example';
const BASE = `${ORIGIN}/workspaces/container/1`;

@Component({
  imports: [PluginsSection],
  template: `<app-plugins-section [workspaceRowId]="1" />`,
})
class Host {}

describe('PluginsSection', () => {
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

  async function render() {
    const loaded = TestBed.inject(AgentPluginsStore).load(1);
    await settle();
    http
      .expectOne(`${BASE}/agent-plugins`)
      .flush(workspaceDaemonGoldenMaster(INSTALLED, 'listPlugins'));
    await loaded;
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const row = (name: string) =>
      Array.from(element.querySelectorAll('li')).find((li) => li.textContent?.includes(name))!;
    return { fixture, element, row };
  }

  it('shows each curated plugin, installed, switched off or to install', async () => {
    const { row } = await render();
    expect(row('Java language server').textContent).toContain('installed');
    expect(row('Java language server').querySelector('button')).toBeNull();
    expect(row('TypeScript language server').textContent).toContain('installed, switched off');
    expect(row('Python language server').querySelector('button')?.textContent).toContain('Install');
  });

  it('installs one and shows the refreshed list', async () => {
    const { fixture, row } = await render();
    row('Python language server').querySelector('button')!.click();
    fixture.detectChanges();
    expect(row('Python language server').textContent).toContain('Installing…');
    await settle();
    http
      .expectOne(`${BASE}/agent-plugins/pyright-lsp/install`)
      .flush(workspaceDaemonGoldenMaster(INSTALLED, 'installPlugin'));
    await settle();
    fixture.detectChanges();
    expect(row('Python language server').querySelector('button')).toBeNull();
  });

  it('says why an install failed', async () => {
    const { fixture, element, row } = await render();
    row('Rust language server').querySelector('button')!.click();
    await settle();
    // No refused install is recorded; an error answer is only a status and its message.
    http
      .expectOne(`${BASE}/agent-plugins/rust-analyzer-lsp/install`)
      .flush({ message: 'Unknown plugin.' }, { status: 400, statusText: 'Bad Request' });
    await settle();
    fixture.detectChanges();
    expect(element.querySelector('[role=alert]')?.textContent).toContain(
      'rust-analyzer-lsp was not installed — 400 Unknown plugin.',
    );
  });
});
