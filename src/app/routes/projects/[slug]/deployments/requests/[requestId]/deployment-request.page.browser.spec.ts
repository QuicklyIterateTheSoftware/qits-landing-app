import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../../testing/browser/app-route';
import { leftFor } from '../../../../../../../testing/browser/contracts-bundles';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';

/**
 * Screenshots of one deployment request's page inside the shell (`openRoute`), at the recorded
 * project's slug (qits-projects' "a project exists"; the frame's release requests are "a project
 * with no release requests", so the merge tile finds no release request of the version).
 *
 * `getDeploymentRequest` is answered from qits-deployments' golden masters: "a deployment request
 * that deployed" (gate met, its deployment ACTIVE) and "a deployment request held for approval"
 * (held, nothing queued: Approve, Decline and the empty deployment section). The tier's
 * deployments are "an application deployed in an environment" (the same application ACTIVE at the
 * same version, in the same tier) and the tiers "an environment" (that tier's name); on the held
 * page the tier's read fails, so its tile says so and nothing else does. A refusal is a 403 with
 * no body, as the service answers a credential without a deployments role.
 */
describe('DeploymentRequestPage (screenshots)', () => {
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

  const DEPLOYED = 'a deployment request that deployed';
  const HELD = 'a deployment request held for approval';
  const IN_TIER = 'an application deployed in an environment';
  const AN_ENVIRONMENT = 'an environment';
  const REQUESTS = '/deployments/api/deployment-requests';

  /** The open reads of `path` (the query aside). */
  const reads = (path: string): TestRequest[] =>
    http
      .match((request) => request.url.split('?')[0] === path && request.method === 'GET')
      .filter((request) => !request.cancelled);

  /** The request `state` recorded. */
  const recorded = async (state: string) =>
    (await goldenMaster(state, 'getDeploymentRequest', 'qits-deployments')) as {
      deploymentRequest: { id: string; version: string; applicationName: string };
    };

  /** Opens the request of `state`, wide and tall enough for the whole page. */
  async function render(state: string) {
    await page.viewport(1140, 900);
    const { deploymentRequest } = await recorded(state);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/deployments/requests/${deploymentRequest.id}`,
    );
    return { opened, view: page.elementLocator(opened.page), request: deploymentRequest };
  }

  /** The page with the request of `state` answered; the tier's read failing when `tierFails`. */
  async function answered(state: string, tierFails = false) {
    const rendered = await render(state);
    reads(`${REQUESTS}/${rendered.request.id}`)[0]?.flush(
      await goldenMaster(state, 'getDeploymentRequest', 'qits-deployments'),
    );
    await rendered.opened.settled();
    const [tier] = reads('/deployments/api/deployments');
    if (tierFails) tier?.flush(null, { status: 503, statusText: 'Service Unavailable' });
    else tier?.flush(await goldenMaster(IN_TIER, 'listDeployments', 'qits-deployments'));
    reads('/deployments/api/environments')[0]?.flush(
      await goldenMaster(AN_ENVIRONMENT, 'listEnvironments', 'qits-deployments'),
    );
    await rendered.opened.settled();
    return rendered;
  }

  it('shows a deployed version running in its tier, its gate and its deployment', async () => {
    const { opened, view, request } = await answered(DEPLOYED);
    await expect
      .element(view.getByRole('heading', { level: 1 }))
      .toHaveTextContent(`${request.version} · ${request.applicationName}`);
    const flow = view.getByRole('list', { name: 'How far this version got' });
    await expect.element(flow).toMatchTextContent(`Released ${request.version}`);
    await expect.element(flow).toMatchTextContent('Running in contract-00000001');
    await expect.element(flow).toMatchTextContent('no release request carries this version');
    await expect.element(view).toMatchTextContent('Gate met');
    await expect.element(view).toMatchTextContent('Active');
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toMatchTextContent(`Deployments›${request.version} · ${request.applicationName}`);
    await expect
      .element(
        page
          .getByRole('navigation', { name: 'qits' })
          .getByRole('link', { name: 'Requests', exact: true }),
      )
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('deployed', { kind: 'DATA' });
    await shootShellMenus(opened, 'deployed');
  });

  it('offers Approve and Decline on a held request, which queued no deployment', async () => {
    const { opened, view } = await answered(HELD, true);
    await expect.element(view).toMatchTextContent('Held for approval');
    await expect.element(view.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect.element(view.getByRole('button', { name: 'Decline' })).toBeVisible();
    await expect
      .element(view)
      .toMatchTextContent('A decline is final — the release request ends WITHDRAWN.');
    await expect.element(view).toMatchTextContent('No deployment was queued for this request.');
    await expect
      .element(view.getByRole('list', { name: 'How far this version got' }))
      .toMatchTextContent('the tier’s deployments could not be read');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('held', { kind: 'DATA' });
  });

  it('reads the request again on Refresh', async () => {
    const { opened, view, request } = await answered(DEPLOYED);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    reads(`${REQUESTS}/${request.id}`)[0]?.flush(
      await goldenMaster(DEPLOYED, 'getDeploymentRequest', 'qits-deployments'),
    );
    reads('/deployments/api/deployments')[0]?.flush(
      await goldenMaster(IN_TIER, 'listDeployments', 'qits-deployments'),
    );
    reads('/deployments/api/environments')[0]?.flush(
      await goldenMaster(AN_ENVIRONMENT, 'listEnvironments', 'qits-deployments'),
    );
    await opened.settled();
  });

  it('marks the page as loading, then says who may read deployment requests', async () => {
    const { opened, view, request } = await render(DEPLOYED);
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    reads(`${REQUESTS}/${request.id}`)[0]?.flush(null, { status: 403, statusText: 'Forbidden' });
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

  it('says when no deployment request has the id', async () => {
    const { opened, view, request } = await render(DEPLOYED);
    reads(`${REQUESTS}/${request.id}`)[0]?.flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    await expect.element(view).toMatchTextContent(`No deployment request ${request.id}.`);
  });

  it('offers Retry when the read fails, and reads again', async () => {
    const { opened, view, request } = await render(DEPLOYED);
    reads(`${REQUESTS}/${request.id}`)[0]?.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('This deployment request could not be read.');
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    reads(`${REQUESTS}/${request.id}`)[0]?.flush(
      await goldenMaster(DEPLOYED, 'getDeploymentRequest', 'qits-deployments'),
    );
    await opened.settled();
    reads('/deployments/api/deployments')[0]?.flush(
      await goldenMaster(IN_TIER, 'listDeployments', 'qits-deployments'),
    );
    reads('/deployments/api/environments')[0]?.flush(
      await goldenMaster(AN_ENVIRONMENT, 'listEnvironments', 'qits-deployments'),
    );
    await opened.settled();
    await expect.element(view).toMatchTextContent('Gate met');
  });

  it('leave-deployment-request list: “← Deployment requests” opens the list', async () => {
    const { opened, view } = await answered(DEPLOYED);
    await view.getByRole('link', { name: '← Deployment requests' }).click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'leave-deployment-request:list',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/deployments/requests`,
    );
  });
});
