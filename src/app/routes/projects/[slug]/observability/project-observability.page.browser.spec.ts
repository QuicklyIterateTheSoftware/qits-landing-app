import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { commands, page } from 'vitest/browser';
import { ProjectObservabilityPage } from './project-observability.page';

/**
 * Screenshots of a project's Observability page, at the recorded project's slug (qits-projects' "a project
 * exists"). The page is blank for now and calls no backend, so the one screenshot holds the empty
 * page; it changes when the page is built up.
 */
describe('ProjectObservabilityPage (screenshots)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/observability', component: ProjectObservabilityPage },
        ]),
      ],
    });
  });

  it('shows the blank page', async () => {
    const list = await commands.goldenMaster('a project exists', 'listProjects');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/projects/${list.entries[0].project.slug}/observability`);
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    // An empty page has no height; a screenshot needs an area, so it gets one of a fixed size.
    element.style.width = '760px';
    element.style.height = '200px';
    await expect.element(page.elementLocator(element)).toMatchScreenshot('blank');
  });
});
