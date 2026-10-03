import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { commands, page } from 'vitest/browser';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { SelectedProject } from '$core/projects/selected-project';
import { ProjectRepositoriesPage } from './project-repositories.page';

/**
 * Screenshots of the Repositories page, answered with qits-projects' recording of "a project with
 * repositories in components": the wrapper on top, `components/billing` and `components/contract`
 * below, and every backup state. The open project is stubbed: the page reads only its id.
 */

const STATE = 'a project with repositories in components';
const ID = '00000000-0000-4000-8000-000000000001';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ProjectRepositoriesPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        {
          provide: SelectedProject,
          useValue: { project: signal({ id: ID, name: 'Contract project', slug: 'contract' }) },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  async function render() {
    // Tall enough for the whole tree: a screenshot shows only what is in the viewport.
    await page.viewport(900, 1200);
    const fixture = TestBed.createComponent(ProjectRepositoriesPage);
    (fixture.nativeElement as HTMLElement).style.width = '900px';
    fixture.detectChanges();
    await settle();
    TestBed.tick();
    return { fixture, request: http.expectOne(`/projects/api/projects/${ID}/repositories`) };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('lays the repositories out like the wrapper, with every backup state', async () => {
    const { fixture, request } = await render();
    request.flush(await commands.goldenMaster(STATE, 'listProjectRepositories'));
    await answered(fixture);
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view.getByRole('heading', { name: 'components/' })).toBeVisible();
    await expect.element(view.getByRole('heading', { name: 'contract/' })).toBeVisible();
    await expect.element(view).toHaveTextContent('Succeeded');
    await expect.element(view).toHaveTextContent('Auth needed');
    await expect.element(view).toHaveTextContent('No twin');
    await expect.element(view).toMatchScreenshot('tree');
  });

  it('shows a card’s clone URL, backup URL and main branch when opened', async () => {
    const { fixture, request } = await render();
    request.flush(await commands.goldenMaster(STATE, 'listProjectRepositories'));
    await answered(fixture);
    await page.getByRole('button', { name: 'Show more' }).first().click();
    // The pointer stays on the button after the click; its hover colour would vary the screenshot.
    await commands.parkPointer();
    await answered(fixture);
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view).toHaveTextContent('https://githost.example.test/git/');
    await expect.element(view).toMatchScreenshot('opened');
  });

  it('marks the page as loading, then as failed to load', async () => {
    const { fixture, request } = await render();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('loading');
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('error');
  });
});
