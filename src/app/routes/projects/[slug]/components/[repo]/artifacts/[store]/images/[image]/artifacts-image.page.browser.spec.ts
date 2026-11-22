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
const EMPTY = 'a store with nothing published';
const UNTAGGED = 'an image with a manifest no tag names';
const ARTIFACTS = 'qits-artifacts';

/** The repository the page is opened under (qits-2477): the address's, not read. */
const OWNER = 'contract-service';

/** The image every state records (`image` in `imagesRepository`). */
const REPO = 'qits';
const IMAGE = 'contract-image';
const DIGEST = 'sha256:1b91a3dfff59dad5c1d9c7e557ca94e67e96aabad34050385263cffe926ed7a2';

/**
 * Screenshots of the Artifacts section's image page (qits-2324) inside the shell (`openRoute`),
 * under its repository (qits-2477), its three reads (`listImages`, `listImageTagSummaries`,
 * `listImageManifestSummaries`) answered with qits-artifacts' recordings: "a store holding one
 * artifact of every kind" (`contract-image` in `qits`: one tag naming its one manifest; `image`, and
 * `full-digests` with the digests whole), "an image with a manifest no tag names" (one tag, two
 * manifests, one untagged; `untagged`) and "a store with nothing published" (no such image: empty
 * lists; `empty`). A 404 (`unknown-repository`), a 400 (`not-an-image-repository`), a read still
 * open (`loading`) and a failure (`error`) are statuses only.
 *
 * Its outcomes (epic qits-2000) are each reached once: the back link and a non-image
 * repository's Artifacts (`leave-artifact-image`), and the digest toggle (`toggle-image-digests`,
 * a stay, shot after it).
 */
