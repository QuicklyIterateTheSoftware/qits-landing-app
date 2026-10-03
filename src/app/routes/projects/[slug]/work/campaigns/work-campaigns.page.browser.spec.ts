import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { WorkCampaignsPage } from './work-campaigns.page';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRecordedWork } from '../../../../../../testing/browser/recorded-work';

/**
 * Screenshots of a project's Campaigns page, answered with qits-projects' golden masters: the
 * project list as recorded, then the work and each campaign's members from one state. "a campaign
 * with work in every phase" has one campaign with members in the board, the backlog and the
 * archive; "an epic in two campaigns" has two campaigns, the second recorded as a state of its own
 * over the same seed; "a project with no work" has none.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const CAMPAIGN = 'a campaign with work in every phase';
const TWO_CAMPAIGNS = 'an epic in two campaigns';
const SECOND_CAMPAIGN = 'the second campaign of an epic in two campaigns';

describe('WorkCampaignsPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/campaigns', component: WorkCampaignsPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page of the recorded project, with the list answered and its work requested. */
  async function shown() {
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/campaigns`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    // SelectedWork's effect asks for the work once the project is known; let it run.
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    const work = http.expectOne(`/projects/api/projects/${project.id}/entities`);
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '760px';
    const answered = async () => {
      await settle();
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    };
    return { element: page.elementLocator(element), work, answered };
  }

  /**
   * The page with the work and each campaign read answered from `state` (`openRecordedWork`; a
   * second campaign is recorded as a state of its own, so it is in `campaignStates`).
   */
  async function recorded(state: string, campaignStates?: readonly string[]) {
    const { element } = await openRecordedWork(http, 'work', 'campaigns', state, campaignStates);
    element.style.width = '760px';
    return page.elementLocator(element);
  }

  it('shows a campaign with its members, in campaign order, each with its status', async () => {
    const element = await recorded(CAMPAIGN);
    await expect.element(element.getByRole('heading', { level: 1 })).toHaveTextContent('Campaigns');
    const title = element.getByRole('link', { name: 'Card campaign' });
    await expect
      .element(title)
      .toHaveAttribute('href', expect.stringMatching(/\/work\/detail\/contract-00000001-1$/));
    await expect.element(element).toHaveTextContent('Seeded work.');
    const text = element.element().textContent ?? '';
    const order = ['Refined epic', 'Refined ticket', 'Reported ticket', 'Done ticket'].map((t) =>
      text.indexOf(t),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await expect.element(element).not.toHaveTextContent('Ticket outside the campaign');
    await expect.element(element.getByRole('link', { name: 'Done ticket' })).toBeVisible();
    await expect.element(element).toHaveTextContent('reported');
    await expect.element(element).toHaveTextContent('done');
    await expect
      .element(element.getByRole('link', { name: 'Reported ticket' }))
      .toHaveAttribute('href', expect.stringMatching(/\/work\/detail\/contract-00000001-4$/));
    // Finishing is the Acceptance list's job.
    expect(element.getByRole('button', { name: /^Mark / }).elements()).toHaveLength(0);
    await expect.element(element).toMatchScreenshot('campaign');
  });

  it('shows each campaign, in the board’s order', async () => {
    const element = await recorded(TWO_CAMPAIGNS, [TWO_CAMPAIGNS, SECOND_CAMPAIGN]);
    const headings = element
      .getByRole('heading', { level: 2 })
      .elements()
      .map((h) => h.textContent?.trim());
    expect(headings).toEqual(['First campaign', 'Second campaign']);
    await expect.element(element).toMatchScreenshot('two-campaigns');
  });

  it('says so when the project has no campaigns', async () => {
    const { element, work, answered } = await shown();
    work.flush(await goldenMaster('a project with no work', 'listProjectEntities'));
    await answered();
    await expect.element(element).toHaveTextContent('No campaigns');
    await expect.element(element).toMatchScreenshot('empty');
  });

  it('shows that the work is loading', async () => {
    const { element, work } = await shown();
    await expect.element(element.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(element).toMatchScreenshot('loading');
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
  });
});
