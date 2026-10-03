import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { commands, page } from 'vitest/browser';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { ProjectEditorPage } from './project-editor.page';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import { provideTestPlatformOrigins } from '../../../../../testing/platform-origins';

/**
 * Screenshots of the Editor page, the frame around qits-workspaces' editor door, at the recorded
 * project's slug (qits-projects' "a project exists"). The workspaces page origin is configuration
 * (`provideTestPlatformOrigins`). `stubOrigin` answers it with a plain grey page, so the frame never
 * loads a remote page.
 */

/** The workspaces page origin the specs configure. */
const WORKSPACES = 'https://workspaces.qits.example';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ProjectEditorPage (screenshots)', () => {
  let http: HttpTestingController;

  function setUp(workspaces: string) {
    TestBed.configureTestingModule({
      providers: [
        provideTestPlatformOrigins({}, { workspaces }),
        provideRouter([{ path: 'projects/:slug/editor', component: ProjectEditorPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => http.verify());

  /** The page of the recorded project, with `workspaces` as the workspaces page origin, and its frame. */
  async function render(workspaces: string) {
    setUp(workspaces);
    const list = await goldenMaster('a project exists', 'listProjects');
    const slug: string = list.entries[0].project.slug;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${slug}/editor`);
    await settle();
    // SelectedProject reads the list; the page reads only the slug from the URL.
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    harness.fixture.detectChanges();
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '760px';
    const frame = element.querySelector('iframe')!;
    return {
      slug,
      frame,
      view: page.elementLocator(element),
    };
  }

  it('frames the editor door once the workspaces origin is known', async () => {
    await commands.stubOrigin(WORKSPACES);
    const { slug, frame, view } = await render(WORKSPACES);
    // The frame's navigation to the stub runs after the binding set its address.
    await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
    expect(frame.getAttribute('src')).toBe(`${WORKSPACES}/${slug}/editor`);
    await expect.element(view.getByTitle('Editor')).toBeVisible();
    await expect.element(view).toMatchScreenshot('framed');
  });

  it('shows a blank frame while the workspaces origin is not known', async () => {
    const { frame, view } = await render('');
    expect(frame.getAttribute('src')).toBe('about:blank');
    await expect.element(view.getByTitle('Editor')).toBeVisible();
    await expect.element(view).toMatchScreenshot('blank');
  });
});
