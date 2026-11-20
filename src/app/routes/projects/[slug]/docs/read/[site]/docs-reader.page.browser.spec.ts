import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { QITS_LEAVE_APP } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { provideQitsMermaid } from '@qits/ui-components/mermaid';
import { page, userEvent } from 'vitest/browser';
import { client as artifactsClient } from '../../../../../../api/artifacts/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { goldenMaster, goldenMasterText } from '../../../../../../../testing/browser/golden-master';
import { leftFor } from '../../../../../../../testing/browser/contracts-bundles';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';

/** The docs app's page origin, for the Storybook notice's link (configuration, not data). */
const DOCS = 'https://docs.qits.example.test';
/** The idp's, as `provideAppRoute()` gives it, which this spec's origins replace. */
const IDP = 'https://idp.qits.example.test';

const MARKDOWN = 'a published markdown docs bundle';
const APIDOCS = 'a published apidocs bundle';
const CHANGELOG = 'a repository with published changelogs';
const EVERY_KIND = 'a docs catalog of every kind';
const HANDOFFS = 'a docs catalog naming contract repositories';
const TWO_PROJECTS = 'two projects exist';
const THREE_REPOSITORIES = 'a project with 3 repositories';

const DOCS_STORE = '/artifacts/docs/docs';

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

/** A site as this app's links name it: one segment, its `/` escaped, `@` literal. */
const segment = (site: string) => encodeURIComponent(site).replace(/%40/g, '@');

/**
 * Screenshots of the docs reader (qits-2337) inside the shell (`openRoute`), at the recorded
 * project's slug, each body against qits-artifacts' recordings:
 *
 * - `userflows`: "a published markdown docs bundle" (`@userflows/contract-userflows`, two versions
 *   on `main` and `feature/other`), its newest of `main` read in place; its file list's four pages,
 *   the one the state records (`alpha/first-story/user-story.md`, with a mermaid fence and a
 *   relative screenshot) answered with its text, the other three refused (an error answer is only
 *   a status), each saying it could not be read in its place; `category` at `?category=alpha`.
 * - `changelog`: "a repository with published changelogs" (`@changelog/contract-repository`).
 * - `apidocs`: "a published apidocs bundle", its `openapi.yml` drawn by swagger-ui.
 * - `contracts`: `@contracts/qits-ci` in "a docs catalog of every kind", whose newest version
 *   `qits-ci-service` published, one of qits-projects' "two projects exist" repositories; and
 *   `routes`: `@routes/contract-frontend` in "a docs catalog naming contract repositories", handed
 *   to `contract-frontend` of "a project with 3 repositories" (the providers' ids are unrelated:
 *   the repositories are answered under the open project's id).
 * - `storybook`: `@qits/ui-components` in the same catalog, the docs app's notice.
 * - `unknown` (the versions refused with 404), `unknown-version` (the version refused with 404),
 *   `loading` and `error`.
 *
 * Its exits are followed once each: “← Docs” (`leave-docs-site` `docs`), a Branch pick
 * (`pick-docs-version` `version`), an unknown version's newest (`leave-docs-site` `newest`), the
 * hand-offs (`open-docs-handoff` `contracts`, `builder`) and the Storybook link (`storybook`,
 * through `QITS_LEAVE_APP`, a spy).
 */
