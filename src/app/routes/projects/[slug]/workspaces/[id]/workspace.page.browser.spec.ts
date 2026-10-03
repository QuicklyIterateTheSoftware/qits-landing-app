import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { WorkspacePage } from './workspace.page';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';

/**
 * Screenshot of a work item's Workspace page, at the recorded project's slug (qits-projects' "a
 * project exists"). The page calls no backend and shows only its title for now.
 */
describe('WorkspacePage (screenshots)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/workspaces/:id', component: WorkspacePage }]),
      ],
    });
  });

  it('shows its title', async () => {
    const list = await goldenMaster('a project exists', 'listProjects');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/projects/${list.entries[0].project.slug}/workspaces/qits-111`);
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '760px';
    const locator = page.elementLocator(element);
    await expect
      .element(locator.getByRole('heading', { name: 'Workspace qits-111' }))
      .toBeVisible();
    await expect.element(locator).toMatchScreenshot('title');
  });
});
