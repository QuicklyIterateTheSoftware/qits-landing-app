import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { WorkItemPage } from './work-item.page';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { openRecordedWork } from '../../../../../../../testing/browser/recorded-work';

/**
 * Screenshots of one work item's page and its actions, answered with qits-projects' golden masters:
 * the project list as recorded, the work of "a project with work in every status" (one epic and
 * one ticket per status), "an epic with features and tasks" or "a campaign with work in every
 * phase" (with the campaign's read), and the archetype registry. Those states record no item reads
 * (`getEntity`, comments, dossier): they answer 404, so the body shows the children only. The page
 * follows transitions through the event stream; the stream here never connects.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('WorkItemPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/detail/:id', component: WorkItemPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /**
   * Answers the item's own reads (`WorkDetailStore`): from `state`'s recordings when `recorded`,
   * else with 404 (an error answer is a status only): the body then shows its children only.
   */
  async function answerDetail(state: string, ref: string, recorded: boolean) {
    const item = http.expectOne(`/projects/api/entities/${ref}`);
    const thread = http.expectOne(`/projects/api/entities/${ref}/comments`);
    if (!recorded) {
      item.flush(null, { status: 404, statusText: 'Not Found' });
      thread.flush(null, { status: 404, statusText: 'Not Found' });
      return;
    }
    const entity = await goldenMaster(state, 'getEntity');
    item.flush(entity);
    thread.flush(await goldenMaster(state, 'listEntityComments'));
    await settle();
    if (entity.archetype === 'EPIC') {
      http
        .expectOne(`/projects/api/epics/${entity.id}/dossier`)
        .flush(await goldenMaster(state, 'listEpicDossierPages'));
      http
        .expectOne(`/projects/api/epics/${entity.id}/dossier-assets`)
        .flush(await goldenMaster(state, 'listEpicDossierAssets'));
    }
    if (entity.archetype === 'TICKET') {
      http
        .expectOne(`/projects/api/tickets/${entity.id}/dossier`)
        .flush(await goldenMaster(state, 'listTicketDossierPages'));
    }
  }

  /**
   * The page of the entity titled `title` in `state`'s recorded work, every request answered from
   * a recording (`openRecordedWork`: a campaign's read too, from `campaignStates`), the item's own
   * reads from `state` when `detail` (`answerDetail`).
   */
  async function render(
    state: string,
    title: string,
    detail = false,
    campaignStates: readonly string[] = [state],
  ) {
    const work = await goldenMaster(state, 'listProjectEntities');
    const entity = work.entities.find((e: { title: string }) => e.title === title);
    const { element, harness } = await openRecordedWork(
      http,
      'work/detail',
      entity.qualifiedId,
      state,
      campaignStates,
    );
    // The page's actions come from the archetype registry.
    http
      .expectOne('/projects/api/entities/archetypes')
      .flush(await goldenMaster('the archetype registry', 'listArchetypes'));
    await answerDetail(state, entity.qualifiedId, detail);
    await settle();
    await settle();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    element.style.width = '760px';
    return page.elementLocator(element);
  }

  it('shows every group for a reported ticket', async () => {
    const element = await render('a project with work in every status', 'Reported ticket');
    await expect
      .element(element.getByRole('heading', { level: 1 }))
      .toHaveTextContent('Reported ticket');
    await expect.element(element.getByRole('group', { name: 'Agent' })).toBeVisible();
    await expect
      .element(element.getByRole('group', { name: 'Status' }))
      .toHaveTextContent('Mark refined');
    await expect.element(element.getByRole('group', { name: 'Plan' })).toHaveTextContent('Refine');
    await expect.element(element).toMatchScreenshot('reported-ticket');
  });

  it('drops the plan once an epic is implementing', async () => {
    const element = await render('a project with work in every status', 'Implementing epic');
    await expect.element(element.getByRole('group', { name: 'Agent' })).toBeVisible();
    await expect
      .element(element.getByRole('group', { name: 'Status' }))
      .not.toHaveTextContent('Mark refined');
    expect(element.getByRole('group', { name: 'Plan' }).elements()).toHaveLength(0);
    await expect.element(element).toMatchScreenshot('implementing-epic');
  });

  it('offers only its moves for a verified ticket', async () => {
    const element = await render('a project with work in every status', 'Verified ticket');
    await expect
      .element(element.getByRole('group', { name: 'Status' }))
      .toHaveTextContent('Status Mark done Back to verifying Drop');
    expect(element.getByRole('group').elements()).toHaveLength(1);
    await expect.element(element).toMatchScreenshot('verified-ticket');
  });

  it('offers nothing for done work', async () => {
    const element = await render('a project with work in every status', 'Done epic');
    expect(element.getByRole('button').elements()).toHaveLength(0);
    await expect.element(element).toMatchScreenshot('done-epic');
  });

  it('offers its own moves, Edit and Reshape for a refined feature', async () => {
    const element = await render('an epic with features and tasks', 'Open feature');
    await expect
      .element(element.getByRole('group', { name: 'Status' }))
      .toHaveTextContent('Mark implementing');
    expect(element.getByRole('group', { name: 'Agent' }).elements()).toHaveLength(0);
    const buttons = element.getByRole('group', { name: 'Plan' }).getByRole('button');
    expect(buttons.elements().map((b) => b.textContent?.trim())).toEqual(['Edit', 'Reshape']);
    await expect.element(element).toMatchScreenshot('feature');
  });

  it('shows a campaign’s members, and offers its start', async () => {
    const element = await render('a campaign with work in every phase', 'Card campaign');
    await expect
      .element(element.getByRole('group', { name: 'Agent' }))
      .toHaveTextContent('Start campaign');
    const members = element.getByRole('region', { name: 'Members' });
    await expect.element(members.getByRole('link', { name: 'Done ticket' })).toBeVisible();
    await expect.element(members).not.toHaveTextContent('Ticket outside the campaign');
    await expect.element(element).toMatchScreenshot('campaign');
  });

  it('shows an epic’s features with their tasks', async () => {
    const element = await render('an epic with features and tasks', 'Nested epic');
    const features = element.getByRole('region', { name: 'Features' });
    await expect.element(features.getByRole('link', { name: 'Open feature' })).toBeVisible();
    await expect.element(features.getByRole('link', { name: 'Open task' })).toBeVisible();
    await expect.element(element).toMatchScreenshot('epic-with-features');
  });

  it('shows a feature’s tasks', async () => {
    const element = await render('an epic with features and tasks', 'Shipped feature');
    const tasks = element.getByRole('region', { name: 'Tasks' });
    await expect.element(tasks.getByRole('link', { name: 'Second shipped task' })).toBeVisible();
    await expect.element(tasks).not.toHaveTextContent('Open task');
    await expect.element(element).toMatchScreenshot('feature-with-tasks');
  });
});
