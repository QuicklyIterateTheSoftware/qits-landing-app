import { Location } from '@angular/common';
import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { QITS_LEAVE_APP } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';
import { provideTestPlatformOrigins } from '../../../../../testing/platform-origins';

/** The docs app's page origin, so each row links its reader (configuration, not data). */
const DOCS = 'https://docs.qits.example.test';
/** The idp's, as `provideAppRoute()` gives it, which this spec's origins replace. */
const IDP = 'https://idp.qits.example.test';

const EVERY_KIND = 'a docs catalog of every kind';
const EMPTY = 'an empty docs catalog';
/** A few days after the recorded catalog's newest publication, so "how long ago" is stable. */
const NOW = new Date('2026-01-20T00:00:00Z');

/**
 * Screenshots of a project's Docs page (qits-2318) inside the shell (`openRoute`), at the recorded
 * project's slug (qits-projects' "a project exists"), answered with qits-artifacts' recordings of
 * `listDocsSites`: "a docs catalog of every kind" (a site of each scoped section and two Storybook
 * sites, `@qits/ui-components` and `qits-storybook`; `populated`, and `filtered` at
 * `?section=apidocs`) and "an empty docs catalog" (`empty`), and a read still open (`loading`) or
 * failed (`error`).
 *
 * Its exit (`open-docs-site` `open`), shown by `populated`, is followed once: a row leaves for the
 * site's reader on the docs app, through `QITS_LEAVE_APP` (a spy, so the tab stays).
 */
