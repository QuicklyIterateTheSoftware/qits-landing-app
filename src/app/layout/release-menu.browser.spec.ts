import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { commands, page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../api/projects/client.gen';
import { provideHeyApiClient } from '../api/projects/client/client.gen';
import { SelectedProject } from '../projects/selected-project';
import { ReleaseMenu } from './release-menu';

/**
 * Screenshots of the top bar's release menu, its answers qits-projects' golden masters. The open
 * project is the recorded one, handed in through a stand-in for `SelectedProject`.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ReleaseMenu (screenshots)', () => {
  let http: HttpTestingController;
  let projectId: string;

  beforeEach(async () => {
    const recorded = (await commands.goldenMaster('a project exists', 'getProject')).project;
    projectId = recorded.id;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        {
          provide: SelectedProject,
          useValue: {
            project: signal(recorded),
            slug: signal(recorded.slug),
            url: signal(`/projects/${recorded.slug}`),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The menu at the right of a 400px-wide bar, room below it for the panel; nothing opened. */
  async function render() {
    const fixture = TestBed.createComponent(ReleaseMenu);
    const element = fixture.nativeElement as HTMLElement;
    element.parentElement!.style.cssText =
      'display:flex; width:25rem; height:26rem; padding:0.5rem; align-items:flex-start';
    fixture.detectChanges();
    await settle();
    // In the browser the store loads the project list on its own; answer it as recorded.
    http
      .expectOne('/projects/api/projects')
      .flush(await commands.goldenMaster('a project exists', 'listProjects'));
    await settle();
    return { fixture, frame: page.elementLocator(element.parentElement!) };
  }

  async function opened(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    await userEvent.click(page.getByRole('button', { name: 'Release requests' }));
    fixture.detectChanges();
    await settle();
    return http.expectOne(`/projects/api/projects/${projectId}/release-requests`);
  }

  async function answered(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('is a closed lightning button, and asks for nothing yet', async () => {
    const { frame } = await render();
    http.expectNone(`/projects/api/projects/${projectId}/release-requests`);
    await expect
      .element(page.getByRole('button', { name: 'Release requests' }))
      .toHaveAttribute('aria-expanded', 'false');
    await expect.element(frame).toMatchScreenshot('closed');
  });

  it('lists the pending release requests with their gates', async () => {
    const { fixture, frame } = await render();
    (await opened(fixture)).flush(
      await commands.goldenMaster(
        'a project with pending release requests',
        'listProjectReleaseRequests',
      ),
    );
    await answered(fixture);
    const panel = page.getByRole('region', { name: 'Pending release requests' });
    expect(panel.getByRole('listitem').elements()).toHaveLength(5);
    await expect.element(panel).toHaveTextContent('CI · FAILED');
    await expect.element(panel).not.toHaveTextContent('Finalized release');
    await expect.element(frame).toMatchScreenshot('open');
  });

  it('says so when nothing is pending', async () => {
    const { fixture, frame } = await render();
    (await opened(fixture)).flush(
      await commands.goldenMaster(
        'a project with no release requests',
        'listProjectReleaseRequests',
      ),
    );
    await answered(fixture);
    await expect.element(frame).toHaveTextContent('No pending release requests');
    await expect.element(frame).toMatchScreenshot('empty');
  });

  it('shows the spinner while the requests load', async () => {
    const { fixture, frame } = await render();
    const request = await opened(fixture);
    const panel = page.getByRole('region', { name: 'Pending release requests' });
    await expect.element(panel.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(frame).toMatchScreenshot('loading');
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
  });

  it('shows the error icon when the requests fail', async () => {
    const { fixture, frame } = await render();
    (await opened(fixture)).flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    const panel = page.getByRole('region', { name: 'Pending release requests' });
    await expect.element(panel.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    // The empty note is always rendered and hidden by class; on an error it stays hidden.
    await expect.element(page.getByText('No pending release requests')).not.toBeVisible();
    await expect.element(frame).toMatchScreenshot('error');
  });
});
