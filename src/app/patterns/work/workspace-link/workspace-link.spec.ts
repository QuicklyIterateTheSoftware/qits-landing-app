import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../api/workspaces/client/client.gen';
import { SelectedProject } from '$core/projects/selected-project';
import { WorkspacesStore } from '$core/workspaces/workspaces.store';
import {
  workspacesGoldenMaster,
  workspacesGoldenMasters,
} from '../../../../testing/golden-masters';
import { WorkspaceLink } from './workspace-link';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const BOUND = 'a project with workspaces bound to work items';
const params = workspacesGoldenMasters.operation(BOUND, 'listOpenWorkspaces').params;

@Component({
  imports: [WorkspaceLink],
  template: `<app-workspace-link [workId]="workId()" qualifiedId="qits-7" />`,
})
class Host {
  readonly workId = input<string>();
}

/** `app-workspace-link` on qits-workspaces' open workspaces of "a project with workspaces …". */
describe('WorkspaceLink', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
        { provide: SelectedProject, useValue: { slug: signal('qits') } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(workId: string, loaded = true) {
    if (loaded) {
      const load = TestBed.inject(WorkspacesStore).load();
      await settle();
      http
        .expectOne('/workspaces/api/work/workspaces')
        .flush(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
      await load;
    }
    const fixture = TestBed.createComponent(Host);
    fixture.componentRef.setInput('workId', workId);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('app-workspace-link') as HTMLElement;
  }

  it('links the workspace page of an item with an active workspace', async () => {
    const link = await render(params['bugTicketId']);
    expect(link.classList.contains('hidden')).toBe(false);
    expect(link.querySelector('a')?.getAttribute('href')).toBe('/projects/qits/workspaces/qits-7');
    expect(link.textContent?.trim()).toBe('Workspace');
  });

  it('hides itself for an item without one', async () => {
    const link = await render(params['improvementTicketId']);
    expect(link.classList.contains('hidden')).toBe(true);
  });

  it('hides itself until the open workspaces are loaded', async () => {
    const link = await render(params['bugTicketId'], false);
    expect(link.classList.contains('hidden')).toBe(true);
  });
});
