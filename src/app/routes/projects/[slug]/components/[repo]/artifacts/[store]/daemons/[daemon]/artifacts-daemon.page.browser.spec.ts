import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../../../../testing/browser/golden-master';
import { leftFor } from '../../../../../../../../../../testing/browser/contracts-bundles';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../../../../testing/browser/shell-menus';

const STORE = 'a store holding one artifact of every kind';
const TWO_VERSIONS = 'a daemon with two versions';
const NOTHING_PUBLISHED = 'a daemon nothing has published';
const ARTIFACTS = 'qits-artifacts';

/** The repository the page is opened under (qits-2477): the address's, not read. */
const OWNER = 'contract-service';

/** The daemon both states record (`daemon` in `repository`). */
const REPO = 'daemons';
const DAEMON = 'contract-daemon';
const DIGEST = 'sha256:6caecc97403739b2273c00a43c649e5efdebddde20a0ed27ed4fe356a1344aa4';

/**
 * Screenshots of the Artifacts section's daemon page (qits-2327) inside the shell (`openRoute`),
 * under its repository (qits-2477), its one read (`listDaemonVersions`) answered with qits-artifacts'
 * recordings: "a daemon with two versions" (`contract-daemon` in `daemons`: 2026.2.0, then
 * 2026.1.0; `daemon`) and "a daemon nothing has published" (no versions, as an unknown daemon
 * answers too; `empty`). A 404 (`unknown-repository`), a 400 (`not-a-daemon-repository`), a read
 * still open (`loading`) and a failure (`error`) are statuses only.
 *
 * Its outcomes (epic qits-2000) are each reached once: the back link and a non-daemon
 * repository's Artifacts (`leave-artifact-daemon`), and a version's download
 * (`download-artifact-daemon`, a stay, shot after it). The download's 2xx answer is bytes no
 * recording holds, so the spec checks the request (`getDaemon`, the daemon wire, as a Blob) and
 * answers it with a failure (`download-failed`), a status only; the pact binds the 200.
 */
