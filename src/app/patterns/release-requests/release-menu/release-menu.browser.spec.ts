import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { client as systemClient } from '../../../api/system/client.gen';
import { client as ciClient } from '../../../api/ci/client.gen';
import { DomainEvents, EVENT_SOURCE } from '$core/events/domain-events';
import { ProjectReleaseRequests } from '$core/projects/project-release-requests';
import { ReleaseMenu } from './release-menu';
import { goldenMaster } from '../../../../testing/browser/golden-master';

/**
 * Screenshots of the top bar's release menu, its answers qits-projects', qits-system's and
 * qits-ci's golden masters. The open project is the recorded one ("a project exists"): the URL
 * names its slug, and `SelectedProject` finds it in the recorded project list. The menu is drawn as
 * the shell draws it, handed the shell's release requests (`ProjectReleaseRequests`, qits-2146).
 *
 * A request's row is a declared exit (`open-menu-release-request:request`, epic qits-2000), followed
 * once to a stub of the request's page, at the anchor of the check that needs a person.
 */

/** The routed page under the menu; it renders nothing. */
@Component({ selector: 'app-test-page', template: `` })
class TestPage {}

/** The menu as the shell draws it: handed the shell's release requests. */
@Component({
  imports: [ReleaseMenu],
  template: `<app-release-menu [requests]="shared.resource" [state]="shared.state()" />`,
})
class Host {
  protected readonly shared = inject(ProjectReleaseRequests);
}

/** Runs the effects a read starts on, then the generated client's few awaits. */
const settle = () => {
  TestBed.tick();
  return new Promise((resolve) => setTimeout(resolve));
};

