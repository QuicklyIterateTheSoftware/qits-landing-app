import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of a repository's Depends on page inside the shell (`openRoute`, qits-2489), at the
 * recorded project's slug (qits-projects' "a project exists"), its two reads answered from
 * qits-maintenance's golden masters: "a repository with pins and bumps" (contract-javalib:
 * internal, external, REACTOR and UNRESOLVED pins, two pending, one behind transitive of two, a
 * RUNNING, a SUCCEEDED and a NOTHING_TO_DO bump), "a repository with nothing pinned"
 * (contract-service, OK and empty) and "no such repository" (contract-unknown-service:
 * `getRepository` a 404, no bumps). A refusal is a 403 with no body, as the service answers a
 * credential without a staff role. A bump opens under the repository (`open-repository-bump`), its
 * release request on its page (`open-repository-bump-release-request`); the sidebar's Dependents
 * is followed from here (`open-sidebar-repository-page`).
 */
const PINS_AND_BUMPS = 'a repository with pins and bumps';
const NOTHING_PINNED = 'a repository with nothing pinned';
const MISSING = 'no such repository';

/** The repository each state recorded (its `repoName`). */
const NAMES: Readonly<Record<string, string>> = {
  [PINS_AND_BUMPS]: 'contract-javalib',
  [NOTHING_PINNED]: 'contract-service',
  [MISSING]: 'contract-unknown-service',
};

/** The two reads, by the operation each answers, as `url` names its path. */
const READS = [
  ['getRepository', (name: string) => `/maintenance/api/repositories/${name}`],
  ['listBumps', () => '/maintenance/api/bumps'],
] as const;

describe('RepositoryDependsOnPage (screenshots)', () => {
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

  /** The page of the repository `name`, its reads still open; tall enough for every section. */
  async function open(name: string, height = 1000) {
    await page.viewport(1140, height);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/components/${name}/depends-on`,
    );
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** The page's open read of `operationId` for `name`, taken off the controller. */
  function readOf(operationId: (typeof READS)[number][0], name: string) {
    const [, url] = READS.find(([id]) => id === operationId)!;
    return http.expectOne((request) => request.url.split('?')[0] === url(name));
  }

  /** Answers the two reads of `state`'s repository with its recordings (a 404 with its status). */
  async function answer(opened: OpenedRoute, state: string) {
    const name = NAMES[state];
    for (const [operationId] of READS) {
      const body = await goldenMaster(state, operationId, 'qits-maintenance');
      const read = readOf(operationId, name);
      if (state === MISSING && operationId === 'getRepository') {
        read.flush(body, { status: 404, statusText: 'Not Found' });
      } else read.flush(body);
    }
    await opened.settled();
  }

  /** The page of the repository `state` recorded, answered. */
  async function render(state: string, height?: number) {
    const rendered = await open(NAMES[state], height);
    await answer(rendered.opened, state);
    return rendered;
  }

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * with a 404 (an error answer is only a status): that page is its own spec's.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);
  const sidebar = () => page.getByRole('navigation', { name: 'qits' });

  it('shows a repository’s pins and recent bumps', async () => {
    const { opened, view } = await render(PINS_AND_BUMPS, 1400);
    await expect
      .element(view.getByRole('heading', { level: 2 }))
      .toHaveTextContent('contract-javalib');
    await expect.element(view.getByText('OK', { exact: true })).toBeVisible();
    await expect
      .element(view.getByRole('table', { name: 'Internal pins' }))
      .toMatchTextContent(/qits-eventstream.*qits-arch-rules/);
    await expect
      .element(view.getByRole('table', { name: 'External pins' }))
      .toMatchTextContent(/quarkus-bom/);
    await expect.element(view.getByText('2 transitives, 1 behind')).toBeVisible();
    await expect.element(view.getByText(/jackson-databind/)).toBeVisible();
    // Reactor and unresolved pins stay folded away.
    await expect.element(view.getByText('Reactor and unresolved pins (2)')).toBeVisible();
    await expect.element(view.getByText('org.example:mystery')).not.toBeVisible();
    await expect.element(view.getByRole('table', { name: 'Recent bumps' })).toBeVisible();
    await expect
      .element(view.getByRole('link', { name: '00000000-0000-4000-8000-000000000003' }).first())
      .toBeVisible();
    await expect
      .element(sidebar().getByRole('link', { name: 'Depends on' }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('pins-and-bumps', { kind: 'DATA' });
    await shootShellMenus(opened, 'pins-and-bumps');
  });

  it('opens the reactor and unresolved pins', async () => {
    const { opened, view } = await render(PINS_AND_BUMPS, 1400);
    await view.getByText('Reactor and unresolved pins (2)').click();
    await expect
      .element(view.getByRole('table', { name: 'Reactor and unresolved pins' }))
      .toMatchTextContent(/contract-api.*mystery/);
    await opened.settled();
  });

  it('says pins and bumps are empty for a repository with nothing pinned', async () => {
    const { opened, view } = await render(NOTHING_PINNED);
    await expect.element(view.getByText('No pins were read for contract-service.')).toBeVisible();
    await expect.element(view.getByText('No bumps of contract-service yet.')).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('nothing-pinned', { kind: 'NO_DATA' });
  });

  it('says there is no such repository, and nothing else', async () => {
    const { opened, view } = await render(MISSING);
    await expect
      .element(view)
      .toMatchTextContent('No repository contract-unknown-service in the inventory.');
    await expect.element(view.getByText(/No bumps/)).not.toBeInTheDocument();
    await expect.element(view.getByText(/could not be read/)).not.toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('not-found', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says a refusal needs a staff role', async () => {
    const name = NAMES[PINS_AND_BUMPS];
    const { opened, view } = await open(name);
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    for (const [operationId] of READS) {
      readOf(operationId, name).flush(null, { status: 403, statusText: 'Forbidden' });
    }
    await opened.settled();
    await expect
      .element(view.getByRole('alert').first())
      .toMatchTextContent('Reading a repository needs a staff role');
    await expect.element(view.getByText(/could not be read/)).not.toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('open-repository-bump bump: a recent bump opens its page under the repository', async () => {
    const { opened, view } = await render(PINS_AND_BUMPS, 1400);
    await view.getByRole('link', { name: 'succeeded' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/components/contract-javalib/bumps/00000000-0000-4000-8000-000000000002`,
    );
    expect(reached()).toEqual(['open-repository-bump:bump']);
  });

  it('open-repository-bump-release-request request: opens the request a recent bump belongs to', async () => {
    const { opened, view } = await render(PINS_AND_BUMPS, 1400);
    await view.getByRole('link', { name: '00000000-0000-4000-8000-000000000003' }).first().click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/releases/requests/00000000-0000-4000-8000-000000000003`,
    );
    expect(reached()).toEqual(['open-repository-bump-release-request:request']);
  });

  it('open-sidebar-repository-page dependents: the sidebar’s Dependents opens it', async () => {
    const { opened } = await render(NOTHING_PINNED);
    await userEvent.click(sidebar().getByRole('link', { name: 'Dependents', exact: true }));
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/components/contract-service/dependents`,
    );
    expect(reached()).toEqual(['open-sidebar-repository-page:dependents']);
  });
});
