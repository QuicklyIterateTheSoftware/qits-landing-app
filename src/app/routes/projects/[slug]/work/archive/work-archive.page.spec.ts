import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { goldenMaster } from '../../../../../../testing/golden-masters';
import { WorkArchivePage } from './work-archive.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const STATE = 'a project with work in every status';

/** The Archive: the finished work (DONE, DROPPED), and nothing else (epic qits-1899: no campaigns). */
describe('WorkArchivePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/archive', component: WorkArchivePage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page, with the project list and the work answered from the state. */
  async function shown() {
    const list = goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/archive`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    http
      .expectOne(`/projects/api/projects/${project.id}/work`)
      .flush(goldenMaster(STATE, 'listProjectWork'));
    await settle();
    await harness.fixture.whenStable();
    return harness.routeNativeElement as HTMLElement;
  }

  it('lists the done and dropped work, and reads nothing else', async () => {
    const text = (await shown()).textContent ?? '';
    for (const title of ['Done epic', 'Done ticket', 'Dropped epic', 'Dropped ticket']) {
      expect(text).toContain(title);
    }
    expect(text).not.toContain('Verified ticket');
    expect(text).not.toContain('Campaigns');
  });
});
