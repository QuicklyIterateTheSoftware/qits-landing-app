import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { commands, page } from 'vitest/browser';
import { WorkItemPage } from './work-item.page';

/**
 * Screenshots of one work item's page, at the qualified ids qits-projects recorded: the epic of
 * "an epic with features and tasks" (an epic with children) and a ticket of "a project with work
 * in every status". The page is blank for now and calls no backend, so both screenshots hold the
 * empty page; they change when the page is designed.
 */
describe('WorkItemPage (screenshots)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'projects/:slug/work/:id', component: WorkItemPage }])],
    });
  });

  /** The page of the first entity of `archetype` in `state`'s recorded work. */
  async function render(state: string, archetype: 'EPIC' | 'TICKET') {
    const list = await commands.goldenMaster('a project exists', 'listProjects');
    const work = await commands.goldenMaster(state, 'listProjectEntities');
    const entity = work.entities.find((e: { archetype: string }) => e.archetype === archetype);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      `/projects/${list.entries[0].project.slug}/work/${entity.qualifiedId}`,
    );
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    // An empty page has no height; a screenshot needs an area, so it gets one of a fixed size.
    element.style.width = '760px';
    element.style.height = '200px';
    return page.elementLocator(element);
  }

  it('shows an epic with features and tasks', async () => {
    const element = await render('an epic with features and tasks', 'EPIC');
    await expect.element(element).toMatchScreenshot('epic');
  });

  it('shows a ticket', async () => {
    const element = await render('a project with work in every status', 'TICKET');
    await expect.element(element).toMatchScreenshot('ticket');
  });
});
