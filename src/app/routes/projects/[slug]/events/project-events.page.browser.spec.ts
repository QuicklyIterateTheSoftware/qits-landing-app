import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { ProjectEventsPage } from './project-events.page';
import { goldenMaster } from '../../../../../testing/browser/golden-master';

/**
 * Screenshots of a project's Events page, at the recorded project's slug (qits-projects' "a project
 * exists"). The page is blank for now and calls no backend, so the one screenshot holds the empty
 * page; it changes when the page is built up.
 */
describe('ProjectEventsPage (screenshots)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'projects/:slug/events', component: ProjectEventsPage }])],
    });
  });

  it('shows the blank page', async () => {
    const list = await goldenMaster('a project exists', 'listProjects');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/projects/${list.entries[0].project.slug}/events`);
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    // An empty page has no height; a screenshot needs an area, so it gets one of a fixed size.
    element.style.width = '760px';
    element.style.height = '200px';
    await expect.element(page.elementLocator(element)).toMatchScreenshot('blank');
  });
});
