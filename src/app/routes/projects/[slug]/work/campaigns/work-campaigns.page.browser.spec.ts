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
import type { CampaignReads } from '../../../../../../testing/campaign-reads';
import { shootMembers } from '../../../../../../testing/browser/shoot-members';

/**
 * Screenshots of a project's Campaigns page, answered with qits-projects' golden masters: the
 * project list as recorded, then the work and each campaign's members from one state. "a campaign
 * with work in every phase" has one campaign with members in the board, the backlog and the
 * archive; "a campaign with a done, a verified and an implementing epic" has one campaign whose
 * only epic on the board is the implementing one; "an epic in two campaigns" has two campaigns, the
 * second recorded as a state of its own over the same seed; "a project with no work" has none.
 *
 * Each campaign's description comes from its state's recorded `getWork` of that campaign.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const CAMPAIGN = 'a campaign with work in every phase';
/** Members: a DONE ticket, a DONE epic, a VERIFIED epic, an IMPLEMENTING epic, a REFINED ticket. */
const PAST_THE_BOARD = 'a campaign with a done, a verified and an implementing epic';
const TWO_CAMPAIGNS = 'an epic in two campaigns';
const SECOND_CAMPAIGN = 'the second campaign of an epic in two campaigns';
/** Which state answers each campaign's members, by the campaign's frozen qualified id. */
const BOTH_CAMPAIGNS: CampaignReads = {
  members: { 'contract-00000001-1': TWO_CAMPAIGNS, 'contract-00000001-2': SECOND_CAMPAIGN },
  described: [TWO_CAMPAIGNS, SECOND_CAMPAIGN],
};

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
    const work = http.expectOne(`/projects/api/projects/${project.id}/work`);
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
   * The page with the work and each campaign read answered from `state`, or as `campaigns` says
   * (`openRecordedWork`; a second campaign is recorded as a state of its own).
   */
  async function recorded(state: string, campaigns?: CampaignReads) {
    const { element } = await openRecordedWork(http, 'work', 'campaigns', state, campaigns);
    element.style.width = '760px';
    return page.elementLocator(element);
  }

  it('shows a campaign with its members, in campaign order, each with its status', async () => {
    const element = await recorded(CAMPAIGN, { members: CAMPAIGN, described: [CAMPAIGN] });
    await expect
      .element(element.getByRole('heading', { level: 1 }))
      .toMatchTextContent('Campaigns');
    const title = element.getByRole('link', { name: 'Card campaign' });
    await expect
      .element(title)
      .toHaveAttribute('href', expect.stringMatching(/\/work\/detail\/contract-00000001-1$/));
    await expect.element(element).toMatchTextContent('Seeded work.');
    const text = element.element().textContent ?? '';
    const order = ['Refined epic', 'Refined ticket', 'Reported ticket', 'Done ticket'].map((t) =>
      text.indexOf(t),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await expect.element(element).not.toMatchTextContent('Ticket outside the campaign');
    await expect.element(element.getByRole('link', { name: 'Done ticket' })).toBeVisible();
    await expect.element(element).toMatchTextContent('reported');
    await expect.element(element).toMatchTextContent('done');
    await expect
      .element(element.getByRole('link', { name: 'Reported ticket' }))
      .toHaveAttribute('href', expect.stringMatching(/\/work\/detail\/contract-00000001-4$/));
    // The refined epic is not on the board (it waits to be scheduled), so it has no board of its
    // own: it is drawn as a list item, as the tickets are.
    const root = element.element();
    expect(root.querySelectorAll('app-epic-board')).toHaveLength(0);
    expect(root.querySelectorAll('app-epic-list-item')).toHaveLength(1);
    expect(root.querySelector('app-epic-list-item')?.textContent).toContain('Refined epic');
    expect(root.querySelectorAll('app-ticket-list-item')).toHaveLength(3);
    // Finishing is the Acceptance list's job.
    expect(element.getByRole('button', { name: /^Mark / }).elements()).toHaveLength(0);
    await expect.element(element).toMatchScreenshot('campaign');
  });

  it('shows a done and a verified epic as before, and an implementing one with its board', async () => {
    const element = await recorded(PAST_THE_BOARD, {
      members: PAST_THE_BOARD,
      described: [PAST_THE_BOARD],
    });
    await expect
      .element(element.getByRole('link', { name: 'Campaign in flight' }))
      .toHaveAttribute('href', expect.stringMatching(/\/work\/detail\/contract-00000001-1$/));
    const root = element.element();
    const members = [
      ...root.querySelectorAll('app-ticket-list-item, app-epic-list-item, app-epic-board'),
    ].map((member) => [member.tagName.toLowerCase(), member.textContent ?? '']);
    const titles = [
      'Done ticket',
      'Done epic',
      'Verified epic',
      'Epic with mixed features',
      'Refined ticket',
    ];
    expect(members.map(([tag]) => tag)).toEqual([
      'app-ticket-list-item',
      'app-epic-list-item',
      'app-epic-list-item',
      'app-epic-board',
      'app-ticket-list-item',
    ]);
    members.forEach(([, text], i) => expect(text).toContain(titles[i]));
    // Only the implementing epic is on the board: its features are its rows.
    const board = root.querySelector('app-epic-board')!;
    expect(board.querySelectorAll('ui-board-row')).toHaveLength(4);

    // Each lane's id is whole inside its strip, however short the lane.
    for (const id of root.querySelectorAll('app-epic-list-item a[lane-gutter]')) {
      const strip = id.parentElement!.parentElement!.getBoundingClientRect();
      const box = id.getBoundingClientRect();
      expect(box.height).toBeGreaterThan(0);
      expect(box.top).toBeGreaterThanOrEqual(strip.top);
      expect(box.bottom).toBeLessThanOrEqual(strip.bottom);
    }
    // Taller than the viewport, so shot in parts: the campaign's header, then each member.
    await expect
      .element(page.elementLocator(root.querySelector('app-campaign-section header')!))
      .toMatchScreenshot('done-verified-implementing-header');
    await shootMembers(root.querySelector('app-work-list')!, 'done-verified-implementing');
  });

  it('shows each campaign, in the board’s order', async () => {
    const element = await recorded(TWO_CAMPAIGNS, BOTH_CAMPAIGNS);
    const headings = element
      .getByRole('heading', { level: 2 })
      .elements()
      .map((h) => h.textContent?.trim());
    expect(headings).toEqual(['First campaign', 'Second campaign']);
    await expect.element(element).toMatchScreenshot('two-campaigns');
  });

  it('says so when the project has no campaigns', async () => {
    const { element, work, answered } = await shown();
    work.flush(await goldenMaster('a project with no work', 'listProjectWork'));
    await answered();
    await expect.element(element).toMatchTextContent('No campaigns');
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
