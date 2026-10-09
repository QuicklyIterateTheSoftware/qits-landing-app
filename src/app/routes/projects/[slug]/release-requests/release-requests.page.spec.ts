import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { goldenMaster } from '../../../../../testing/golden-masters';
import { ReleaseRequestsPage } from './release-requests.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The empty note: always rendered, hidden by class while there are requests. */
const empty = (element: HTMLElement) =>
  Array.from(element.querySelectorAll('p')).find((p) => p.textContent?.includes('Nothing is open'));

describe('ReleaseRequestsPage', () => {
  let http: HttpTestingController;
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/release-requests', component: ReleaseRequestsPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page of the recorded project; its request list asked for and returned unanswered. */
  async function render() {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/release-requests`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    harness.fixture.detectChanges();
    await settle();
    TestBed.tick();
    await settle();
    const request = http.expectOne(`/projects/api/projects/${project.id}/release-requests`);
    const answered = async () => {
      await settle();
      harness.fixture.detectChanges();
    };
    return { element: harness.routeNativeElement as HTMLElement, request, answered };
  }

  it('lists every request, finalized ones too, each linking to its own page', async () => {
    const { element, request, answered } = await render();
    request.flush(
      goldenMaster('a project with pending release requests', 'listProjectReleaseRequests'),
    );
    await answered();
    const rows = element.querySelectorAll('li');
    expect(rows).toHaveLength(6);
    const first = rows[0];
    expect(first.textContent).toContain('contract-service');
    expect(first.textContent).toContain('Waiting on its gates');
    expect(first.textContent).toContain('2026-01-01 00:00 UTC');
    expect(first.textContent).toContain('CI · PENDING');
    expect(first.querySelector('a')?.getAttribute('href')).toBe(
      `/projects/${project.slug}/release-requests/00000000-0000-4000-8000-000000000002`,
    );
    expect(rows[5].textContent).toContain('finalized');
    expect(rows[5].textContent).toContain('2026.101.100001');
    // The CONFLICTED request carries the service's detail; the others hide the line.
    expect(rows[4].querySelector('p')?.classList.contains('hidden')).toBe(false);
    expect(rows[0].querySelector('p')?.classList.contains('hidden')).toBe(true);
    expect(empty(element)?.classList.contains('hidden')).toBe(true);
  });

  it('says so when the project has no release requests', async () => {
    const { element, request, answered } = await render();
    request.flush(goldenMaster('a project with no release requests', 'listProjectReleaseRequests'));
    await answered();
    expect(element.querySelectorAll('li')).toHaveLength(0);
    expect(empty(element)?.classList.contains('hidden')).toBe(false);
  });
});