describe('ArtifactsImagePage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The image page's three reads, by URL (the image one segment, as the client encodes it). */
  const urls = (repo: string, image: string) => {
    const at = `/artifacts/api/repositories/${encodeURIComponent(repo)}`;
    return {
      images: `${at}/images`,
      tags: `${at}/images/${encodeURIComponent(image)}/tags`,
      manifests: `${at}/images/${encodeURIComponent(image)}/manifests`,
    };
  };

  /** Opens the image's page, its reads still open. */
  async function open(repo = REPO, image = IMAGE): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    return openRoute(
      (project) =>
        `/projects/${project.slug}/components/${OWNER}/artifacts/${encodeURIComponent(repo)}/images/${encodeURIComponent(image)}`,
    );
  }

  /** Answers all three reads from `state`'s recordings. */
  async function answer(opened: OpenedRoute, state: string, repo = REPO, image = IMAGE) {
    const at = urls(repo, image);
    http.expectOne(at.images).flush(await goldenMaster(state, 'listImages', ARTIFACTS));
    http.expectOne(at.tags).flush(await goldenMaster(state, 'listImageTagSummaries', ARTIFACTS));
    http
      .expectOne(at.manifests)
      .flush(await goldenMaster(state, 'listImageManifestSummaries', ARTIFACTS));
    await opened.settled();
  }

  /** Answers all three reads with `status` and no body (an error answer is only a status). */
  async function refuse(opened: OpenedRoute, status: number, statusText: string, repo = REPO) {
    const at = urls(repo, IMAGE);
    for (const url of [at.images, at.tags, at.manifests]) {
      http.expectOne(url).flush(null, { status, statusText });
    }
    await opened.settled();
  }

  /** The image's page, answered from `state`. */
  async function render(state: string) {
    const opened = await open();
    await answer(opened, state);
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('shows an image’s counts and size, its tags and its manifests', async () => {
    const { opened, view } = await render(STORE);
    await expect.element(view.getByRole('heading', { name: IMAGE, exact: true })).toBeVisible();
    await expect
      .element(view)
      .toMatchTextContent('1 tag · 1 manifest · 2.57 KiB (union over this image’s blobs)');
    const tags = view.getByRole('table', { name: 'Tags' });
    await expect.element(tags).toMatchTextContent('2100.1.0');
    await expect.element(tags).toMatchTextContent('sha256:1b91a3dfff59');
    await expect.element(tags).toMatchTextContent('1 Jan 2026 00:00:00Z');
    await expect.element(tags).toMatchTextContent('Never');
    expect(tags.element().textContent).not.toContain(DIGEST);
    await expect.element(view).toMatchTextContent('They do not add up');
    const manifests = view.getByRole('table', { name: 'Manifests' });
    await expect
      .element(manifests)
      .toMatchTextContent('application/vnd.oci.image.manifest.v1+json');
    await expect.element(manifests).toMatchTextContent('2100.1.0');
    expect(opened.page.querySelector('[data-untagged]')).toBeNull();
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
      .toMatchScreenshot('image', { kind: 'DATA' });
    await shootShellMenus(opened, 'image');
  });

  it('says a manifest no tag names is untagged, and counts them', async () => {
    const { opened, view } = await render(UNTAGGED);
    await expect.element(view).toMatchTextContent('1 tag · 2 manifests · 5.15 KiB');
    const manifests = view.getByRole('table', { name: 'Manifests' });
    expect(manifests.getByRole('row').elements()).toHaveLength(3);
    await expect.element(manifests).toMatchTextContent('Untagged');
    await expect.element(manifests).toMatchTextContent('sha256:570c2d49cb04');
    await expect.element(view).toMatchTextContent('1 manifest is untagged: no tag names it.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('untagged', { kind: 'DATA' });
  });

  it('toggle-image-digests toggled: shows the digests whole, and shortened again', async () => {
    const { opened, view } = await render(STORE);
    const toggle = view.getByRole('button', { name: 'Show full digests' });
    await expect.element(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    await opened.settled();
    expect(reached()).toEqual(['toggle-image-digests:toggled']);
    await expect.element(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect.element(view.getByRole('table', { name: 'Tags' })).toMatchTextContent(DIGEST);
    await expect.element(view.getByRole('table', { name: 'Manifests' })).toMatchTextContent(DIGEST);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('full-digests', { kind: 'DATA' });
    await userEvent.click(toggle);
    await opened.settled();
    expect(view.getByRole('table', { name: 'Tags' }).element().textContent).not.toContain(DIGEST);
  });

  it('says there is no such image when the repository holds none of it', async () => {
    const { opened, view } = await render(EMPTY);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent(`There is no image called “${IMAGE}” in this repository.`);
    expect(view.getByRole('table').elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('reads a slashed image name as one segment', async () => {
    const opened = await open(REPO, 'team/app');
    await answer(opened, EMPTY, REPO, 'team/app');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { name: 'team/app', exact: true }))
      .toBeVisible();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('There is no image called “team/app” in this repository.');
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

  it('says a repository of another type is not an image repository, linking its page', async () => {
    const opened = await open('npm');
    await refuse(opened, 400, 'Bad Request', 'npm');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('“npm” is not an image repository.');
    await expect
      .element(view.getByRole('link', { name: 'Open the repository’s artifacts' }))
      .toHaveAttribute('href', `/projects/${opened.project.slug}/components/${OWNER}/artifacts`);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('not-an-image-repository', { kind: 'NO_DATA' });
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
    await expect
      .element(view)
      .toMatchTextContent('This image’s counts and total size could not be read');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
    // Retry reads the two failed tables again, not the image row.
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    const at = urls(REPO, IMAGE);
    http.expectOne(at.tags).flush(await goldenMaster(STORE, 'listImageTagSummaries', ARTIFACTS));
    http
      .expectOne(at.manifests)
      .flush(await goldenMaster(STORE, 'listImageManifestSummaries', ARTIFACTS));
    await opened.settled();
    await expect.element(view.getByRole('table', { name: 'Tags' })).toMatchTextContent('2100.1.0');
  });

  it('keeps the page up when only the image row fails, saying the size is unknown', async () => {
    const opened = await open();
    const at = urls(REPO, IMAGE);
    http.expectOne(at.images).flush(null, { status: 500, statusText: 'Server Error' });
    http.expectOne(at.tags).flush(await goldenMaster(STORE, 'listImageTagSummaries', ARTIFACTS));
    http
      .expectOne(at.manifests)
      .flush(await goldenMaster(STORE, 'listImageManifestSummaries', ARTIFACTS));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view)
      .toMatchTextContent('This image’s counts and total size could not be read');
    await expect.element(view.getByRole('table', { name: 'Tags' })).toMatchTextContent('2100.1.0');
  });

  it('reads all three again on Refresh', async () => {
    const { opened, view } = await render(STORE);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answer(opened, STORE);
  });

  it('leave-artifact-image back: the back link opens the repository’s page', async () => {
    const { opened, view } = await render(STORE);
    await view.getByRole('link', { name: '← Artifacts' }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['leave-artifact-image:back']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/components/${OWNER}/artifacts`,
    );
  });

  it('leave-artifact-image repository: a non-image repository’s note opens its page', async () => {
    const opened = await open('npm');
    await refuse(opened, 400, 'Bad Request', 'npm');
    await page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'Open the repository’s artifacts' })
      .click();
    await leftFor(opened);
    expect(reached()).toEqual(['leave-artifact-image:repository']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/components/${OWNER}/artifacts`,
    );
  });

  it('reads the image on its old address, which names no repository, without a back link', async () => {
    await page.viewport(1140, 900);
    const opened = await openRoute(`/artifacts/repositories/${REPO}/images/${IMAGE}`);
    await answer(opened, STORE);
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('table', { name: 'Tags' })).toBeVisible();
    expect(view.getByRole('link', { name: '← Artifacts' }).query()).toBeNull();
  });
});