describe('ReleaseMenu (screenshots)', () => {
  let http: HttpTestingController;
  let projectId: string;
  let slug: string;

  beforeEach(async () => {
    const recorded = (await goldenMaster('a project exists', 'getProject')).project;
    projectId = recorded.id;
    slug = recorded.slug;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug', component: TestPage },
          { path: 'projects/:slug/release-requests/:requestId', component: TestPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(systemClient),
        provideHeyApiClient(ciClient),
        // No live stream in a screenshot: the real DomainEvents, on a stream that never connects.
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /**
   * The menu at the right of a 400px-wide bar, room below it for the panel; nothing opened. The
   * open project's requests are asked for at once; the returned request is that ask, unanswered.
   */
  async function render() {
    await TestBed.inject(Router).navigateByUrl(`/projects/${slug}`);
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    // The host box takes no room, so the menu sits in the frame as it did on its own.
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'contents';
    const element = host.parentElement!;
    element.style.cssText =
      'display:flex; justify-content:flex-end; width:25rem; height:26rem; padding:0.5rem; align-items:flex-start';
    fixture.detectChanges();
    await settle();
    // In the browser `SelectedProject` reads the project list on its own; answer it as recorded.
    http
      .expectOne('/projects/api/projects')
      .flush(await goldenMaster('a project exists', 'listProjects'));
    await settle();
    fixture.detectChanges();
    await settle();
    const requests = http.expectOne(`/projects/api/projects/${projectId}/release-requests`);
    return { fixture, frame: page.elementLocator(element), requests };
  }

  /**
   * Opens the panel. Opening reads qits-system's targets for the runners and slots line at the top;
   * answered as recorded ("a connected target with leases": one target, connected, with busy
   * slots). It also reads qits-ci's active runs, answered as recorded ("a commit with a run in
   * flight": a run of no request, so no request shows an active run).
   */
  async function open(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    await userEvent.click(page.getByRole('button', { name: 'Release requests' }));
    fixture.detectChanges();
    await settle();
    http
      .expectOne('/system/api/targets')
      .flush(await goldenMaster('a connected target with leases', 'listTargets', 'qits-system'));
    http
      .expectOne('/ci/api/runs/active')
      .flush(await goldenMaster('a commit with a run in flight', 'listActiveRuns', 'qits-ci'));
    await settle();
    fixture.detectChanges();
  }

  async function answered(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('is a closed lightning button with the pending count', async () => {
    const { fixture, frame, requests } = await render();
    requests.flush(
      await goldenMaster('a project with pending release requests', 'listProjectReleaseRequests'),
    );
    await answered(fixture);
    await expect
      .element(page.getByRole('button', { name: 'Release requests' }))
      .toHaveAttribute('aria-expanded', 'false');
    await expect.element(frame).toMatchScreenshot('closed', { kind: 'DATA' });
  });

  it('lists the pending release requests with their lifecycle in a line', async () => {
    const { fixture, frame, requests } = await render();
    requests.flush(
      await goldenMaster('a project with pending release requests', 'listProjectReleaseRequests'),
    );
    await answered(fixture);
    await open(fixture);
    http.expectNone(`/projects/api/projects/${projectId}/release-requests`);
    const panel = page.getByRole('region', { name: 'Pending release requests' });
    expect(panel.getByRole('listitem').elements()).toHaveLength(5);
    // The lifecycle line: phase chips and the quality gates' shield, labelled as the service names
    // each gate; the two needing a person come first, marked, with a red broken shield.
    await expect.element(panel.getByTitle('Test: failed').first()).toBeVisible();
    await expect
      .element(panel.getByRole('img', { name: /CI build: failed/ }).first())
      .toHaveAttribute('data-shield', 'failed');
    await expect
      .element(panel.getByRole('link', { name: /contract-frontend/ }).first())
      .toHaveAttribute('title', 'Look: CI build');
    // The finalized request is not pending, so the menu leaves it out.
    await expect.element(panel).not.toMatchTextContent('contract-service-rr-1');
    // The runners and slots line heads the panel: runners, slots and the shared pool at the left,
    // the types' reservations at the right.
    await expect.element(panel.getByText('runners: 1')).toBeVisible();
    await expect.element(panel.getByText('workspaces:')).toBeVisible();
    await expect.element(panel.getByText('shared:')).toBeVisible();
    await expect.element(frame).toMatchScreenshot('open', { kind: 'DATA' });
  });

  it('open-menu-release-request request: a request opens its page at the check needing a person', async () => {
    const { fixture, requests } = await render();
    requests.flush(
      await goldenMaster('a project with pending release requests', 'listProjectReleaseRequests'),
    );
    await answered(fixture);
    await open(fixture);
    const panel = page.getByRole('region', { name: 'Pending release requests' });
    const link = panel.getByRole('link', { name: /contract-frontend/ }).first();
    const href = link.element().getAttribute('href')!;
    expect(href).toMatch(new RegExp(`^/projects/${slug}/release-requests/[^/#]+#.+`));
    await userEvent.click(link);
    await settle();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe(href);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-menu-release-request:request',
    ]);
    await expect
      .element(page.getByRole('button', { name: 'Release requests' }))
      .toHaveAttribute('aria-expanded', 'false');
  });

  it('says so when nothing is pending', async () => {
    const { fixture, frame, requests } = await render();
    requests.flush(
      await goldenMaster('a project with no release requests', 'listProjectReleaseRequests'),
    );
    await answered(fixture);
    await open(fixture);
    await expect.element(frame).toMatchTextContent('No pending release requests');
    await expect.element(frame).toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('shows the spinner while the requests load', async () => {
    const { fixture, frame, requests } = await render();
    await open(fixture);
    const panel = page.getByRole('region', { name: 'Pending release requests' });
    await expect.element(panel.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(frame).toMatchScreenshot('loading', { kind: 'PENDING' });
    requests.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
  });

  it('shows the error icon when the requests fail', async () => {
    const { fixture, frame, requests } = await render();
    requests.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    await open(fixture);
    // Opening after a failure asks again; that ask fails too.
    http
      .expectOne(`/projects/api/projects/${projectId}/release-requests`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    const panel = page.getByRole('region', { name: 'Pending release requests' });
    await expect.element(panel.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    // The empty note is always rendered and hidden by class; on an error it stays hidden.
    await expect.element(page.getByText('No pending release requests')).not.toBeVisible();
    await expect.element(frame).toMatchScreenshot('error', { kind: 'ERROR' });
  });
});
