import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster, goldenMasterText } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

const STORE = 'a store holding one artifact of every kind';
const EMPTY = 'a store with nothing published';
const SBOMMED = 'a maven coordinate with an sbom on one of two versions';
const ARTIFACTS = 'qits-artifacts';

/** The coordinate every state records (`mavenPackage` in `mavenRepository`). */
const REPO = 'maven';
const COORDINATE = 'eu.wohlben.qits:contract-maven';

/**
 * Screenshots of the Artifacts section's maven package page (qits-2325) inside the shell
 * (`openRoute`), with no project open, its two reads (`listMavenVersionSummaries`,
 * `listSbomVersions`) answered with qits-artifacts' recordings: "a maven coordinate with an sbom on
 * one of two versions" (`contract-maven` in `maven`: 2100.1.0 without an SBOM, 2100.2.0 with one;
 * `package`), "a store holding one artifact of every kind" (one version, the SBOM list a 404;
 * `no-sbom`) and "a store with nothing published" (no such coordinate: no versions; `empty`). A
 * 404 (`unknown-repository`), a 400 (`not-a-maven-repository`), a failed SBOM list under the
 * recorded versions (`sbom-error`), a read still open (`loading`) and a failure (`error`) are
 * statuses only.
 *
 * Its outcomes (epic qits-2000) are each reached once: the back link and a non-maven repository's
 * store page (`leave-maven-package`), and a version's Download (`download-maven-sbom`), saved (shot
 * as `package`, the recorded document answering it) and failed (`download-error`). The saved file
 * never reaches the disk: the download link's click is a spy.
 */
