import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../testing/browser/app-route';

/**
 * Screenshots of the Desk page inside the shell (`openRoute`). The open project is the recorded
 * one ("a project exists"), found by the URL's slug in the recorded project list, the same as the
 * other project pages' specs.
 *
 * `listDeskTriggerMessages` itself is answered from qits-projects' golden master only where the
 * test below is skipped and says why: `@qits/projects-golden-masters` does not carry the provider
 * state yet (see `desk-triggers.store.pact.spec.ts`), and the guard refuses a hand-made 2xx body.
 */

describe('ProjectDeskPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  async function render() {
    // Tall enough for every row: a screenshot shows only what is in the viewport.
    await page.viewport(1140, 1000);
    const opened = await openRoute((project) => `/projects/${project.slug}/desk`);
    http
      .expectOne(`/projects/api/projects/${opened.project.id}/work`)
      .flush(await goldenMaster('a project with no work', 'listProjectWork'));
    return {
      opened,
      request: http.expectOne(`/projects/api/projects/${opened.project.id}/desk-triggers`),
    };
  }

  // Skipped: qits-projects-service's provider state "a project whose desk received a trigger
  // message" is committed on its own `epic/qits-1604` branch
  // (`golden-masters/a-project-whose-desk-received-a-trigger-message/listDeskTriggerMessages.json`)
  // but has not reached a release yet, so `@qits/projects-golden-masters` does not carry it and the
  // guard refuses a hand-made 2xx body. Once a release publishes it, replace the flush below with
  // `await goldenMaster('a project whose desk received a trigger message', 'listDeskTriggerMessages')`
  // and unskip — see `desk-triggers.store.pact.spec.ts` for the same hold.
  it.skip('lists a message with its badge, times, and each line’s source, item and cause', async () => {
    const { opened, request } = await render();
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
            'You are the delivery desk of project contract-00000001. Run `qits help guide` and follow your brief. Its guide-hash is 0000000000000000: re-read the guide only when that differs from the hash you last read. Then act on what happened below.',
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
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('delivered');
    await expect.element(view).toMatchTextContent('contract-00000001-1580');
    await expect.element(view).toMatchTextContent('contract-service-rr-7');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('loaded');
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const { opened, request } = await render();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('loading');
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('This project’s desk trigger messages could not be read.');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('error');
  });
});
