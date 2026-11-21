import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { EVENT_SOURCE, REOPEN_DEBOUNCE_MS } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { formatInstant } from '$core/release-requests/release-request-model';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';

const SWARM = 'a single-node swarm';
const NO_SECRETS = 'a swarm holding no secrets';
const SYSTEM = 'qits-system';
const SECRETS = '/system/api/swarm/secrets';

/** The event stream the app opens, fed by hand. */
interface FakeStream {
  onmessage: ((message: { data: string }) => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  close(): void;
}

/** Lets `ms` of real time pass (the stream's reopen and the refresh's debounce are real timers). */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Screenshots of the System section's swarm secrets page (qits-2350) inside the shell
 * (`openRoute`), with no project open, its one read (`listSwarmSecrets`) answered with
 * qits-system's recordings: "a single-node swarm" (`qits-dns-hetzner-token-…`, labelled and used by
 * no service, and `qits-platform-idp-signing-key`, used by `dev-qits-artifacts`; `secrets`) and "a
 * swarm holding no secrets" (`[]`; `empty`). A read still open (`loading`) and a 503 (`unavailable`: the swarm not
 * answering) are statuses only; so is a 403, which says the role.
 *
 * The page declares no outcome of its own: the shell's are shot once (`shootShellMenus`). The live
 * stream (`EVENT_SOURCE`, the transport seam) is fed a `DeploymentActive` by hand, after which the
 * page reads the secrets again.
 */
describe('SwarmSecretsPage (screenshots)', () => {
  let http: HttpTestingController;
  let streams: FakeStream[];

  beforeEach(() => {
    streams = [];
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        {
          provide: EVENT_SOURCE,
          useValue: () => {
            const stream: FakeStream = {
              onmessage: null,
              onerror: null,
              readyState: 1,
              close: () => {},
            };
            streams.push(stream);
            return stream;
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** Opens the secrets page, its read still open. */
  async function open(): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    return openRoute('/system/swarm/secrets');
  }

  /** The page's open reads. */
  const reads = (): TestRequest[] =>
    http.match((request) => request.url === SECRETS).filter((read) => !read.cancelled);

  /** Answers the read from `state`'s recording. */
  async function answer(opened: OpenedRoute, state: string) {
    http.expectOne(SECRETS).flush(await goldenMaster(state, 'listSwarmSecrets', SYSTEM));
    await opened.settled();
  }

  /** Answers the read with `status` and no body (an error answer is only a status). */
  async function refuse(opened: OpenedRoute, status: number, statusText: string) {
    http.expectOne(SECRETS).flush(null, { status, statusText });
    await opened.settled();
  }

  /** The secrets page, answered from `state`. */
  async function render(state: string) {
    const opened = await open();
    await answer(opened, state);
    return { opened, view: page.elementLocator(opened.page) };
  }

  it('lists the swarm’s secrets, each with the services using it, and no value', async () => {
    const { opened, view } = await render(SWARM);
    await expect
      .element(view.getByRole('heading', { name: 'Swarm secrets', exact: true }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('Secret values are never shown');
    await expect.element(view).toMatchTextContent('2 secrets, 1 unused');
    const table = view.getByRole('table', { name: 'Secrets' });
    const rows = table.getByRole('row').elements();
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/Name\s*ID\s*Used by\s*Labels\s*Created\s*Updated/);
    expect(rows[0].textContent).not.toContain('Driver');
    // The recorded dates are docker's age text ("2 months ago"), which `formatInstant` cannot
    // parse (qits-2487): it draws the dash, the raw text staying on the cell's `title`, until the
    // golden masters carry real instants.
    const created = formatInstant('2 months ago');
    const updated = formatInstant('3 months ago');
    expect(rows[1].textContent).toMatch(
      new RegExp(
        `qits-dns-hetzner-token-2d945672e91b\\s*x4kq7v2m9p1c\\s*Unused\\s*qits\\.platform\\.deployments\\.target=platform\\s*${created}\\s*${created}`,
      ),
    );
    expect(rows[2].textContent).toMatch(
      new RegExp(
        `qits-platform-idp-signing-key\\s*jvbcnrfhrbn8\\s*dev-qits-artifacts\\s*—\\s*${updated}\\s*${updated}`,
      ),
    );
    expect(rows[2].textContent).not.toContain('Unused');
    // The root sidebar's System stays current below the section, Secrets below it the page.
    const navigation = page.elementLocator(opened.frame).getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'System', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Secrets', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('secrets', { kind: 'DATA' });
    await shootShellMenus(opened, 'secrets');
  });

  it('says a swarm holding no secrets holds none', async () => {
    const { opened, view } = await render(NO_SECRETS);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('This swarm holds no secrets.');
    expect(view.getByRole('table').elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says the swarm cannot be read, with Retry', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    await refuse(opened, 503, 'Service Unavailable');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect.element(view).toMatchTextContent('The swarm cannot be read right now.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    // Retry reads again (one open read); answered with a status, so the case needs no recording.
    await refuse(opened, 503, 'Service Unavailable');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('says reading the swarm needs an admin role on a 403', async () => {
    const opened = await open();
    await refuse(opened, 403, 'Forbidden');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading the swarm needs an admin role');
    expect(view.getByRole('button', { name: 'Retry' }).elements()).toHaveLength(0);
  });

  it('reads the secrets again on Refresh', async () => {
    const { opened, view } = await render(SWARM);
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answer(opened, SWARM);
  });

  it('reads the secrets again after a deployment went live', async () => {
    const { opened } = await render(SWARM);
    // The stream opens after `DomainEvents`' reopen debounce.
    await wait(REOPEN_DEBOUNCE_MS + 50);
    expect(streams.length).toBeGreaterThan(0);
    streams.at(-1)!.onmessage?.({
      data: JSON.stringify({
        name: 'DeploymentActive',
        payload: JSON.stringify({ applicationName: 'qits-artifacts', version: '2026.1121.1' }),
      }),
    });
    await opened.idle();
    expect(reads()).toHaveLength(0);
    // One read once the burst's debounce is over.
    await wait(REFRESH_DEBOUNCE_MS + 100);
    await opened.idle();
    await answer(opened, SWARM);
  });
});
