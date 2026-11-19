import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of the Maintenance section's Artifacts page inside the shell (`openRoute`), at the
 * recorded project's slug (qits-projects' "a project exists", id `…0001`).
 *
 * `listRepositories`, `listArtifacts` and `listDependencyDependents` are answered from
 * qits-maintenance's golden masters: "released artifacts, some behind" (the repositories:
 * contract-daemon, contract-frontend, contract-javalib and contract-service, all in the open
 * project; the artifacts: `eu.wohlben.qits:contract-core` with three dependents, one behind,
 * `@qits/contract-ui` with no SBOM read, the daemon `contract-daemon`, the client jar and the image
 * of contract-service; the dependents of contract-core: the daemon behind, the image current, the
 * client jar transitive) and "no released artifacts" (an empty inventory, and contract-core with no
 * dependents). A refusal is a 403 with no body, as the service answers a credential without a staff
 * role; a 400 carries the service's `message`, as its exception mapper writes it.
 */
describe('MaintenanceArtifactsPage (screenshots)', () => {
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

  const RELEASED = 'released artifacts, some behind';
  const NOTHING = 'no released artifacts';
  const REPOSITORIES = '/maintenance/api/repositories';
  const ARTIFACTS = '/maintenance/api/artifacts';
  const DEPENDENTS = '/maintenance/api/dependencies/dependents';
  /** The artifact the dependents recordings are of. */
  const CORE = '?ecosystem=maven&name=eu.wohlben.qits:contract-core';

  /** The open reads of the page, taken off the controller (`match` hands each request out once). */
  function openReads() {
    const open = http
      .match((request) => request.url.startsWith('/maintenance/api/'))
      .filter((request) => !request.cancelled);
    const at = (url: string) => open.filter((read) => read.request.url.split('?')[0] === url);
    return {
      repositories: at(REPOSITORIES),
      artifacts: at(ARTIFACTS),
      dependents: at(DEPENDENTS),
      all: open,
    };
  }

  /**
   * Answers the listing's two reads with `state`'s recordings and, when `dependents` names a state,
   * the detail's dependents read with that state's.
   */
  async function answer(opened: { settled(): Promise<void> }, state: string, dependents?: string) {
    const open = openReads();
    expect(open.repositories).toHaveLength(1);
    expect(open.artifacts).toHaveLength(1);
    expect(open.dependents).toHaveLength(dependents ? 1 : 0);
    open.repositories[0].flush(await goldenMaster(state, 'listRepositories', 'qits-maintenance'));
    open.artifacts[0].flush(await goldenMaster(state, 'listArtifacts', 'qits-maintenance'));
    if (dependents)
      open.dependents[0].flush(
        await goldenMaster(dependents, 'listDependencyDependents', 'qits-maintenance'),
      );
    await opened.settled();
  }

  /** Opens the page at `query`, tall enough for every row (a screenshot shows the viewport only). */
  async function render(query = '') {
    await page.viewport(1140, 1000);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/maintenance/artifacts${query}`,
    );
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** The listing with the populated inventory answered. */
  async function loaded(query = '') {
    const rendered = await render(query);
    await answer(rendered.opened, RELEASED);
    return rendered;
  }

  type View = ReturnType<typeof page.elementLocator>;
  /** The rows of the list labelled `name`. */
  const rows = (view: View, name: 'Released artifacts' | 'Dependents') => {
    const list = view.getByRole('list', { name }).element();
    return [...list.querySelectorAll<HTMLElement>(':scope > li')].map((row) =>
      page.elementLocator(row),
    );
  };

  it('lists the project’s released artifacts, shipped behind first, counted', async () => {
    const { opened, view } = await loaded();
    await expect
      .element(view.getByRole('heading', { name: /^Released/ }))
      .toMatchTextContent(/5 artifacts · 1 shipped behind · 1 without a read SBOM/);

    // Behind first: contract-core (1 of 3 dependents behind), then by name.
    const listed = rows(view, 'Released artifacts');
    expect(listed).toHaveLength(5);
    await expect.element(listed[0]).toMatchTextContent('eu.wohlben.qits:contract-core');
    await expect.element(listed[0]).toMatchTextContent('contract-javalib');
    await expect.element(listed[0]).toMatchTextContent('2026.1101.2');
    await expect.element(listed[0]).toMatchTextContent('3 dependents');
    await expect.element(listed[0].getByText('1 behind', { exact: true })).toBeVisible();
    await expect.element(listed[0].getByText('SBOM ingested', { exact: true })).toBeVisible();
    const names = listed.map((row) => row.element().querySelector('.font-mono')?.textContent);
    expect(names).toEqual([
      'eu.wohlben.qits:contract-core',
      '@qits/contract-ui',
      'contract-daemon',
      'eu.wohlben.qits:contract-service-client',
      'qits/contract-service',
    ]);
    // The npm package's SBOM was never read, and nobody knows its latest.
    await expect.element(listed[1].getByText('SBOM missing', { exact: true })).toBeVisible();
    await expect.element(listed[1]).toMatchTextContent('latest unknown');
    await expect.element(listed[1].getByText(/behind$/)).not.toBeVisible();

    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('links a name to its detail, but not a daemon’s, which the dependents door refuses', async () => {
    const { opened, view } = await loaded();
    const core = view.getByRole('link', { name: 'eu.wohlben.qits:contract-core' });
    await expect.element(core).toBeVisible();
    const href = decodeURIComponent(core.element().getAttribute('href') ?? '');
    expect(href).toContain('ecosystem=maven');
    expect(href).toContain('name=eu.wohlben.qits:contract-core');
    // The daemon's name is plain; its producing repository (contract-daemon too) is a link to the
    // repository's page (qits-2334), not to a detail.
    const daemon = rows(view, 'Released artifacts').find(
      (row) => row.element().querySelector('.font-mono')?.textContent === 'contract-daemon',
    )!;
    expect(daemon.element().querySelector('.font-mono')?.tagName).toBe('SPAN');
    expect(
      daemon.element().querySelector('a[href*="/maintenance/repositories/contract-daemon"]'),
    ).not.toBeNull();

    await userEvent.click(core);
    await opened.idle();
    expect(TestBed.inject(Router).url).toContain('ecosystem=maven');
    // The detail reads the dependents; the listing's reads are already answered.
    const open = openReads();
    expect(open.repositories).toHaveLength(0);
    expect(open.artifacts).toHaveLength(0);
    expect(open.dependents).toHaveLength(1);
    open.dependents[0].flush(
      await goldenMaster(RELEASED, 'listDependencyDependents', 'qits-maintenance'),
    );
    await opened.settled();
    await expect.element(view.getByRole('list', { name: 'Dependents' })).toBeVisible();
  });

  it('Only behind puts behind=true in the URL and keeps the artifacts shipped behind', async () => {
    const { opened, view } = await loaded();
    await userEvent.click(view.getByRole('checkbox', { name: 'Only behind' }));
    await opened.idle();
    expect(TestBed.inject(Router).url).toContain('behind=true');
    // The toggle filters what was read: it reads nothing again.
    expect(openReads().all).toHaveLength(0);
    const listed = rows(view, 'Released artifacts');
    expect(listed).toHaveLength(1);
    await expect.element(listed[0]).toMatchTextContent('eu.wohlben.qits:contract-core');
    // The count stays the project's own.
    await expect
      .element(view.getByRole('heading', { name: /^Released/ }))
      .toMatchTextContent('5 artifacts · 1 shipped behind');
  });

  it('opens with behind=true showing only the artifacts shipped behind', async () => {
    const { view } = await loaded('?behind=true');
    await expect.element(view.getByRole('checkbox', { name: 'Only behind' })).toBeChecked();
    expect(rows(view, 'Released artifacts')).toHaveLength(1);
  });

  it('Refresh reads the repositories and the artifacts again', async () => {
    const { opened, view } = await loaded();
    await userEvent.click(view.getByRole('button', { name: 'Refresh' }));
    await opened.idle();
    // `answer` checks both reads are open again, and no dependents read.
    await answer(opened, RELEASED);
  });

  it('says nothing of the project has been released when it released no artifact', async () => {
    const { opened, view } = await render();
    await answer(opened, NOTHING);
    await expect
      .element(view.getByText('Nothing of this project has been released yet.'))
      .toBeVisible();
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
    for (const read of openReads().all) read.flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert').first())
      .toMatchTextContent('Reading artifacts needs a staff role');
    // The refusal stands alone: no generic failure, and no empty page.
    await expect.element(view.getByText(/could not be read/)).not.toBeVisible();
    await expect.element(view.getByText(/Nothing of this project/)).not.toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('shows an artifact’s dependents, behind first, each current, behind or transitive', async () => {
    const { opened, view } = await render(CORE);
    await answer(opened, RELEASED, RELEASED);
    await expect
      .element(view.getByRole('heading', { name: 'eu.wohlben.qits:contract-core' }))
      .toBeVisible();
    const facts = view.getByRole('definition');
    await expect.element(facts.nth(0)).toMatchTextContent('maven');
    await expect.element(facts.nth(1)).toMatchTextContent('2026.1101.2');
    await expect.element(facts.nth(2)).toMatchTextContent('2026.1101.2');
    await expect.element(facts.nth(3)).toMatchTextContent('SBOM ingested');
    await expect
      .element(view.getByRole('heading', { name: /^Embedded by/ }))
      .toMatchTextContent('3 dependents · 1 behind');

    // Behind first (the daemon), then by repository and artifact.
    const listed = rows(view, 'Dependents');
    expect(listed).toHaveLength(3);
    await expect.element(listed[0]).toMatchTextContent('contract-daemon');
    await expect.element(listed[0]).toMatchTextContent('2026.1101.1');
    await expect.element(listed[0]).toMatchTextContent('direct');
    await expect.element(listed[0].getByText('behind', { exact: true })).toBeVisible();
    await expect.element(listed[1]).toMatchTextContent('eu.wohlben.qits:contract-service-client');
    await expect.element(listed[1]).toMatchTextContent('transitive');
    await expect.element(listed[1].getByText('current', { exact: true })).toBeVisible();
    await expect.element(listed[2]).toMatchTextContent('qits/contract-service');
    await expect.element(listed[2]).toMatchTextContent('direct');
    await expect.element(listed[2].getByText('current', { exact: true })).toBeVisible();

    // The listing is the detail's no more: no toggle, no artifact rows.
    expect(view.getByRole('checkbox', { name: 'Only behind' }).query()).toBeNull();
    expect(view.getByRole('list', { name: 'Released artifacts' }).query()).toBeNull();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('detail', { kind: 'DATA' });
  });

  it('leads back to the listing, keeping behind', async () => {
    const { opened, view } = await render(`${CORE}&behind=true`);
    await answer(opened, RELEASED, RELEASED);
    await userEvent.click(view.getByRole('link', { name: '← All artifacts' }));
    await opened.idle();
    const url = TestBed.inject(Router).url;
    expect(url).toBe(`/projects/${opened.project.slug}/maintenance/artifacts?behind=true`);
    expect(openReads().all).toHaveLength(0);
    expect(rows(view, 'Released artifacts')).toHaveLength(1);
  });

  it('Refresh on the detail reads its dependents again too', async () => {
    const { opened, view } = await render(CORE);
    await answer(opened, RELEASED, RELEASED);
    await userEvent.click(view.getByRole('button', { name: 'Refresh' }));
    await opened.idle();
    await answer(opened, RELEASED, RELEASED);
  });

  it('says nothing embeds an artifact with no dependents', async () => {
    const { opened, view } = await render(CORE);
    await answer(opened, NOTHING, NOTHING);
    await expect
      .element(view.getByText('Nothing embeds this, or no SBOM has been read for whatever does.'))
      .toBeVisible();
    await expect.element(view.getByRole('definition').nth(1)).toMatchTextContent('unknown');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('detail-empty', { kind: 'NO_DATA' });
  });

  it('shows the service’s reason when it refuses the artifact', async () => {
    const { opened, view } = await render('?ecosystem=daemon&name=contract-daemon');
    const open = openReads();
    open.repositories[0].flush(
      await goldenMaster(RELEASED, 'listRepositories', 'qits-maintenance'),
    );
    open.artifacts[0].flush(await goldenMaster(RELEASED, 'listArtifacts', 'qits-maintenance'));
    const message = "ecosystem must be maven, npm or docker, not 'daemon'";
    open.dependents[0].flush({ message }, { status: 400, statusText: 'Bad Request' });
    await opened.settled();
    await expect.element(view.getByRole('alert').getByText(message)).toBeVisible();
    await expect.element(view.getByText(/could not be read/)).not.toBeVisible();
  });
});