describe('ArtifactsMavenPackagePage (screenshots)', () => {
  let http: HttpTestingController;
  let clicked: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
    clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    clicked.mockRestore();
    http.verify();
    await page.viewport(800, 600);
  });

  /** The page's two reads, and one version's SBOM, by URL (the coordinate one segment). */
  const urls = (repo: string, coordinate: string) => ({
    versions: `/artifacts/api/repositories/${encodeURIComponent(repo)}/maven-packages/${encodeURIComponent(coordinate)}/versions`,
    sboms: `/artifacts/sboms/maven/${encodeURIComponent(coordinate)}`,
    sbom: (version: string) =>
      `/artifacts/sboms/maven/${encodeURIComponent(coordinate)}/-/${version}`,
  });

  /** Opens the coordinate's page, its reads still open. */
  async function open(repo = REPO, coordinate = COORDINATE): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    return openRoute(
      `/artifacts/repositories/${encodeURIComponent(repo)}/maven-packages/${encodeURIComponent(coordinate)}`,
    );
  }

  /** Answers the SBOM list from `state`: its recording, or the 404 it recorded. */
  async function answerSboms(state: string) {
    const request = http.expectOne(urls(REPO, COORDINATE).sboms);
    if (state === SBOMMED) {
      request.flush(await goldenMaster(state, 'listSbomVersions', ARTIFACTS));
    } else {
      request.flush(null, { status: 404, statusText: 'Not Found' });
    }
  }

  /** Answers both reads from `state`'s recordings. */
  async function answer(opened: OpenedRoute, state: string) {
    http
      .expectOne(urls(REPO, COORDINATE).versions)
      .flush(await goldenMaster(state, 'listMavenVersionSummaries', ARTIFACTS));
    await answerSboms(state);
    await opened.settled();
  }

  /** The coordinate's page, answered from `state`. */
  async function render(state: string) {
    const opened = await open();
    await answer(opened, state);
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** Refuses the versions with `status`, the SBOM list with `sbomStatus` (statuses only). */
  async function refuse(
    opened: OpenedRoute,
    status: number,
    statusText: string,
    repo = REPO,
    sbomStatus = 404,
  ) {
    const at = urls(repo, COORDINATE);
    http.expectOne(at.versions).flush(null, { status, statusText });
    http.expectOne(at.sboms).flush(null, {
      status: sbomStatus,
      statusText: sbomStatus === 404 ? 'Not Found' : statusText,
    });
    await opened.settled();
  }

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('shows a coordinate’s versions newest first, an SBOM on one, and saves it', async () => {
    const { opened, view } = await render(SBOMMED);
    await expect.element(view.getByRole('heading', { name: COORDINATE })).toBeVisible();
    await expect.element(view).toMatchTextContent('groupId eu.wohlben.qits');
    await expect.element(view).toMatchTextContent('artifactId contract-maven');
    await expect.element(view).toMatchTextContent('2 versions · 1 with an SBOM');
    const table = view.getByRole('table', { name: 'Versions' });
    const rows = table.getByRole('row').elements();
    expect(rows).toHaveLength(3);
    // Both were published at the same frozen instant: the higher version first.
    expect(rows[1].textContent).toContain('2100.2.0');
    expect(rows[1].textContent).toContain('CycloneDX 1.6 · 909 B');
    expect(rows[2].textContent).toContain('2100.1.0');
    expect(rows[2].textContent).toContain('—');
    const files = rows[2].textContent ?? '';
    expect(files.indexOf('contract-maven-2100.1.0.jar')).toBeLessThan(
      files.indexOf('contract-maven-2100.1.0.pom'),
    );
    await expect.element(table).toMatchTextContent('1 Jan 2026 00:00:00Z');
    expect(opened.page.querySelector('[data-orphans]')).toBeNull();

    // Download: the recorded document, saved as <artifactId>-<version>.cdx.json. A DOM click, so
    // the pointer stays parked and the shot shows no hover.
    const download = view.getByRole('button', { name: 'Download the SBOM of 2100.2.0' });
    (download.element() as HTMLButtonElement).click();
    await opened.idle();
    http
      .expectOne(urls(REPO, COORDINATE).sbom('2100.2.0'))
      .flush(await goldenMasterText(SBOMMED, 'getSbom', ARTIFACTS));
    await opened.settled();
    await vi.waitFor(() => expect(clicked).toHaveBeenCalledTimes(1));
    const link = clicked.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('contract-maven-2100.2.0.cdx.json');
    expect(reached()).toEqual(['download-maven-sbom:saved']);
    expect(opened.page.querySelector('[data-sbom-failed]')).toBeNull();

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
      .toMatchScreenshot('package', { kind: 'DATA' });
    await shootShellMenus(opened, 'package');
  });

  it('says on its row that a version’s SBOM could not be downloaded', async () => {
    const { opened, view } = await render(SBOMMED);
    const download = view.getByRole('button', { name: 'Download the SBOM of 2100.2.0' });
    (download.element() as HTMLButtonElement).click();
    await opened.idle();
    http
      .expectOne(urls(REPO, COORDINATE).sbom('2100.2.0'))
      .flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    expect(reached()).toEqual(['download-maven-sbom:failed']);
    expect(clicked).not.toHaveBeenCalled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('The SBOM could not be downloaded.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('download-error', { kind: 'ERROR' });
  });

  it('shows a version without an SBOM as “—” when the coordinate has none (a 404)', async () => {
    const { opened, view } = await render(STORE);
    await expect.element(view).toMatchTextContent('1 version · 0 with an SBOM');
    const table = view.getByRole('table', { name: 'Versions' });
    await expect.element(table).toMatchTextContent('2100.1.0');
    await expect.element(table).toMatchTextContent('contract-maven-2100.1.0.pom');
    await expect.element(table).toMatchTextContent('206 B');
    expect(view.getByRole('button', { name: 'Download' }).elements()).toHaveLength(0);
    // The 404 is "no SBOMs", not a failure.
    expect(opened.page.querySelector('[data-sboms-unknown]')).toBeNull();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('no-sbom', { kind: 'DATA' });
  });

  it('says there is no such coordinate when the repository holds no version of it', async () => {
    const { opened, view } = await render(EMPTY);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent(
        `There is no Maven coordinate called “${COORDINATE}” in this repository.`,
      );
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

  it('says a repository of another type is not a Maven repository, linking its page', async () => {
    const opened = await open('npm');
    await refuse(opened, 400, 'Bad Request', 'npm');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('“npm” is not a Maven repository.');
    await expect
      .element(view.getByRole('link', { name: 'Open its store page' }))
      .toHaveAttribute('href', '/artifacts/repositories/npm');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('not-a-maven-repository', { kind: 'NO_DATA' });
  });

  it('keeps the versions when only the SBOM list fails, its column unknown, with Retry', async () => {
    const opened = await open();
    const at = urls(REPO, COORDINATE);
    http
      .expectOne(at.versions)
      .flush(await goldenMaster(SBOMMED, 'listMavenVersionSummaries', ARTIFACTS));
    http.expectOne(at.sboms).flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('2 versions · SBOMs unknown');
    await expect.element(view).toMatchTextContent('This coordinate’s SBOMs could not be read');
    const table = view.getByRole('table', { name: 'Versions' });
    expect(table.getByText('unknown').elements()).toHaveLength(2);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('sbom-error', { kind: 'ERROR' });
    // Retry reads the SBOM list again, not the versions.
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answerSboms(SBOMMED);
    await opened.settled();
    await expect.element(table).toMatchTextContent('CycloneDX 1.6 · 909 B');
    await expect.element(view).toMatchTextContent('2 versions · 1 with an SBOM');
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    await refuse(opened, 500, 'Server Error', REPO, 500);
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
    // Retry reads both again.
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answer(opened, SBOMMED);
    await expect
      .element(view.getByRole('table', { name: 'Versions' }))
      .toMatchTextContent('2100.2.0');
  });

  it('reads both again on Refresh', async () => {
    const { opened, view } = await render(SBOMMED);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answer(opened, SBOMMED);
  });

  it('leave-maven-package back: the back link opens the repository’s page', async () => {
    const { opened, view } = await render(SBOMMED);
    await view.getByRole('link', { name: `← ${REPO}` }).click();
    await opened.settled();
    expect(reached()).toEqual(['leave-maven-package:back']);
    expect(TestBed.inject(Router).url).toBe(`/artifacts/repositories/${REPO}`);
    http
      .expectOne('/artifacts/api/repositories')
      .flush(await goldenMaster(STORE, 'listRepositories', ARTIFACTS));
    await opened.settled();
    http
      .expectOne(`/artifacts/api/repositories/${REPO}/maven-packages`)
      .flush(await goldenMaster(STORE, 'listMavenPackages', ARTIFACTS));
    await opened.settled();
  });

  it('leave-maven-package repository: a non-maven repository’s note opens its page', async () => {
    const opened = await open('npm');
    await refuse(opened, 400, 'Bad Request', 'npm');
    await page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'Open its store page' })
      .click();
    await opened.settled();
    expect(reached()).toEqual(['leave-maven-package:repository']);
    expect(TestBed.inject(Router).url).toBe('/artifacts/repositories/npm');
    http
      .expectOne('/artifacts/api/repositories')
      .flush(await goldenMaster(STORE, 'listRepositories', ARTIFACTS));
    await opened.settled();
    http
      .expectOne('/artifacts/api/repositories/npm/packages')
      .flush(await goldenMaster(STORE, 'listNpmPackages', ARTIFACTS));
    await opened.settled();
  });
});
