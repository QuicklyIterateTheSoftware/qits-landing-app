import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';

const OCI = 'a mirror holding a pinned and an unpinned tag';
const MAVEN = 'a maven cache holding a cached artifact';
const NPM = 'an npm cache holding a package';
const EMPTY = 'the default caches';
const MIRROR = 'qits-mirror';
const OPERATION = 'listRepositoryPackages';
const DIGEST = 'sha256:555492b05ef577ef6c299325de61258ce08a7d971cfb906d5b9156451dd9b3fe';

/** The packages door of the cache root `name`. */
const packagesOf = (name: string) => `/mirror/api/repositories/${name}/packages`;

/**
 * Screenshots of one cache root's page in the Mirror section (qits-2358) inside the shell
 * (`openRoute`), with no project open, its one read (`listRepositoryPackages`) answered with
 * qits-mirror's recordings: "a mirror holding a pinned and an unpinned tag" (`hub`: `library/node`,
 * two digests tagged; `oci`), "a maven cache holding a cached artifact" (`central`: the Files
 * column; `maven`), "an npm cache holding a package" (`npmjs`: `left-pad`; `npm`) and "the default
 * caches" (`hub`, nothing pulled through; `empty`). All but the npm one are recorded from
 * qits-mirror's qits-2358 release on, and skip themselves on an older pin. An unknown name (`unknown`, a 404), the
 * database not answering (`unavailable`, a 500) and a read still open (`loading`) are statuses only.
 *
 * Its one outcome, choosing a package (`select-mirror-package`, a stay), is followed by the `maven`
 * shot. No recording holds two packages in one root, so the swap of the versions table between
 * packages is the plain spec's. Nothing announces a change to a cache, so Refresh is the only read
 * after the first.
 */