describe('ArtifactsDaemonPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The daemon page's read, by URL. */
  const versionsUrl = (repo: string, daemon = DAEMON) =>
    `/artifacts/api/repositories/${encodeURIComponent(repo)}/daemons/${encodeURIComponent(daemon)}/versions`;

  /** Opens the daemon's page, its read still open. */
  async function open(repo = REPO, daemon = DAEMON): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    return openRoute(
      (project) =>
        `/projects/${project.slug}/components/${OWNER}/artifacts/${encodeURIComponent(repo)}/daemons/${encodeURIComponent(daemon)}`,
    );
  }

  /** Answers the read from `state`'s recording. */
  async function answer(opened: OpenedRoute, state: string, repo = REPO) {
    http
      .expectOne(versionsUrl(repo))
      .flush(await goldenMaster(state, 'listDaemonVersions', ARTIFACTS));
    await opened.settled();
  }

  /** Answers the read with `status` and no body (an error answer is only a status). */
  async function refuse(opened: OpenedRoute, status: number, statusText: string, repo = REPO) {
    http.expectOne(versionsUrl(repo)).flush(null, { status, statusText });
    await opened.settled();
  }

  /** The daemon's page, answered from `state`. */
  async function render(state: string) {
    const opened = await open();
    await answer(opened, state);
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('shows a daemon’s versions, newest first, each with its size and digest', async () => {
    const { opened, view } = await render(TWO_VERSIONS);
    await expect.element(view.getByRole('heading', { name: DAEMON, exact: true })).toBeVisible();
    await expect.element(view).toMatchTextContent('2 versions · newest first');
    const versions = view.getByRole('table', { name: 'Versions' });
    const rows = versions.getByRole('row').elements();
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain('2026.2.0');
    expect(rows[2].textContent).toContain('2026.1.0');
    await expect.element(versions).toMatchTextContent('24 B');
    await expect.element(versions).toMatchTextContent('sha256:6caecc974037');
    await expect.element(versions).toMatchTextContent('1 Jan 2026 00:00:00Z');
    await expect.element(versions).toMatchTextContent('Never');
    expect(versions.element().textContent).not.toContain(DIGEST);
    expect(versions.element().querySelector(`[title="${DIGEST}"]`)).not.toBeNull();
    await expect.element(view).toMatchTextContent('the column is not totalled');
    await expect.element(view).toMatchTextContent('which carries no repository segment');
    await expect.element(view).toMatchTextContent('a read of the blob by its digest does not move');
    await expect
      .element(view.getByRole('button', { name: `Download ${DAEMON} 2026.2.0` }))
      .toBeVisible();
    // The root sidebar's Artifacts stays current below the section.
    await expect
      .element(
        page
          .elementLocator(opened.frame)
          .getByRole('navigation', { name: 'qits' })
          .getByRole('link', { name: 'Artifacts' }),
      )
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('daemon', { kind: 'DATA' });
    await shootShellMenus(opened, 'daemon');
  });

  it('says a daemon with no versions has none here, as an unknown one would', async () => {
    const { opened, view } = await render(NOTHING_PUBLISHED);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent(`“${DAEMON}” has no published versions in this repository.`);
    await expect.element(view.getByRole('status')).toMatchTextContent('answers the same');
    expect(view.getByRole('table').elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('says so when the store holds no repository of that name', async () => {
    const opened = await open('no-such-store');
    await refuse(opened, 404, 'Not Found', 'no-such-store');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('There is no repository called “no-such-store” in this store.');
    expect(opened.page.textContent).not.toContain('could not be read');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unknown-repository', { kind: 'NO_DATA' });
  });

  it('says a repository of another type is not a daemon repository, linking its page', async () => {
    const opened = await open('npm');
    await refuse(opened, 400, 'Bad Request', 'npm');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('“npm” is not a daemon repository.');
    await expect
      .element(view.getByRole('link', { name: 'Open the repository’s artifacts' }))
      .toHaveAttribute('href', `/projects/${opened.project.slug}/components/${OWNER}/artifacts`);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('not-a-daemon-repository', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    await refuse(opened, 500, 'Server Error');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect.element(view).toMatchTextContent('This daemon’s versions could not be read.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answer(opened, TWO_VERSIONS);
    await expect
      .element(view.getByRole('table', { name: 'Versions' }))
      .toMatchTextContent('2026.2.0');
  });

  it('reads the versions again on Refresh', async () => {
    const { opened, view } = await render(TWO_VERSIONS);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answer(opened, TWO_VERSIONS);
  });

  it('download-artifact-daemon started: a version fetches its bytes on the daemon wire', async () => {
    const { opened, view } = await render(TWO_VERSIONS);
    await view.getByRole('button', { name: `Download ${DAEMON} 2026.2.0` }).click();
    await opened.idle();
    expect(reached()).toEqual(['download-artifact-daemon:started']);
    // The download door carries no repository segment, and is read as a Blob.
    const download = http.expectOne(`/artifacts/daemons/${DAEMON}/2026.2.0`);
    expect(download.request.method).toBe('GET');
    expect(download.request.responseType).toBe('blob');
    download.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent(`${DAEMON} 2026.2.0 could not be downloaded.`);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('download-failed', { kind: 'ERROR' });
  });

  it('leave-artifact-daemon back: the back link opens the repository’s page', async () => {
    const { opened, view } = await render(TWO_VERSIONS);
    await view.getByRole('link', { name: '← Artifacts' }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['leave-artifact-daemon:back']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/components/${OWNER}/artifacts`,
    );
  });

  it('leave-artifact-daemon repository: a non-daemon repository’s note opens its page', async () => {
    const opened = await open('npm');
    await refuse(opened, 400, 'Bad Request', 'npm');
    await page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'Open the repository’s artifacts' })
      .click();
    await leftFor(opened);
    expect(reached()).toEqual(['leave-artifact-daemon:repository']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/components/${OWNER}/artifacts`,
    );
  });
});
