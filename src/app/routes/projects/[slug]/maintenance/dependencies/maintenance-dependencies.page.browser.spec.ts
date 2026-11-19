import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of the Maintenance section's Dependencies page inside the shell (`openRoute`), at the
 * recorded project's slug (qits-projects' "a project exists", id `…0001`).
 *
 * `listRepositories` and `listDependencies` (`?kind=INTERNAL`, `?kind=EXTERNAL`) are answered from
 * qits-maintenance's golden masters: "dependencies of a project, some behind" (the repositories:
 * contract-frontend and contract-service in the open project, other-project-service in another;
 * the internal dependencies: `@qits/ui-components` behind in contract-frontend, the eventstream
 * current in contract-service and other-project-service), "external dependencies of a project,
 * some behind" (`rxjs` behind, `left-pad` with no latest and an error, `quarkus-bom` behind only in
 * the other project), and "no dependencies" / "no external dependencies" (an empty inventory). A
 * refusal is a 403 with no body, as the service answers a credential without a staff role.
 *
 * The name search (qits-2331) is answered from the states recorded with its globs: `*p*` matches
 * ("dependencies matching a glob, some behind": the repositories, contract-tooling among the open
 * project's, and `@qits/ui-components` behind; "external dependencies matching a glob, some
 * behind": `typescript` behind in contract-tooling, `quarkus-bom` current here and behind only in
 * the other project, `left-pad` with no latest and an error) and `nothing-matches-*` matches
 * nothing ("no dependencies matching a glob", "no external dependencies matching a glob").
 */