describe('MirrorRepositoryPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  /** Opens the page of the cache root `name`, its read still open. */
  async function open(name: string): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    return openRoute(`/mirror/repositories/${name}`);
  }

  /** Answers the read of the root `name` from `state`'s recording. */
  async function answer(opened: OpenedRoute, name: string, state: string) {
    http.expectOne(packagesOf(name)).flush(await goldenMaster(state, OPERATION, MIRROR));
    await opened.settled();
  }

  /** The page of the root `name`, answered from `state`. */
  async function render(name: string, state: string) {
    const opened = await open(name);
    await answer(opened, name, state);
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** Skips the test while the pinned golden masters do not record `state`'s read. */
  async function recordedOrSkip(state: string, context: { skip: () => void }) {
    // qits-mirror records the state from a later release than the pinned one: until the pin
    // reaches it (and the pact holds it), the reader refuses it and the test skips itself.
    const recorded = await goldenMaster(state, OPERATION, MIRROR).catch(() => undefined);
    if (!recorded) context.skip();
  }

  it('shows an OCI root’s images, their digests shortened and tags as chips, and the pin rule', async (context) => {
    await recordedOrSkip(OCI, context);
    const { opened, view } = await render('hub', OCI);
    await expect.element(view.getByRole('heading', { name: 'hub', exact: true })).toBeVisible();
    await expect.element(view).toMatchTextContent('oci-mirror');
    await expect.element(view).toMatchTextContent('a cache of docker.io');
    await expect.element(view).toMatchTextContent('1 image · 2 cached versions · 800 B');
    await expect
      .element(view)
      .toMatchTextContent('Entries unused for 30 days are evicted by the next sweep.');
    await expect
      .element(view)
      .toMatchTextContent('A tag that an image pin from qits-maintenance names is kept');
    const packages = view.getByRole('table', { name: 'Packages' });
    await expect.element(packages).toMatchTextContent('library/node');
    const versions = view.getByRole('table', { name: 'Versions' });
    await expect.element(versions).toMatchTextContent('sha256:555492b05ef5');
    await expect.element(versions).toMatchTextContent('24-alpine');
    await expect.element(versions).toMatchTextContent('22-alpine');
    expect(versions.element().textContent).not.toContain(DIGEST);
    expect(versions.element().querySelector(`[title="${DIGEST}"]`)).not.toBeNull();
    expect(versions.element().textContent).not.toContain('Files');
    // The root sidebar's Mirror stays current below the section.
    await expect
      .element(
        page
          .elementLocator(opened.frame)
          .getByRole('navigation', { name: 'qits' })
          .getByRole('link', { name: 'Mirror', exact: true }),
      )
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('oci', { kind: 'DATA' });
    await shootShellMenus(opened, 'oci');
  });

  it('select-mirror-package selected: a maven root’s coordinate shows its versions with their files', async (context) => {
    await recordedOrSkip(MAVEN, context);
    const { opened, view } = await render('central', MAVEN);
    await expect.element(view).toMatchTextContent('1 coordinate · 1 cached version · 160 B');
    await expect
      .element(view)
      .toMatchTextContent('Entries unused for 90 days are evicted by the next sweep.');
    const coordinate = view.getByRole('button', { name: 'org.example:contract-library' });
    await expect.element(coordinate).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(coordinate);
    await opened.settled();
    expect(reached()).toEqual(['select-mirror-package:selected']);
    await expect.element(coordinate).toHaveAttribute('aria-pressed', 'true');
    const versions = view.getByRole('table', { name: 'Versions' });
    await expect.element(versions).toMatchTextContent('Files');
    await expect.element(versions).toMatchTextContent('1.0.0');
    const titles = [...versions.element().querySelectorAll('td[title]')].map((cell) =>
      cell.getAttribute('title'),
    );
    expect(titles).toContain('contract-library-1.0.0.jar\ncontract-library-1.0.0.pom');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('maven', { kind: 'DATA' });
  });

  it('shows an npm root’s packages with their dist-tags', async () => {
    const { opened, view } = await render('npmjs', NPM);
    await expect.element(view).toMatchTextContent('npm-proxy');
    await expect.element(view).toMatchTextContent('a cache of https://registry.npmjs.org');
    await expect.element(view).toMatchTextContent('1 package · 1 cached version · 70 B');
    await expect
      .element(view.getByRole('table', { name: 'Packages' }))
      .toMatchTextContent('left-pad');
    await expect
      .element(view.getByRole('table', { name: 'Versions' }))
      .toMatchTextContent('latest');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('npm', { kind: 'DATA' });
  });

  it('narrows the packages by name, and says so when none matches', async () => {
    const { opened, view } = await render('npmjs', NPM);
    const search = view.getByRole('searchbox', { name: 'Search packages' });
    await userEvent.fill(search, 'LEFT');
    await opened.settled();
    expect(view.getByRole('table', { name: 'Packages' }).getByRole('row').elements()).toHaveLength(
      2,
    );
    await userEvent.fill(search, 'nothing-like-it');
    await opened.settled();
    expect(view.getByRole('table').elements()).toHaveLength(0);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('No packages match “nothing-like-it”.');
  });

  it('says nothing is cached in a root nobody has pulled through', async (context) => {
    await recordedOrSkip(EMPTY, context);
    const { opened, view } = await render('hub', EMPTY);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('Nothing is cached in hub yet. It fills as clients pull through it.');
    await expect.element(view).toMatchTextContent('0 images · 0 cached versions · 0 B');
    expect(view.getByRole('table').elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('says the mirror has no cache root of an unknown name, with no Retry', async () => {
    const opened = await open('nope');
    http.expectOne(packagesOf('nope')).flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('The mirror has no cache root called nope.');
    expect(view.getByRole('button', { name: 'Retry' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unknown', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says the contents cannot be read, with Retry', async () => {
    const opened = await open('npmjs');
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    http
      .expectOne(packagesOf('npmjs'))
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    await opened.settled();
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(view)
      .toMatchTextContent('This cache’s contents cannot be read right now.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answer(opened, 'npmjs', NPM);
    await expect
      .element(view.getByRole('table', { name: 'Packages' }))
      .toMatchTextContent('left-pad');
  });

  it('reads the packages again on Refresh', async () => {
    const { opened, view } = await render('npmjs', NPM);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answer(opened, 'npmjs', NPM);
    await expect
      .element(view.getByRole('table', { name: 'Packages' }))
      .toMatchTextContent('left-pad');
  });
});