describe('DocsReaderPage (screenshots)', () => {
  let http: HttpTestingController;
  const leave = vi.fn<(href: string) => void>();

  beforeEach(() => {
    leave.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        provideTestPlatformOrigins({}, { idp: IDP, docs: DOCS }),
        { provide: QITS_LEAVE_APP, useValue: leave },
        // The stories' diagrams drawn, as `app.config.ts` provides it (configuration, not data).
        provideQitsMermaid(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The reader of `site` (and `version`) at `query`, its reads still open. */
  async function open(site: string, query = '', version?: string): Promise<OpenedRoute> {
    await page.viewport(1140, 1000);
    const at = version ? `/-/${encodeURIComponent(version)}` : '';
    return openRoute(
      (project) => `/projects/${project.slug}/docs/read/${segment(site)}${at}${query}`,
    );
  }

  /** The recorded site and version of `state`'s `getDocsVersion`. */
  async function bundleOf(state: string) {
    const detail = await goldenMaster(state, 'getDocsVersion', 'qits-artifacts');
    return { site: detail.name as string, version: detail.version as string };
  }

  /** Answers a Markdown bundle's reads: its versions, the version, and each page. */
  async function markdown(opened: OpenedRoute, state: string) {
    const { site, version } = await bundleOf(state);
    http
      .expectOne(`${DOCS_STORE}/${site}`)
      .flush(await goldenMaster(state, 'listDocsVersions', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne(`${DOCS_STORE}/${site}/-/${version}`)
      .flush(await goldenMaster(state, 'getDocsVersion', 'qits-artifacts'));
    await opened.settled();
    const text = await goldenMasterText(state, 'getDocsFile', 'qits-artifacts');
    for (const request of http.match((req) => req.url.startsWith(`${DOCS_STORE}/${site}/-/`))) {
      if (request.request.url.endsWith('/alpha/first-story/user-story.md')) request.flush(text);
      // The pages no recording holds: refused, each says so in its place.
      else request.flush(null, { status: 404, statusText: 'Not Found' });
    }
    await opened.settled();
    return { site, version };
  }

  /** The stories the page shows, by path. */
  const stories = (opened: OpenedRoute) =>
    [...opened.page.querySelectorAll('[data-story]')].map((s) => s.getAttribute('data-story'));

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('reads a userflows site’s newest of main in place: every story, the legend and a diagram', async () => {
    const opened = await open('@userflows/contract-userflows');
    const { version } = await markdown(opened, MARKDOWN);
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { level: 1 }))
      .toHaveTextContent('contract-userflows');
    expect(stories(opened)).toEqual([
      'README.md',
      'alpha/first-story/user-story.md',
      'beta/second-story/user-story.md',
      'third-story/user-story.md',
    ]);
    // The legend, the recorded story by its own title.
    const legend = view.getByRole('navigation', { name: 'Stories' });
    await expect.element(legend.getByRole('link', { name: 'First story' })).toBeVisible();
    await expect.element(view.getByText('This page could not be read.').first()).toBeVisible();
    // The Version select shows main's versions, the newest read; the Branch select both branches.
    const versions = view.getByRole('combobox', { name: 'Version' });
    await expect.element(versions).toHaveValue(version);
    await expect.element(view.getByRole('combobox', { name: 'Branch' })).toHaveValue('main');
    // The relative screenshot is the docs store's file beside the story.
    const image = opened.page.querySelector('img[alt="screenshot"]');
    expect(image?.getAttribute('src') ?? '').toContain(`/alpha/first-story/screenshot.png`);
    await vi.waitFor(() =>
      expect(opened.page.querySelector('qits-mermaid-diagram svg')).not.toBeNull(),
    );
    // The sidebar's Docs entry stays current.
    await expect
      .element(page.getByRole('navigation', { name: 'qits' }).getByRole('link', { name: 'Docs' }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('userflows', { kind: 'DATA' });
    await shootShellMenus(opened, 'userflows');
  });

  it('keeps one category’s stories at ?category=', async () => {
    const opened = await open('@userflows/contract-userflows', '?category=alpha');
    await markdown(opened, MARKDOWN);
    expect(stories(opened)).toEqual(['alpha/first-story/user-story.md']);
    const view = page.elementLocator(opened.page);
    await expect
      .element(
        view.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: 'alpha' }),
      )
      .toHaveAttribute('aria-current', 'true');
    // One story: no legend.
    expect(opened.page.querySelector('nav[aria-label="Stories"]')).toBeNull();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('category', { kind: 'DATA' });
  });

  it('pick-docs-version version: a Branch pick reads that branch’s newest, keeping the category', async () => {
    const opened = await open('@userflows/contract-userflows', '?category=alpha');
    await markdown(opened, MARKDOWN);
    const versions = await goldenMaster(MARKDOWN, 'listDocsVersions', 'qits-artifacts');
    const other = versions.versions.find(
      (v: { metadata: Record<string, string> }) => v.metadata['git.branch.name'] !== 'main',
    );
    await userEvent.selectOptions(
      page.elementLocator(opened.page).getByRole('combobox', { name: 'Branch' }),
      other.metadata['git.branch.name'],
    );
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/docs/read/${segment(versions.name)}/-/${other.version}?category=alpha`,
    );
    expect(reached()).toEqual(['pick-docs-version:version']);
  });

  it('reads a changelog’s one page, with no chips and no legend', async () => {
    const { site, version } = await bundleOf(CHANGELOG);
    const opened = await open(site);
    http
      .expectOne(`${DOCS_STORE}/${site}`)
      .flush(await goldenMaster(CHANGELOG, 'listDocsVersions', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne(`${DOCS_STORE}/${site}/-/${version}`)
      .flush(await goldenMaster(CHANGELOG, 'getDocsVersion', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne(`${DOCS_STORE}/${site}/-/${version}/CHANGELOG.md`)
      .flush(await goldenMasterText(CHANGELOG, 'getDocsFile', 'qits-artifacts'));
    await opened.settled();
    expect(stories(opened)).toEqual(['CHANGELOG.md']);
    expect(opened.page.querySelector('nav[aria-label="Stories"]')).toBeNull();
    expect(opened.page.querySelector('nav[aria-label="Categories"]')?.className).toContain(
      'hidden',
    );
    // Not userflows: no Branch select.
    expect(opened.page.querySelector('select[aria-label="Branch"]')).toBeNull();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('changelog', { kind: 'DATA' });
  });

  it('draws an apidocs site’s OpenAPI document with swagger-ui, without Try it out', async () => {
    const { site, version } = await bundleOf(APIDOCS);
    const opened = await open(site);
    http
      .expectOne(`${DOCS_STORE}/${site}`)
      .flush(await goldenMaster(APIDOCS, 'listDocsVersions', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne(`${DOCS_STORE}/${site}/-/${version}`)
      .flush(await goldenMaster(APIDOCS, 'getDocsVersion', 'qits-artifacts'));
    await opened.settled();
    http
      .expectOne(`${DOCS_STORE}/${site}/-/${version}/openapi.yml`)
      .flush(await goldenMasterText(APIDOCS, 'getDocsFile', 'qits-artifacts'));
    await opened.settled();
    // swagger-ui loads lazily, then fetches the document from its blob: URL.
    await vi.waitFor(() => expect(opened.page.textContent).toContain('Lists the things'), {
      timeout: 10_000,
    });
    expect(opened.page.querySelector('.try-out__btn')).toBeNull();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('apidocs', { kind: 'DATA' });
  });

  /** A hand-off's reads: the catalog of `catalog`, the project's repositories of `repositories`. */
  async function handOff(site: string, catalog: string, repositories?: string) {
    const opened = await open(site);
    http
      .expectOne(DOCS_STORE)
      .flush(await goldenMaster(catalog, 'listDocsSites', 'qits-artifacts'));
    if (repositories) {
      http
        .expectOne(`/projects/api/projects/${opened.project.id}/repositories`)
        .flush(await goldenMaster(repositories, 'listProjectRepositories'));
    }
    await opened.settled();
    return opened;
  }

  it('hands a contracts site to its repository’s Contracts page', async () => {
    const opened = await handOff('@contracts/qits-ci', EVERY_KIND, TWO_PROJECTS);
    const view = page.elementLocator(opened.page);
    await expect
      .element(view)
      .toMatchTextContent('Contracts are read on qits-ci-service’s Contracts page.');
    // A hand-off reads no version: no Version select.
    expect(opened.page.querySelector('select')).toBeNull();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('contracts', { kind: 'DATA' });
  });

  it('open-docs-handoff contracts: the hand-off opens the repository’s Contracts page', async () => {
    const opened = await handOff('@contracts/qits-ci', EVERY_KIND, TWO_PROJECTS);
    await page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'Open the Contracts page' })
      .click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/qits-ci-service/contracts`,
    );
    expect(reached()).toEqual(['open-docs-handoff:contracts']);
  });

  it('says a site whose publisher is not the project’s names no repository of it', async () => {
    const opened = await handOff('@routes/qits-landing', EVERY_KIND, TWO_PROJECTS);
    await expect
      .element(page.elementLocator(opened.page))
      .toMatchTextContent('@routes/qits-landing names no repository of this project.');
  });

  it('hands a routes site to its repository’s UI builder', async () => {
    const opened = await handOff('@routes/contract-frontend', HANDOFFS, THREE_REPOSITORIES);
    await expect
      .element(page.elementLocator(opened.page))
      .toMatchTextContent('Routes are explored in contract-frontend’s UI builder.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('routes', { kind: 'DATA' });
  });

  it('open-docs-handoff builder: the hand-off opens the repository’s UI builder', async () => {
    const opened = await handOff('@routes/contract-frontend', HANDOFFS, THREE_REPOSITORIES);
    await page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'Open in the UI builder' })
      .click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/contract-frontend/ui-builder`,
    );
    expect(reached()).toEqual(['open-docs-handoff:builder']);
  });

  it('says Storybook is the docs app’s, and open-docs-handoff storybook leaves for it', async () => {
    const opened = await handOff('@qits/ui-components', EVERY_KIND);
    const view = page.elementLocator(opened.page);
    await expect
      .element(view)
      .toMatchTextContent('Storybook is served whole by the docs app, on the private network.');
    expect(opened.page.querySelector('iframe')).toBeNull();
    const href = `${DOCS}/${opened.project.slug}/read/@qits/ui-components`;
    const link = view.getByRole('link', { name: /in the docs app/ });
    await expect.element(link).toHaveAttribute('href', href);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('storybook', { kind: 'DATA' });
    await userEvent.click(link);
    expect(reached()).toEqual(['open-docs-handoff:storybook']);
    expect(leave).toHaveBeenCalledWith(href);
  });

  it('says there is no such site, with a link back to Docs', async () => {
    const opened = await open('@userflows/no-such-site');
    http
      .expectOne(`${DOCS_STORE}/@userflows/no-such-site`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('No docs site @userflows/no-such-site.');
    await expect.element(view.getByRole('link', { name: 'Back to Docs' })).toBeVisible();
    expect(opened.page.querySelector('[role="alert"]')?.closest('.hidden')).not.toBeNull();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unknown', { kind: 'NO_DATA' });
  });

  it('leave-docs-site docs: “← Docs” goes back to the project’s Docs page', async () => {
    const opened = await open('@userflows/no-such-site');
    http
      .expectOne(`${DOCS_STORE}/@userflows/no-such-site`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    await page.elementLocator(opened.page).getByRole('link', { name: '← Docs' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/docs`);
    expect(reached()).toEqual(['leave-docs-site:docs']);
  });

  it('says the site has no such version, linking its newest (leave-docs-site newest)', async () => {
    const site = '@userflows/contract-userflows';
    const opened = await open(site, '', 'no-such-version');
    // Both reads start at once: the URL names the version.
    http
      .expectOne(`${DOCS_STORE}/${site}`)
      .flush(await goldenMaster(MARKDOWN, 'listDocsVersions', 'qits-artifacts'));
    http
      .expectOne(`${DOCS_STORE}/${site}/-/no-such-version`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent(`${site} has no version no-such-version.`);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unknown-version', { kind: 'NO_DATA' });
    await shootShellMenus(opened, 'unknown-version', 'NO_DATA');
    await view.getByRole('link', { name: 'Read the newest' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/docs/read/${segment(site)}`,
    );
    expect(reached()).toEqual(['leave-docs-site:newest']);
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const site = '@userflows/contract-userflows';
    const opened = await open(site);
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    http
      .expectOne(`${DOCS_STORE}/${site}`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('This site’s versions could not be read.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.settled();
    http.expectOne(`${DOCS_STORE}/${site}`).flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    await expect.element(view).toMatchTextContent(`No docs site ${site}.`);
  });
});
