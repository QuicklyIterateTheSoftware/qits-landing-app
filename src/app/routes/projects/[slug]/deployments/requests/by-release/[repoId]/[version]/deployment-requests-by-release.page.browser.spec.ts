import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../../../testing/browser/app-route';
import { leftFor } from '../../../../../../../../../testing/browser/contracts-bundles';
import { shootShellMenus } from '../../../../../../../../../testing/browser/shell-menus';
import { provideTestPlatformOrigins } from '../../../../../../../../../testing/platform-origins';

const WITH_VARIANT = 'a release with a variant deployed';
const WITHOUT_REQUESTS = 'a release with no deployment requests';
const REPOSITORIES = 'a project with 3 repositories';
const LIST = '/deployments/api/deployment-requests';

/**
 * Screenshots of one release's deployment requests (qits-2323) inside the shell (`openRoute`), at
 * the recorded project's slug and at the release each qits-deployments state records its read for.
 *
 * `listDeploymentRequests?repoId=&version=&includeVariants=true` is answered from
 * qits-deployments' golden masters: "a release with a variant deployed" (the main application and
 * its `private` variant, both ACTIVE through a met gate) and "a release with no deployment
 * requests" (none; recorded from a later qits-deployments release, so its test skips itself until
 * the pin reaches it). The project's repositories are qits-projects' "a project with 3
 * repositories", none of which is the recorded release's, so the heading names it by its `repoId`.
 * A refusal is a 403 with no body, as the service answers a credential without a deployments role.
 * A release with exactly one request opens that request's page in its place; no recording holds
 * one, so the plain spec covers it.
 */
describe('DeploymentRequestsByReleasePage (screenshots)', () => {
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

  /** The open requests reads. */
  const listReads = (): TestRequest[] =>
    http
      .match((request) => request.url.split('?')[0] === LIST)
      .filter((request) => !request.cancelled);

  /** A query parameter of `read`: the client writes the query into the URL. */
  const param = (read: TestRequest | undefined, name: string) =>
    read ? new URL(read.request.urlWithParams, 'http://x').searchParams.get(name) : undefined;

  /**
   * The release each state records its read for (its provider-state params, which the Node-side
   * reader does not hand the browser): the variant's as its rows name it, the empty one's as
   * qits-deployments' index names it.
   */
  const RELEASES: Readonly<Record<string, { repoId: string; version: string }>> = {
    [WITH_VARIANT]: { repoId: 'contract-app-00000001', version: '2026.101.120000' },
    [WITHOUT_REQUESTS]: { repoId: 'contract-app-no-requests', version: '2026.104.120000' },
  };
  const releaseOf = (state: string) => RELEASES[state];

  /** Answers the project's repositories, which name the release's repository when they hold it. */
  async function answerRepositories(opened: OpenedRoute) {
    http
      .expectOne(`/projects/api/projects/${opened.project.id}/repositories`)
      .flush(await goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    await opened.settled();
  }

  /** Opens the page of `state`'s release, wide enough for the table. */
  async function render(state: string) {
    await page.viewport(1140, 700);
    const release = releaseOf(state);
    const opened = await openRoute(
      (project) =>
        `/projects/${project.slug}/deployments/requests/by-release/` +
        `${encodeURIComponent(release.repoId)}/${encodeURIComponent(release.version)}`,
    );
    await answerRepositories(opened);
    return { opened, release, view: page.elementLocator(opened.page) };
  }

  /** The page with `state`'s requests answered, read by the release and its variants. */
  async function answered(state: string) {
    const rendered = await render(state);
    const [read] = listReads();
    expect(param(read, 'repoId')).toBe(rendered.release.repoId);
    expect(param(read, 'version')).toBe(rendered.release.version);
    expect(param(read, 'includeVariants')).toBe('true');
    read?.flush(await goldenMaster(state, 'listDeploymentRequests', 'qits-deployments'));
    await rendered.opened.settled();
    return rendered;
  }

  const recordedRows = async () =>
    (await goldenMaster(WITH_VARIANT, 'listDeploymentRequests', 'qits-deployments'))
      .deploymentRequests as { id: string; applicationName: string; repoId: string }[];

  it('lists the main application’s request and its variant’s, each with its gate and deployment', async () => {
    const { opened, release, view } = await answered(WITH_VARIANT);
    const rows = await recordedRows();
    expect(rows.every((row) => row.repoId === release.repoId)).toBe(true);
    await expect
      .element(view.getByRole('heading', { level: 1 }))
      .toHaveTextContent(`${release.repoId}@${release.version}`);
    const table = view.getByRole('table');
    for (const row of rows) await expect.element(table).toMatchTextContent(row.applicationName);
    await expect.element(table.getByRole('row')).toHaveLength(3);
    await expect.element(table.getByRole('cell', { name: 'private', exact: true })).toBeVisible();
    await expect.element(table).toMatchTextContent('Gate met');
    await expect.element(table).toMatchTextContent('Active');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('reads the requests again on Refresh', async () => {
    const { opened, view } = await answered(WITH_VARIANT);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    const [again] = listReads();
    expect(param(again, 'includeVariants')).toBe('true');
    again?.flush(await goldenMaster(WITH_VARIANT, 'listDeploymentRequests', 'qits-deployments'));
    await opened.settled();
  });

  it('says why a release has none, and offers to look again', async (context) => {
    // qits-deployments records the state from a later release than the pinned one: until the
    // pin reaches it (and the pact holds it), the reader refuses it and the test skips itself.
    const recorded = await goldenMaster(
      WITHOUT_REQUESTS,
      'listDeploymentRequests',
      'qits-deployments',
    ).catch(() => undefined);
    if (!recorded) context.skip();
    const { opened, release, view } = await answered(WITHOUT_REQUESTS);
    await expect
      .element(view)
      .toMatchTextContent(`No deployment request exists for ${release.repoId}@${release.version}`);
    await expect.element(view.getByRole('table')).not.toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
    await view.getByRole('button', { name: 'Look again' }).click();
    await opened.idle();
    listReads()[0]?.flush(
      await goldenMaster(WITHOUT_REQUESTS, 'listDeploymentRequests', 'qits-deployments'),
    );
    await opened.settled();
  });

  it('marks the page as loading, then says who may read deployment requests', async () => {
    const { opened, view } = await render(WITH_VARIANT);
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
    const { opened, view } = await render(WITH_VARIANT);
    listReads()[0]?.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('The release’s deployment requests could not be read.');
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    listReads()[0]?.flush(
      await goldenMaster(WITH_VARIANT, 'listDeploymentRequests', 'qits-deployments'),
    );
    await opened.settled();
    await expect.element(view.getByRole('table')).toBeVisible();
  });

  it('open-release-deployment-requests-row request: a row’s Open opens the request’s page', async () => {
    const { opened, view } = await answered(WITH_VARIANT);
    const [variant] = await recordedRows();
    await view
      .getByRole('row')
      .filter({ hasText: variant.applicationName })
      .getByRole('link', { name: 'Open' })
      .click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-release-deployment-requests-row:request',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/deployments/requests/${variant.id}`,
    );
  });

  it('leave-release-deployment-requests list: “← Deployment requests” goes back to the list', async () => {
    const { opened, view } = await answered(WITH_VARIANT);
    await view.getByRole('link', { name: '← Deployment requests' }).click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'leave-release-deployment-requests:list',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/deployments/requests`,
    );
  });
});
