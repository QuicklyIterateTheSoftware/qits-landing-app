import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { ProjectDeskPage } from './project-desk.page';
import { goldenMaster } from '../../../../../testing/browser/golden-master';

/**
 * Screenshots of the Desk page. The open project is the recorded one ("a project exists"), found
 * by the URL's slug in the recorded project list, the same as the other project pages' specs.
 *
 * `listDeskTriggerMessages` itself is answered from qits-projects' golden master only where the
 * test below is skipped and says why: `@qits/projects-golden-masters` does not carry the provider
 * state yet (see `desk-triggers.store.pact.spec.ts`), and the guard refuses a hand-made 2xx body.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ProjectDeskPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/desk', component: ProjectDeskPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
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
    // Tall enough for every row: a screenshot shows only what is in the viewport.
    await page.viewport(900, 1000);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/desk`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    harness.fixture.detectChanges();
    await settle();
    TestBed.tick();
    await settle();
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return {
      fixture: harness.fixture,
      element,
      request: http.expectOne(`/projects/api/projects/${project.id}/desk-triggers`),
    };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // Skipped: qits-projects-service's provider state "a project whose desk received a trigger
  // message" is committed on its own `epic/qits-1604` branch
  // (`golden-masters/a-project-whose-desk-received-a-trigger-message/listDeskTriggerMessages.json`)
  // but has not reached a release yet, so `@qits/projects-golden-masters` does not carry it and the
  // guard refuses a hand-made 2xx body. Once a release publishes it, replace the flush below with
  // `await goldenMaster('a project whose desk received a trigger message', 'listDeskTriggerMessages')`
  // and unskip — see `desk-triggers.store.pact.spec.ts` for the same hold.
  it.skip('lists a message with its badge, times, and each line’s source, item and cause', async () => {
    const { fixture, element, request } = await render();
    const body = {
      messages: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          state: 'DELIVERED',
          openedAt: '2026-01-01T00:00:00Z',
          closesAt: '2026-01-01T00:00:00Z',
          closedAt: '2026-01-01T00:00:00Z',
          acceptedAt: '2026-01-01T00:00:00Z',
          attempts: 1,
          lastStatus: 200,
          lastDetail: null,
          commandId: 'desk-command-1',
          queuePosition: null,
          message:
            'You are the delivery desk of project contract-00000001. Read /tmp/qits-delivery-brief.md and follow it, then act on what happened below.',
          events: [
            {
              source: 'work-verified',
              itemRef: 'contract-00000001-1580',
              itemId: '00000000-0000-4000-8000-000000000003',
              label: 'Desk triggers read door',
              cause: 'tok-workspace-agent-contract',
              eventId: '00000000-0000-4000-8000-000000000004',
              occurredAt: '2026-01-01T00:00:00Z',
            },
            {
              source: 'approval-needed',
              itemRef: 'contract-service-rr-7',
              itemId: '00000000-0000-4000-8000-000000000005',
              label: 'Release qits-1580; waits on manual-review: a person approves',
              cause: 'fold 5eed5eed',
              eventId: '00000000-0000-4000-8000-000000000006',
              occurredAt: '2026-01-01T00:00:00Z',
            },
          ],
        },
      ],
    };
    // eslint-disable-next-line qits/browser-spec-data-from-golden-masters -- waits for qits-projects-service's release of "a project whose desk received a trigger message"
    request.flush(body);
    await answered(fixture);
    const view = page.elementLocator(element);
    await expect.element(view).toMatchTextContent('delivered');
    await expect.element(view).toMatchTextContent('contract-00000001-1580');
    await expect.element(view).toMatchTextContent('contract-service-rr-7');
    await expect.element(view).toMatchScreenshot('loaded');
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const { fixture, element, request } = await render();
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('loading');
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('This project’s desk trigger messages could not be read.');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('error');
  });
});