describe('ProjectDocsPage (screenshots)', () => {
  let http: HttpTestingController;
  const leave = vi.fn<(href: string) => void>();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    leave.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        provideTestPlatformOrigins({}, { idp: IDP, docs: DOCS }),
        { provide: QITS_LEAVE_APP, useValue: leave },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    vi.useRealTimers();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The catalog read. */
  const catalogRead = (): TestRequest => http.expectOne('/artifacts/docs/docs');

  /** The page of the recorded project at `query`, the catalog answered in `state`. */
  async function open(state: string, query = ''): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    const opened = await openRoute((project) => `/projects/${project.slug}/docs${query}`);
    catalogRead().flush(await goldenMaster(state, 'listDocsSites', 'qits-artifacts'));
    await opened.settled();
    return opened;
  }

  /**
   * Makes the viewport as tall as the whole page, so one shot shows every block at each width it
   * is shot at (each is as tall as the viewport, `toMatchScreenshot`). The page is measured at the
   * phone's width, where it is tallest: there the document scrolls and the frame grows with the
   * page (the shell's `<main>` scrolls on its own from 768px up only).
   */
  async function fitWholePage(opened: OpenedRoute) {
    const width = window.innerWidth;
    await page.viewport(390, 844);
    await opened.settled();
    const height = opened.frame.scrollHeight;
    await page.viewport(width, Math.max(height, 900) + 40);
    await opened.settled();
  }

  /** The blocks the page shows, each with its sites' short names, in its order. */
  const shown = (opened: OpenedRoute) =>
    [...opened.page.querySelectorAll('section')].map((section) => [
      section.querySelector('h2')?.textContent?.trim(),
      [...section.querySelectorAll('li a > span:first-child')].map((s) => s.textContent?.trim()),
    ]);

  it('lists every docs site by section, in the sections’ order, each by short name', async () => {
    const opened = await open(EVERY_KIND);
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { name: 'Documentation', exact: true }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('Every docs site the platform publishes');
    expect(shown(opened)).toEqual([
      ['Storybook', ['qits-storybook', 'ui-components']],
      ['API docs', ['qits-ci']],
      ['Userflows', ['qits-events']],
      ['Guides', ['qits-platform']],
      ['Contracts', ['qits-projects']],
      ['Routes', ['qits-landing']],
      ['Changelogs', ['qits-landing-app']],
    ]);
    const apidocs = view.getByRole('list', { name: 'API docs' }).getByRole('listitem');
    await expect.element(apidocs).toMatchTextContent('@apidocs/qits-ci');
    await expect.element(apidocs).toMatchTextContent('2026.112.10000');
    await expect.element(apidocs).toMatchTextContent('3 versions');
    await expect.element(apidocs).toMatchTextContent('6d ago');
    const guides = view.getByRole('list', { name: 'Guides' }).getByRole('listitem');
    await expect.element(guides).toMatchTextContent('1 version');
    await expect
      .element(apidocs.getByRole('link'))
      .toHaveAttribute('href', `${DOCS}/${opened.project.slug}/read/@apidocs/qits-ci`);
    await fitWholePage(opened);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('populated', { kind: 'DATA' });
    await shootShellMenus(opened, 'populated');
  });

  it('keeps one section alone at ?section=', async () => {
    const opened = await open(EVERY_KIND, '?section=apidocs');
    expect(shown(opened)).toEqual([['API docs', ['qits-ci']]]);
    await expect
      .element(page.elementLocator(opened.page).getByRole('link', { name: /^API docs/ }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('filtered', { kind: 'DATA' });
  });

  it('ignores a ?section= naming no section', async () => {
    const opened = await open(EVERY_KIND, '?section=nonsense');
    expect(shown(opened)).toHaveLength(7);
  });

  it('narrows to the names holding ?q=, as a new history entry Back undoes', async () => {
    const opened = await open(EVERY_KIND);
    const location = TestBed.inject(Location);
    const pushed = vi.spyOn(location, 'go');
    const replaced = vi.spyOn(location, 'replaceState');
    const field = page.elementLocator(opened.page).getByRole('searchbox', {
      name: 'Filter docs sites',
    });
    await userEvent.fill(field, 'LANDING');
    await userEvent.keyboard('{Enter}');
    await opened.settled();
    const filtered = `/projects/${opened.project.slug}/docs?q=LANDING`;
    expect(TestBed.inject(Router).url).toBe(filtered);
    expect(shown(opened)).toEqual([
      ['Routes', ['qits-landing']],
      ['Changelogs', ['qits-landing-app']],
    ]);
    // Pushed, not replaced: the unfiltered page stays in the history, where Back returns.
    expect(pushed.mock.calls.map(([path]) => path)).toEqual([filtered]);
    expect(replaced).not.toHaveBeenCalled();
  });

  it('says when no docs site matches, and clears the filters', async () => {
    const opened = await open(EVERY_KIND, '?section=guides&q=landing');
    const view = page.elementLocator(opened.page);
    expect(shown(opened)).toEqual([]);
    await expect.element(view).toMatchTextContent('No docs site matches.');
    await view.getByRole('link', { name: 'Clear filters' }).click();
    await opened.settled();
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/docs`);
    expect(shown(opened)).toHaveLength(7);
  });

  it('says nothing is published yet for an empty catalog', async () => {
    const opened = await open(EMPTY);
    const view = page.elementLocator(opened.page);
    await expect
      .element(view)
      .toMatchTextContent(
        'Nothing is published yet. A release declares { type: docs } to publish here.',
      );
    expect(shown(opened)).toEqual([]);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    await page.viewport(1140, 900);
    const opened = await openRoute((project) => `/projects/${project.slug}/docs`);
    const read = catalogRead();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    read.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('The docs catalog could not be read.');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.settled();
    catalogRead().flush(await goldenMaster(EMPTY, 'listDocsSites', 'qits-artifacts'));
    await opened.settled();
    await expect.element(view).toMatchTextContent('Nothing is published yet.');
  });

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('open-docs-site open: a row leaves for the site’s reader on the docs app, in this tab', async () => {
    const opened = await open(EVERY_KIND);
    const href = `${DOCS}/${opened.project.slug}/read/@apidocs/qits-ci`;
    await userEvent.click(
      page.elementLocator(opened.page).getByRole('list', { name: 'API docs' }).getByRole('link'),
    );
    expect(reached()).toEqual(['open-docs-site:open']);
    expect(leave).toHaveBeenCalledWith(href);
    // The click left through the spy, not the link: the router stays where it was.
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/docs`);
  });
});
