import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { WorkspacePage } from './workspace.page';

describe('WorkspacePage', () => {
  it('names the work item in its title', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/workspaces/:id', component: WorkspacePage }]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/projects/qits/workspaces/qits-111');
    const heading = (harness.routeNativeElement as HTMLElement).querySelector('h1');
    expect(heading?.textContent?.trim()).toBe('Workspace qits-111');
  });
});
