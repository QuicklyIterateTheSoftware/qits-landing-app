import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { goldenMaster } from '../../../../../../testing/golden-masters';
import { WorkArchivePage } from './work-archive.page';
import { WorkCampaignsPage } from '../campaigns/work-campaigns.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const CAMPAIGN = 'a campaign with work in every phase';

/**
 * Where a campaign in a final state shows: in the Archive, below the archived work, and not on the
 * Campaigns page. No recorded state holds such a campaign yet, so the work is "a campaign with
 * work in every phase" with its campaign's status replaced (`withCampaign`).
 */
describe('WorkArchivePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/work/archive', component: WorkArchivePage },
          { path: 'projects/:slug/work/campaigns', component: WorkCampaignsPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The recorded work, its campaign at `status`. */
  function withCampaign(status: string) {
    const work = goldenMaster(CAMPAIGN, 'listProjectEntities');
    return {
      ...work,
      entities: work.entities.map((e: { archetype: string }) =>
        e.archetype === 'CAMPAIGN' ? { ...e, status } : e,
      ),
    };
  }

  /** The page at `tab`, with the project list, the work and the campaign's read answered. */
  async function shown(tab: string, status: string) {
    const list = goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/${tab}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    http.expectOne(`/projects/api/projects/${project.id}/entities`).flush(withCampaign(status));
    await settle();
    http
      .expectOne((r) => r.url.startsWith('/projects/api/campaigns/'))
      .flush(goldenMaster(CAMPAIGN, 'getCampaign'));
    await settle();
    await harness.fixture.whenStable();
    return harness.routeNativeElement as HTMLElement;
  }

  /** The archived campaigns' section. */
  const campaigns = (element: HTMLElement) =>
    element.querySelector<HTMLElement>('section[aria-label="Archived campaigns"]')!;

  it.each(['DROPPED', 'DONE'])('shows a %s campaign below the archived work', async (status) => {
    const element = await shown('archive', status);
    const section = campaigns(element);
    expect(section.className).not.toContain('hidden');
    expect(section.querySelector('h2')?.textContent?.trim()).toBe('Campaigns');
    const title = section.querySelector('[role=heading][aria-level="3"] a');
    expect(title?.textContent?.trim()).toBe('Card campaign');
    expect(title?.getAttribute('href')).toMatch(/\/work\/detail\/contract-00000001-1$/);
    expect(section.textContent).toContain(status.toLowerCase());
    expect(section.textContent).toContain('Seeded work.');
    // Its members, in campaign order, as on the Campaigns page.
    const text = section.textContent ?? '';
    const order = ['Refined epic', 'Refined ticket', 'Reported ticket', 'Done ticket'].map((t) =>
      text.indexOf(t),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The archived work comes first: the done ticket.
    const list = element.querySelector('app-work-list')!;
    expect(list.className).not.toContain('hidden');
    expect(list.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves out an open campaign', async () => {
    const element = await shown('archive', 'REFINED');
    expect(campaigns(element).className).toContain('hidden');
    expect(element.querySelector('[role=heading]')).toBeNull();
  });

  it('leaves a dropped campaign off the Campaigns page', async () => {
    const element = await shown('campaigns', 'DROPPED');
    expect(element.textContent).not.toContain('Card campaign');
    expect(element.textContent).toContain('No campaigns');
  });
});
