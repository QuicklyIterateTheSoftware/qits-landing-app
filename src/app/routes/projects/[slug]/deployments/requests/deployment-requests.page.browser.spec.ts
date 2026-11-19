import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';
import { leftFor } from '../../../../../../testing/browser/contracts-bundles';
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';
import { provideTestPlatformOrigins } from '../../../../../../testing/platform-origins';

/**
 * Screenshots of the Deployments section's Requests page inside the shell (`openRoute`), at the
 * recorded project's slug (qits-projects' "a project exists", whose frozen id is the one
 * qits-deployments' project states read by).
 *
 * `listDeploymentRequests?projectId=` is answered from qits-deployments' golden masters: "a project
 * with deployment requests" (a request held for approval, pending, and one deployed ACTIVE through
 * a met gate at priority HIGH, completed) and "a project with no deployment requests" (none). A
 * refusal is a 403 with no body, as the service answers a credential without a deployments role.
 * Each row's Open leads to the request's own page in this app (qits-2322).
 */
describe('DeploymentRequestsPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        provideTestPlatformOrigins({}, { idp: 'https://idp.qits.example.test' }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  const WITH_REQUESTS = 'a project with deployment requests';
  const WITHOUT_REQUESTS = 'a project with no deployment requests';
  const LIST = '/deployments/api/deployment-requests';

  /** The open requests reads. */
  const listReads = (): TestRequest[] =>
    http
      .match((request) => request.url.split('?')[0] === LIST)
      .filter((request) => !request.cancelled);

  /** A query parameter of `read`: the client writes the query into the URL. */
  const param = (read: TestRequest | undefined, name: string) =>
    read ? new URL(read.request.urlWithParams, 'http://x').searchParams.get(name) : undefined;

  /** Opens the page, wide and tall enough for both tables (a screenshot shows the viewport only). */
  async function render() {
    await page.viewport(1140, 900);
    const opened = await openRoute((project) => `/projects/${project.slug}/deployments/requests`);
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** The page with `state`'s requests answered, read by the open project's id. */
  async function answered(state: string) {
    const rendered = await render();
    const [read] = listReads();
    expect(param(read, 'projectId')).toBe(rendered.opened.project.id);
    read?.flush(await goldenMaster(state, 'listDeploymentRequests', 'qits-deployments'));
    await rendered.opened.settled();
    return rendered;
  }

  it('splits the requests into pending and completed, each row with its gate and deployment', async () => {
    const { opened, view } = await answered(WITH_REQUESTS);
    const recorded = (
      await goldenMaster(WITH_REQUESTS, 'listDeploymentRequests', 'qits-deployments')
    ).deploymentRequests as { id: string; applicationName: string }[];
    const pending = view.getByRole('region', { name: 'Pending' });
    const completed = view.getByRole('region', { name: 'Completed' });
    await expect.element(pending).toMatchTextContent(recorded[0].applicationName);
    await expect.element(pending).toMatchTextContent('Held for approval');
    await expect.element(pending).toMatchTextContent('nothing queued yet');
    await expect.element(completed).toMatchTextContent('The last 10, newest first.');
    await expect.element(completed).toMatchTextContent(recorded[1].applicationName);
    await expect.element(completed).toMatchTextContent('High');
    await expect.element(completed).toMatchTextContent('Gate met');
    await expect.element(completed).toMatchTextContent('Active');
    await expect.element(completed).toMatchTextContent('1 Jan 00:00');
    await expect
      .element(completed.getByRole('link', { name: 'Open' }))
      .toHaveAttribute(
        'href',
        `/projects/${opened.project.slug}/deployments/requests/${recorded[1].id}`,
      );
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('reads the requests again on Refresh', async () => {
    const { opened, view } = await answered(WITH_REQUESTS);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    const [again] = listReads();
    expect(param(again, 'projectId')).toBe(opened.project.id);
    again?.flush(await goldenMaster(WITH_REQUESTS, 'listDeploymentRequests', 'qits-deployments'));
    await opened.settled();
  });

  it('opens the section’s address on the Requests page', async () => {
    const opened = await openRoute((project) => `/projects/${project.slug}/deployments`);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/deployments/requests`,
    );
    listReads()[0]?.flush(
      await goldenMaster(WITHOUT_REQUESTS, 'listDeploymentRequests', 'qits-deployments'),
    );
    await opened.settled();
  });

  it('says once that there are none when the project has no deployment requests', async () => {
    const { opened, view } = await answered(WITHOUT_REQUESTS);
    await expect.element(view).toMatchTextContent('No deployment requests yet');
    await expect.element(view.getByRole('region', { name: 'Pending' })).not.toBeInTheDocument();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says who may read deployment requests', async () => {
    const { opened, view } = await render();
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    listReads()[0]?.flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent(
        'Reading deployment requests needs qits:admin, qits:admin-agent, qits:desk-admin, qits:desk, qits:agent or qits:system.',
      );
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('offers Retry when the read fails, and reads again', async () => {
    const { opened, view } = await render();
    listReads()[0]?.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('The project’s deployment requests could not be read.');
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    listReads()[0]?.flush(
      await goldenMaster(WITH_REQUESTS, 'listDeploymentRequests', 'qits-deployments'),
    );
    await opened.settled();
    await expect.element(view.getByRole('region', { name: 'Pending' })).toBeVisible();
  });

  it('open-deployment-request request: a row’s Open opens the request’s page', async () => {
    const { opened, view } = await answered(WITH_REQUESTS);
    const recorded = (
      await goldenMaster(WITH_REQUESTS, 'listDeploymentRequests', 'qits-deployments')
    ).deploymentRequests as { id: string }[];
    await view
      .getByRole('region', { name: 'Completed' })
      .getByRole('link', { name: 'Open' })
      .click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-deployment-request:request',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/deployments/requests/${recorded[1].id}`,
    );
  });
});
