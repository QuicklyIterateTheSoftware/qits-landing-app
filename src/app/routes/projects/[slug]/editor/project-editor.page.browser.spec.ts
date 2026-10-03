import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { commands, page } from 'vitest/browser';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { AppOrigins, NAVIGATION_PATH } from '$core/platform/app-origins';
import { ProjectEditorPage } from './project-editor.page';
import { goldenMaster } from '../../../../../testing/browser/golden-master';

/**
 * Screenshots of the Editor page, the frame around qits-workspaces' editor door, at the recorded
 * project's slug (qits-projects' "a project exists"). The workspaces origin comes from qits-edge's
 * recorded navigation ("a published navigation"), read by `AppOrigins` as the app initializer
 * does. The tests build with `environment.development.ts`, so the navigation's own `origin` is the
 * domain an origin must be under. `stubOrigin` answers the workspaces origin with a plain grey
 * page, so the frame never loads a remote page.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ProjectEditorPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/editor', component: ProjectEditorPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /**
   * The page of the recorded project, after the navigation answered with `navigation` (or with a
   * server error), and its frame.
   */
  async function render(navigation: 'recorded' | 'failed') {
    const origins = TestBed.inject(AppOrigins);
    const loaded = origins.load();
    const read = http.expectOne(NAVIGATION_PATH);
    if (navigation === 'recorded') {
      read.flush(await goldenMaster('a published navigation', 'getMainNavigation', 'qits-edge'));
    } else {
      read.flush(null, { status: 500, statusText: 'Server Error' });
    }
    await loaded;
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
      origin: origins.origin('workspaces'),
    };
  }

  it('frames the editor door once the workspaces origin is known', async () => {
    const navigation = await goldenMaster(
      'a published navigation',
      'getMainNavigation',
      'qits-edge',
    );
    const workspaces: string = navigation.applications['qits-workspaces'].origin;
    await commands.stubOrigin(workspaces);
    const { slug, frame, view, origin } = await render('recorded');
    expect(origin).toBe(workspaces);
    // The frame's navigation to the stub runs after the binding set its address.
    await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
    expect(frame.getAttribute('src')).toBe(`${workspaces}/${slug}/editor`);
    await expect.element(view.getByTitle('Editor')).toBeVisible();
    await expect.element(view).toMatchScreenshot('framed');
  });

  it('shows a blank frame while the workspaces origin is not known', async () => {
    const { frame, view } = await render('failed');
    expect(frame.getAttribute('src')).toBe('about:blank');
    await expect.element(view.getByTitle('Editor')).toBeVisible();
    await expect.element(view).toMatchScreenshot('blank');
  });
});