describe('MaintenanceDependenciesPage (screenshots)', () => {
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

  const SOME_BEHIND = 'dependencies of a project, some behind';
  const EXTERNAL_SOME_BEHIND = 'external dependencies of a project, some behind';
  const NONE = 'no dependencies';
  const NO_EXTERNAL = 'no external dependencies';
  const MATCHING = 'dependencies matching a glob, some behind';
  const EXTERNAL_MATCHING = 'external dependencies matching a glob, some behind';
  const NONE_MATCHING = 'no dependencies matching a glob';
  const NO_EXTERNAL_MATCHING = 'no external dependencies matching a glob';
  const REPOSITORIES = '/maintenance/api/repositories';
  const DEPENDENCIES = '/maintenance/api/dependencies';

  /** The `kind` a dependencies read asks for: the client writes the query into the URL. */
  const kindOf = (read: TestRequest) =>
    new URL(read.request.urlWithParams, 'http://x').searchParams.get('kind');

  /** The `name` a dependencies read searches for, `null` when it searches nothing. */
  const nameOf = (read: TestRequest) =>
    new URL(read.request.urlWithParams, 'http://x').searchParams.get('name');

  /**
   * The open reads of the page, taken off the controller (`match` hands each request out once):
   * the repositories read and the dependencies reads by kind.
   */
  function openReads() {
    const open = http
      .match((request) => request.url.startsWith('/maintenance/api/'))
      .filter((request) => !request.cancelled);
    const at = (url: string) => open.filter((read) => read.request.url.split('?')[0] === url);
    const dependencies = at(DEPENDENCIES);
    return {
      repositories: at(REPOSITORIES),
      dependencies,
      kinds: dependencies.map(kindOf).sort((a, b) => (a ?? '').localeCompare(b ?? '')),
      ofKind: (kind: 'INTERNAL' | 'EXTERNAL') => dependencies.filter((r) => kindOf(r) === kind),
    };
  }

  /**
   * Answers the three open reads with the recorded `repositories`, `internal` and `external`, after
   * checking both dependencies reads search for `name` (`null`, the default: no `name` at all).
   */
  async function answer(
    opened: { settled(): Promise<void> },
    states: { repositories: string; internal: string; external: string },
    name: string | null = null,
  ) {
    const open = openReads();
    expect(open.repositories).toHaveLength(1);
    expect(open.kinds).toEqual(['EXTERNAL', 'INTERNAL']);
    expect(open.dependencies.map(nameOf)).toEqual([name, name]);
    open.repositories[0].flush(
      await goldenMaster(states.repositories, 'listRepositories', 'qits-maintenance'),
    );
    open
      .ofKind('INTERNAL')[0]
      .flush(await goldenMaster(states.internal, 'listDependencies', 'qits-maintenance'));
    open
      .ofKind('EXTERNAL')[0]
      .flush(await goldenMaster(states.external, 'listDependencies', 'qits-maintenance'));
    await opened.settled();
  }

  const POPULATED = {
    repositories: SOME_BEHIND,
    internal: SOME_BEHIND,
    external: EXTERNAL_SOME_BEHIND,
  };
  const EMPTY = { repositories: NONE, internal: NONE, external: NO_EXTERNAL };
  const SEARCHED = { repositories: MATCHING, internal: MATCHING, external: EXTERNAL_MATCHING };
  const NO_MATCH = {
    repositories: NONE_MATCHING,
    internal: NONE_MATCHING,
    external: NO_EXTERNAL_MATCHING,
  };

  /**
   * Answers the two open dependencies reads alone (a new search reads no repositories again), after
   * checking each carries `name` (`null`: no `name` at all).
   */
  async function answerDependencies(
    opened: { settled(): Promise<void> },
    name: string | null,
    states: { internal: string; external: string },
  ) {
    const open = openReads();
    expect(open.repositories).toHaveLength(0);
    expect(open.kinds).toEqual(['EXTERNAL', 'INTERNAL']);
    expect(open.dependencies.map(nameOf)).toEqual([name, name]);
    open
      .ofKind('INTERNAL')[0]
      .flush(await goldenMaster(states.internal, 'listDependencies', 'qits-maintenance'));
    open
      .ofKind('EXTERNAL')[0]
      .flush(await goldenMaster(states.external, 'listDependencies', 'qits-maintenance'));
    await opened.settled();
  }

  /** Opens the page at `query`, tall enough for every row (a screenshot shows the viewport only). */
  async function render(query = '') {
    await page.viewport(1140, 1000);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/maintenance/dependencies${query}`,
    );
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** The page with the populated inventory answered. */
  async function loaded(query = '') {
    const rendered = await render(query);
    await answer(rendered.opened, POPULATED);
    return rendered;
  }

  const section = (view: ReturnType<typeof page.elementLocator>, name: 'Internal' | 'External') =>
    view.getByRole('region', { name: new RegExp(`^${name}`) });
  /** A section's dependencies, one row each (their pins are list items of their own). */
  const entries = (view: ReturnType<typeof page.elementLocator>, name: 'Internal' | 'External') => {
    const list = view.getByRole('list', { name: `${name} dependencies` }).element();
    return [...list.querySelectorAll<HTMLElement>(':scope > li')].map((row) =>
      page.elementLocator(row),
    );
  };

  it('shows the project’s internal and external pins, behind ones first, counted', async () => {
    const { opened, view } = await loaded();
    const internal = section(view, 'Internal');
    const external = section(view, 'External');
    await expect
      .element(internal.getByRole('heading'))
      .toMatchTextContent(/Internal\s*2 dependencies · 1 behind/);
    await expect
      .element(external.getByRole('heading'))
      .toMatchTextContent(/External\s*3 dependencies · 1 behind/);

    // Behind first: `@qits/ui-components` (behind) above the eventstream (current).
    const internalRows = entries(view, 'Internal');
    expect(internalRows).toHaveLength(2);
    await expect.element(internalRows[0]).toMatchTextContent('@qits/ui-components');
    await expect.element(internalRows[0]).toMatchTextContent('contract-frontend');
    await expect.element(internalRows[0]).toMatchTextContent('2026.8.1');
    await expect.element(internalRows[0]).toMatchTextContent('package.json');
    await expect.element(internalRows[0]).toMatchTextContent('latest 2026.9.1');
    await expect.element(internalRows[0].getByText('behind', { exact: true })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.page).getByText('eu.wohlben.qits:qits-eventstream'))
      .toBeVisible();

    // Behind first, then by name: rxjs; then quarkus-bom (behind only in the other project) and
    // left-pad, by name.
    const externalRows = entries(view, 'External');
    expect(externalRows).toHaveLength(3);
    await expect.element(externalRows[0]).toMatchTextContent('rxjs');
    await expect.element(externalRows[1]).toMatchTextContent('io.quarkus.platform:quarkus-bom');
    await expect.element(externalRows[1].getByText('behind', { exact: true })).not.toBeVisible();
    await expect.element(externalRows[2]).toMatchTextContent('left-pad');
    await expect.element(externalRows[2]).toMatchTextContent('latest unknown');
    await expect.element(externalRows[2]).toMatchTextContent('the packument lists no versions');

    // Only the open project's pins: other-project-service is someone else's.
    expect(opened.page.textContent).not.toContain('other-project-service');
    expect(opened.page.textContent).not.toContain('3.30.1');

    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('asks for the dependencies of each kind, never the bare listing', async () => {
    const { opened } = await render();
    const open = openReads();
    expect(open.kinds).toEqual(['EXTERNAL', 'INTERNAL']);
    expect(open.dependencies.every((read) => kindOf(read) !== null)).toBe(true);
    open.repositories[0]?.flush(
      await goldenMaster(SOME_BEHIND, 'listRepositories', 'qits-maintenance'),
    );
    open
      .ofKind('INTERNAL')[0]
      ?.flush(await goldenMaster(SOME_BEHIND, 'listDependencies', 'qits-maintenance'));
    open
      .ofKind('EXTERNAL')[0]
      ?.flush(await goldenMaster(EXTERNAL_SOME_BEHIND, 'listDependencies', 'qits-maintenance'));
    await opened.settled();
  });

  it('Only behind puts behind=true in the URL and hides the current pins', async () => {
    const { opened, view } = await loaded();
    await userEvent.click(view.getByRole('checkbox', { name: 'Only behind' }));
    await opened.idle();
    expect(TestBed.inject(Router).url).toContain('behind=true');
    // The toggle filters what was read: it reads nothing again.
    const open = openReads();
    expect(open.repositories).toHaveLength(0);
    expect(open.dependencies).toHaveLength(0);
    const internalRows = entries(view, 'Internal');
    expect(internalRows).toHaveLength(1);
    await expect.element(internalRows[0]).toMatchTextContent('@qits/ui-components');
    await expect.element(internalRows[0]).toMatchTextContent('contract-frontend');
    const externalRows = entries(view, 'External');
    expect(externalRows).toHaveLength(1);
    await expect.element(externalRows[0]).toMatchTextContent('rxjs');
    expect(opened.page.textContent).not.toContain('left-pad');
    // The counts stay the section's own.
    await expect
      .element(section(view, 'External').getByRole('heading'))
      .toMatchTextContent('3 dependencies · 1 behind');
  });

  it('opens with behind=true showing only the behind pins', async () => {
    const { view } = await loaded('?behind=true');
    await expect.element(view.getByRole('checkbox', { name: 'Only behind' })).toBeChecked();
    expect(entries(view, 'Internal')).toHaveLength(1);
    expect(entries(view, 'External')).toHaveLength(1);
  });

  it('Refresh reads the repositories and both kinds again', async () => {
    const { opened, view } = await loaded();
    await userEvent.click(view.getByRole('button', { name: 'Refresh' }));
    await opened.idle();
    // `answer` checks the repositories and both kinds are open again.
    await answer(opened, POPULATED);
  });

  it('opens the section’s address on the Dependencies page, keeping the query', async () => {
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/maintenance?behind=true`,
    );
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/maintenance/dependencies?behind=true`,
    );
    await answer(opened, POPULATED);
  });

  it('says nothing of the project has been scanned when no repository pins anything', async () => {
    const { opened, view } = await render();
    await answer(opened, EMPTY);
    await expect.element(view).toMatchTextContent('Nothing of this project has been scanned yet');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says a refusal needs a staff role', async () => {
    const { opened, view } = await render();
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    const open = openReads();
    for (const read of [...open.repositories, ...open.dependencies])
      read.flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading dependencies needs a staff role');
    // The refusal stands alone: no generic failure, and no empty page.
    await expect.element(view.getByText(/could not be read/)).not.toBeVisible();
    await expect.element(view.getByText(/Nothing of this project/)).not.toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  const searchbox = (view: ReturnType<typeof page.elementLocator>) =>
    view.getByRole('searchbox', { name: 'Dependency name' });

  it('opens a searched link with the glob in the box and in both reads, counted with it', async () => {
    const { opened, view } = await render('?name=*p*');
    await expect.element(searchbox(view)).toHaveValue('*p*');
    // Both kinds carry the glob; the repositories read is the unsearched one.
    await answer(opened, SEARCHED, '*p*');

    await expect
      .element(section(view, 'Internal').getByRole('heading'))
      .toMatchTextContent(/Internal\s*1 dependency · 1 behind matching "\*p\*"/);
    await expect
      .element(section(view, 'External').getByRole('heading'))
      .toMatchTextContent(/External\s*3 dependencies · 1 behind matching "\*p\*"/);
    const internalRows = entries(view, 'Internal');
    expect(internalRows).toHaveLength(1);
    await expect.element(internalRows[0]).toMatchTextContent('@qits/ui-components');
    // Behind first (typescript, in contract-tooling), then by name; the page filters no name
    // itself: it shows what the service matched.
    const externalRows = entries(view, 'External');
    expect(externalRows).toHaveLength(3);
    await expect.element(externalRows[0]).toMatchTextContent('typescript');
    await expect.element(externalRows[0]).toMatchTextContent('contract-tooling');
    await expect.element(externalRows[1]).toMatchTextContent('io.quarkus.platform:quarkus-bom');
    await expect.element(externalRows[2]).toMatchTextContent('left-pad');
    await expect.element(externalRows[2]).toMatchTextContent('the packument lists no versions');
    expect(opened.page.textContent).not.toContain('other-project-service');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('searched', { kind: 'DATA' });
  });

  it('a search pushes the trimmed glob into the URL and reads both kinds with it', async () => {
    const { opened, view } = await loaded();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');
    await userEvent.fill(searchbox(view), '  *p*  ');
    await userEvent.click(view.getByRole('button', { name: 'Search' }));
    await opened.idle();
    expect(router.parseUrl(router.url).queryParams).toEqual({ name: '*p*' });
    // A new history entry, so Back is the previous search.
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { name: '*p*' } }),
    );
    expect(navigate.mock.calls.at(-1)?.[1]?.replaceUrl).toBeUndefined();
    await answerDependencies(opened, '*p*', {
      internal: MATCHING,
      external: EXTERNAL_MATCHING,
    });
    await expect
      .element(section(view, 'External').getByRole('heading'))
      .toMatchTextContent('matching "*p*"');
  });

  it('a blank search removes the glob and reads both kinds without it', async () => {
    const { opened, view } = await render('?name=*p*');
    await answer(opened, SEARCHED, '*p*');
    await userEvent.fill(searchbox(view), '   ');
    await userEvent.click(view.getByRole('button', { name: 'Search' }));
    await opened.idle();
    expect(TestBed.inject(Router).parseUrl(TestBed.inject(Router).url).queryParams).toEqual({});
    await answerDependencies(opened, null, {
      internal: SOME_BEHIND,
      external: EXTERNAL_SOME_BEHIND,
    });
    await expect
      .element(section(view, 'Internal').getByRole('heading'))
      .not.toMatchTextContent('matching');
  });

  it('says what matched nothing per section, never that nothing has been scanned', async () => {
    const { opened, view } = await render('?name=nothing-matches-*');
    await answer(opened, NO_MATCH, 'nothing-matches-*');
    await expect
      .element(section(view, 'Internal'))
      .toMatchTextContent('No internal dependency matches "nothing-matches-*".');
    await expect
      .element(section(view, 'External'))
      .toMatchTextContent('No external dependency matches "nothing-matches-*".');
    await expect
      .element(section(view, 'External').getByRole('heading'))
      .toMatchTextContent('0 dependencies · 0 behind matching "nothing-matches-*"');
    await expect.element(view.getByText(/Nothing of this project/)).not.toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('no-match', { kind: 'NO_DATA' });

    // Only behind composes with the search: it keeps the glob and reads nothing again.
    await userEvent.click(view.getByRole('checkbox', { name: 'Only behind' }));
    await opened.idle();
    const router = TestBed.inject(Router);
    expect(router.parseUrl(router.url).queryParams).toEqual({
      name: 'nothing-matches-*',
      behind: 'true',
    });
    expect(openReads().dependencies).toHaveLength(0);
    await expect
      .element(section(view, 'Internal'))
      .toMatchTextContent('No internal pin matching "nothing-matches-*" is behind.');
  });

  it('opens a searched link with Only behind showing only the matching behind pins', async () => {
    const { opened, view } = await render('?name=*p*&behind=true');
    await expect.element(view.getByRole('checkbox', { name: 'Only behind' })).toBeChecked();
    await answer(opened, SEARCHED, '*p*');
    expect(entries(view, 'Internal')).toHaveLength(1);
    const externalRows = entries(view, 'External');
    expect(externalRows).toHaveLength(1);
    await expect.element(externalRows[0]).toMatchTextContent('typescript');
    expect(opened.page.textContent).not.toContain('left-pad');
  });
});
