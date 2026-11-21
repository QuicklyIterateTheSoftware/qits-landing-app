import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { EVENT_SOURCE, REOPEN_DEBOUNCE_MS } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { SIGN_IN_POLL_MS } from '$core/system/sign-in';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../testing/browser/shell-menus';
import {
  AWAITING_CODE,
  CONNECTED,
  CONNECTED_WITH_LEASES,
  DECLARED,
  NO_TARGET,
  QUARANTINED,
  REGISTERED_RUNNER,
} from '../../../../testing/system-states';

const SYSTEM = 'qits-system';
const LIST = '/system/api/targets';
/** The recorded target's id, the same in every target state. */
const ID = '00000000-0000-4000-8000-000000000001';
const TARGET = `${LIST}/${ID}`;
const LEASES = `/system/api/leases?targetId=${ID}`;
/** The recorded claude sign-in's id ("a connected target", and the one awaiting its code). */
const SIGN_IN = `${TARGET}/sign-ins/00000000-0000-4000-8000-000000000003`;

/** The event stream the app opens, fed by hand. */
interface FakeStream {
  onmessage: ((message: { data: string }) => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  close(): void;
}

/** Lets `ms` of real time pass (the stream's reopen, the refresh's debounce, the sign-in poll). */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Screenshots of the System section's Targets page (qits-2351) inside the shell (`openRoute`),
 * with no project open, its reads and writes answered with qits-system's recordings: "a connected
 * target with leases" (`targets`, one connected target, `lab`), "no target" (`empty`, which skips
 * itself until the `@qits/system-golden-masters` pin records the empty list; the install line after
 * `createTarget`, `registration`; the install script), "a declared target" (a patch, a delete, the
 * health details, the two checks' 409 TARGET_UNAVAILABLE), "a registered runner" (a token rotation),
 * "a connected target" (a sign-in started) and "a connected target with a claude sign-in awaiting
 * its code" (followed, given its code, cancelled). A read still open (`loading`), a failure
 * (`unavailable`) and a refusal with a body of its own (`delete-busy`'s TARGET_BUSY) are statuses
 * only. The target's leases (`leases`, `listLeases?targetId=`) and the two checks' 202s skip
 * themselves until the pin records them; so does Greenlight, which needs a quarantined target no
 * recording lists yet.
 *
 * The shell's outcomes are shot once (`shootShellMenus`). The live stream (`EVENT_SOURCE`, the
 * transport seam) is fed a `TargetConnectionChanged` and a `TargetLeaseChanged` by hand.
 */
describe('SystemTargetsPage (screenshots)', () => {
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

  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  /** Opens the Targets page, its read still open; tall enough for a whole card and the form. */
  async function open(height = 2000): Promise<OpenedRoute> {
    await page.viewport(1140, height);
    return openRoute('/system/targets');
  }

  /** The page's open list reads. */
  const reads = (): TestRequest[] =>
    http.match((request) => request.url === LIST && request.method === 'GET');

  /** Answers the list read from `state`'s recording. */
  async function answer(opened: OpenedRoute, state: string) {
    const [read, ...more] = reads();
    expect(more).toHaveLength(0);
    read.flush(await goldenMaster(state, 'listTargets', SYSTEM));
    await opened.settled();
  }

  /** The Targets page, answered from `state`. */
  async function render(state = CONNECTED_WITH_LEASES, height = 2000) {
    const opened = await open(height);
    await answer(opened, state);
    const view = page.elementLocator(opened.page);
    return { opened, view, card: view.getByRole('article', { name: 'lab' }) };
  }

  /** The one open request to `url` with `method`. */
  const one = (method: string, url: string) =>
    http.expectOne((request) => request.method === method && request.urlWithParams === url);

  /**
   * Answers every open read of the followed sign-in with the recording awaiting its code; says how
   * many there were.
   */
  async function answerFollows(opened: OpenedRoute): Promise<number> {
    const follows = http.match((r) => r.method === 'GET' && r.url === SIGN_IN);
    for (const read of follows) {
      read.flush(await goldenMaster(AWAITING_CODE, 'getTargetSignIn', SYSTEM));
    }
    await opened.settled();
    return follows.length;
  }

  /**
   * Whether the pinned `@qits/system-golden-masters` records `operationId` in `state` (and the
   * pact holds it): the reader refuses a recording from a later release, and the test skips.
   */
  const recorded = (state: string, operationId: string) =>
    goldenMaster(state, operationId, SYSTEM).then(
      () => true,
      () => false,
    );

  const shot = (opened: OpenedRoute) => expect.element(page.elementLocator(opened.frame));

  it('lists the targets, each with its connection, slots, sign-ins and health', async () => {
    const { opened, view, card } = await render();
    await expect.element(view.getByRole('heading', { name: 'Targets', exact: true })).toBeVisible();
    await expect.element(view).toMatchTextContent('1 target');
    await expect.element(card.getByRole('heading', { name: 'lab' })).toBeVisible();
    await expect.element(card).toMatchTextContent('the lab box');
    await expect.element(card).toMatchTextContent('node-1');
    await expect.element(card.getByText('Connected', { exact: true })).toBeVisible();
    await expect
      .element(card)
      .toMatchTextContent('Connected since 1 Jan 2026 · runner frozen-token-1');
    await expect.element(card).toMatchTextContent('Slots · 2/6 slots in use');
    const slots = card
      .getByRole('row')
      .elements()
      .map((row) => row.textContent?.trim());
    expect(slots[1]).toMatch(/ci\s*1\s*2\s*—/);
    expect(slots[3]).toMatch(/desk\s*0\s*1\s*—/);
    await expect.element(card.getByText('PRESENT', { exact: true })).toBeVisible();
    await expect.element(card.getByText('ABSENT', { exact: true })).toBeVisible();
    await expect
      .element(card.getByRole('button', { name: 'Sign in to Claude again' }))
      .toBeVisible();
    await expect.element(card.getByRole('button', { name: 'Sign in to Kimi' })).toBeVisible();
    await expect.element(card.getByText('Passed', { exact: true })).toBeVisible();
    // The recorded memory reports nothing yet, so no Memory line.
    expect(card.getByText(/^Memory:/).elements()).toHaveLength(0);
    // Not quarantined: no Greenlight.
    expect(card.getByRole('button', { name: 'Greenlight' }).elements()).toHaveLength(0);
    await expect.element(view.getByRole('region', { name: 'Declare a target' })).toBeVisible();
    // The root sidebar's System stays current below the section, Targets below it the page.
    const navigation = page.elementLocator(opened.frame).getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'System', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Targets', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await shot(opened).toMatchScreenshot('targets', { kind: 'DATA' });
    await shootShellMenus(opened, 'targets');
  });

  it('says no targets are declared yet, and keeps the form', async (context) => {
    // qits-system records the empty list from a later release than the pinned one.
    if (!(await recorded(NO_TARGET, 'listTargets'))) context.skip();
    const { opened, view } = await render(NO_TARGET);
    await expect
      .element(view.getByRole('status'))
      .toMatchTextContent('No targets are declared yet.');
    expect(view.getByRole('article').elements()).toHaveLength(0);
    await expect.element(view.getByRole('region', { name: 'Declare a target' })).toBeVisible();
    await shot(opened).toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says the targets cannot be read, with Retry', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await shot(opened).toMatchScreenshot('loading', { kind: 'PENDING' });
    reads()[0].flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('The targets could not be read.');
    await shot(opened).toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answer(opened, CONNECTED_WITH_LEASES);
    await expect.element(view.getByRole('article', { name: 'lab' })).toBeVisible();
  });

  it('names the read roles on a 403', async () => {
    const opened = await open();
    reads()[0].flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('alert')).toMatchTextContent('Reading the targets needs');
    expect(view.getByRole('button', { name: 'Retry' }).elements()).toHaveLength(0);
  });

  it('declare-target sent: a declared target shows its one-time install line once', async () => {
    const { opened, view } = await render();
    const form = view.getByRole('region', { name: 'Declare a target' });
    await userEvent.fill(form.getByRole('textbox', { name: 'Name' }), 'lab');
    await userEvent.fill(form.getByRole('textbox', { name: 'Description' }), 'the lab box');
    await userEvent.fill(form.getByRole('textbox', { name: 'ci', exact: true }), '2');
    await userEvent.fill(form.getByRole('textbox', { name: 'workspace', exact: true }), '2');
    await userEvent.fill(form.getByRole('textbox', { name: 'desk', exact: true }), '1');
    await form.getByRole('button', { name: 'Declare target' }).click();
    await opened.idle();
    const create = one('POST', LIST);
    // The recorded request's body: the reservations always, no slots total.
    expect(create.request.body).toEqual({
      name: 'lab',
      description: 'the lab box',
      reservations: { ci: 2, workspace: 2, desk: 1 },
    });
    create.flush(await goldenMaster(NO_TARGET, 'createTarget', SYSTEM), {
      status: 201,
      statusText: 'Created',
    });
    await opened.idle();
    // A declared target publishes no event: the list is read again.
    await answer(opened, CONNECTED_WITH_LEASES);
    expect(reached()).toEqual(['declare-target:sent']);
    const line = view.getByRole('region', { name: 'Install line' });
    await expect.element(line).toMatchTextContent('lab is declared.');
    await expect.element(line).toMatchTextContent('QITS_SYSTEM_RUNNER_REGISTRATION_TOKEN');
    await expect.element(line.getByRole('button', { name: 'Copy install line' })).toBeVisible();
    await shot(opened).toMatchScreenshot('registration', { kind: 'DATA' });
  });

  it('declare-target sent: a taken name stays on the form, in the page’s words', async () => {
    const { opened, view } = await render();
    const form = view.getByRole('region', { name: 'Declare a target' });
    await userEvent.fill(form.getByRole('textbox', { name: 'Name' }), 'lab');
    await form.getByRole('button', { name: 'Declare target' }).click();
    await opened.idle();
    one('POST', LIST).flush(
      { code: 'TARGET_NAME_TAKEN', message: 'A target named lab exists' },
      { status: 409, statusText: 'Conflict' },
    );
    await opened.settled();
    expect(reached()).toEqual(['declare-target:sent']);
    await expect
      .element(form.getByRole('alert'))
      .toMatchTextContent('A target with this name exists.');
    expect(reads()).toHaveLength(0);
  });

  it('ask-delete-target asked, kept: the first press asks, Keep it takes it back', async () => {
    const { opened, card } = await render();
    await card.getByRole('button', { name: 'Delete…' }).click();
    await card.getByRole('button', { name: 'Keep it' }).click();
    await card.getByRole('button', { name: 'Delete…' }).click();
    await opened.settled();
    expect(reached()).toEqual([
      'ask-delete-target:asked',
      'ask-delete-target:kept',
      'ask-delete-target:asked',
    ]);
    http.expectNone((request) => request.method === 'DELETE');
    await expect.element(card.getByRole('button', { name: 'Delete lab' })).toBeVisible();
    await shot(opened).toMatchScreenshot('confirm-delete', { kind: 'DATA' });
  });

  it('delete-target refused: a busy target says so and opens its leases', async () => {
    const { opened, card } = await render();
    await card.getByRole('button', { name: 'Delete…' }).click();
    await card.getByRole('button', { name: 'Delete lab' }).click();
    await opened.idle();
    one('DELETE', TARGET).flush(
      { code: 'TARGET_BUSY', message: 'Target lab holds 2 leases that have not ended' },
      { status: 409, statusText: 'Conflict' },
    );
    await opened.idle();
    // The leases are read at once; the filtered read is recorded from a later pin on.
    if (await recorded(CONNECTED_WITH_LEASES, 'listLeases')) {
      one('GET', LEASES).flush(await goldenMaster(CONNECTED_WITH_LEASES, 'listLeases', SYSTEM));
    } else one('GET', LEASES).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
    expect(reached()).toEqual(['ask-delete-target:asked', 'delete-target:refused']);
    await expect
      .element(card.getByText('This target still holds a lease that has not ended.'))
      .toBeVisible();
    await expect
      .element(card.getByRole('button', { name: 'Leases' }))
      .toHaveAttribute('aria-expanded', 'true');
    await shot(opened).toMatchScreenshot('delete-busy', { kind: 'ERROR' });
  });

  it('delete-target deleted: the second press deletes, and the list is read again', async () => {
    const { opened, card } = await render(DECLARED);
    await card.getByRole('button', { name: 'Delete…' }).click();
    await card.getByRole('button', { name: 'Delete lab' }).click();
    await opened.idle();
    // `a declared target`'s recorded 204, which has no body.
    one('DELETE', TARGET).flush(null, { status: 204, statusText: 'No Content' });
    await opened.idle();
    expect(reached()).toEqual(['ask-delete-target:asked', 'delete-target:deleted']);
    await answer(opened, DECLARED);
    await shot(opened).toMatchScreenshot('deleted', { kind: 'DATA' });
  });

  it('edit-target sent: Save sends only what changed, and the list is read again', async () => {
    const { opened, card } = await render(DECLARED);
    await card.getByRole('button', { name: 'Edit', exact: true }).click();
    const form = card.getByRole('form', { name: 'Edit lab' });
    await userEvent.fill(
      form.getByRole('textbox', { name: 'Description' }),
      'the lab box, rebuilt',
    );
    await userEvent.fill(form.getByRole('textbox', { name: 'desk', exact: true }), '0');
    await opened.settled();
    await shot(opened).toMatchScreenshot('edit', { kind: 'DATA' });
    await form.getByRole('button', { name: 'Save' }).click();
    await opened.idle();
    const patch = one('PATCH', TARGET);
    // The recorded request's body: only what changed.
    expect(patch.request.body).toEqual({
      description: 'the lab box, rebuilt',
      reservations: { desk: 0 },
    });
    patch.flush(await goldenMaster(DECLARED, 'patchTarget', SYSTEM));
    await opened.idle();
    await answer(opened, DECLARED);
    expect(reached()).toEqual(['edit-target:sent']);
    await expect.element(card.getByRole('status')).toMatchTextContent('Saved.');
    await shot(opened).toMatchScreenshot('edited', { kind: 'DATA' });
  });

  it('rotate-target-token sent: a rotation shows the new one-time install line', async () => {
    const { opened, card } = await render();
    await card.getByRole('button', { name: 'Rotate registration token' }).click();
    const form = card.getByRole('form', { name: 'Rotate the registration token of lab' });
    await userEvent.fill(form.getByRole('textbox'), '2000');
    await expect.element(form).toMatchTextContent('Slots is a whole number from 0 to 1024.');
    await expect.element(form.getByRole('button', { name: 'Rotate' })).toBeDisabled();
    await userEvent.fill(form.getByRole('textbox'), '2');
    await opened.settled();
    await shot(opened).toMatchScreenshot('rotate', { kind: 'DATA' });
    await form.getByRole('button', { name: 'Rotate' }).click();
    await opened.idle();
    const rotate = one('POST', `${TARGET}/registration-token`);
    expect(rotate.request.body).toEqual({ slots: 2 });
    rotate.flush(await goldenMaster(REGISTERED_RUNNER, 'rotateTargetRegistrationToken', SYSTEM));
    await opened.idle();
    await answer(opened, CONNECTED_WITH_LEASES);
    expect(reached()).toEqual(['rotate-target-token:sent']);
    await expect.element(card.getByRole('button', { name: 'Copy install line' })).toBeVisible();
    await shot(opened).toMatchScreenshot('rotated', { kind: 'DATA' });
  });

  it('request-target-health-check sent: a refusal stays on the card', async () => {
    const { opened, card } = await render();
    await card.getByRole('button', { name: 'Run health check' }).click();
    await opened.idle();
    // `a declared target`'s recorded 409.
    one('POST', `${TARGET}/healthcheck`).flush(
      { code: 'TARGET_UNAVAILABLE', message: 'Target lab is not connected' },
      { status: 409, statusText: 'Conflict' },
    );
    await opened.settled();
    expect(reached()).toEqual(['request-target-health-check:sent']);
    await expect
      .element(card.getByRole('alert'))
      .toMatchTextContent('The target’s runner is not connected.');
    expect(reads()).toHaveLength(0);
    await shot(opened).toMatchScreenshot('health-check-refused', { kind: 'ERROR' });
  });

  it('request-target-health-check sent: a connected target takes it', async (context) => {
    if (!(await recorded(CONNECTED, 'requestTargetHealthCheck'))) context.skip();
    const { opened, card } = await render();
    await card.getByRole('button', { name: 'Run health check' }).click();
    await opened.idle();
    one('POST', `${TARGET}/healthcheck`).flush(
      await goldenMaster(CONNECTED, 'requestTargetHealthCheck', SYSTEM),
      { status: 202, statusText: 'Accepted' },
    );
    await opened.idle();
    // Its result publishes no event: the list is read again.
    await answer(opened, CONNECTED_WITH_LEASES);
    await expect.element(card.getByRole('status')).toMatchTextContent('Health check requested');
  });

  it('request-target-login-check sent: a refusal stays on the card', async () => {
    const { opened, card } = await render();
    await card.getByRole('button', { name: 'Check sign-in' }).click();
    await opened.idle();
    one('POST', `${TARGET}/login-check`).flush(
      { code: 'TARGET_UNAVAILABLE', message: 'Target lab is not connected' },
      { status: 409, statusText: 'Conflict' },
    );
    await opened.settled();
    expect(reached()).toEqual(['request-target-login-check:sent']);
    await expect
      .element(card.getByRole('alert'))
      .toMatchTextContent('The target’s runner is not connected.');
    await shot(opened).toMatchScreenshot('login-check-refused', { kind: 'ERROR' });
  });

  it('request-target-login-check sent: a connected target takes it', async (context) => {
    if (!(await recorded(CONNECTED, 'requestTargetLoginCheck'))) context.skip();
    const { opened, card } = await render();
    await card.getByRole('button', { name: 'Check sign-in' }).click();
    await opened.idle();
    one('POST', `${TARGET}/login-check`).flush(
      await goldenMaster(CONNECTED, 'requestTargetLoginCheck', SYSTEM),
      { status: 202, statusText: 'Accepted' },
    );
    await opened.idle();
    await answer(opened, CONNECTED_WITH_LEASES);
    await expect.element(card.getByRole('status')).toMatchTextContent('Sign-in check sent');
  });

  it('greenlight-target sent: Greenlight lifts a quarantine', async (context) => {
    // No recording lists a quarantined target yet (qits-system's `a quarantined target`).
    if (!(await recorded(QUARANTINED, 'listTargets'))) context.skip();
    const { opened, card } = await render(QUARANTINED);
    await expect.element(card.getByText('Quarantined', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Greenlight' }).click();
    await opened.idle();
    one('POST', `${TARGET}/greenlight`).flush(
      await goldenMaster(DECLARED, 'greenlightTarget', SYSTEM),
    );
    await opened.idle();
    await answer(opened, DECLARED);
    expect(reached()).toEqual(['greenlight-target:sent']);
    await shot(opened).toMatchScreenshot('greenlit', { kind: 'DATA' });
  });

  it('shows the last settled health check, each check with its verdict', async () => {
    const { opened, card } = await render(DECLARED);
    await card.getByRole('button', { name: 'Details' }).click();
    await opened.idle();
    one('GET', `${TARGET}/health`).flush(await goldenMaster(DECLARED, 'getTargetHealth', SYSTEM));
    await opened.settled();
    const checks = card
      .getByRole('listitem')
      .elements()
      .map((item) => item.textContent?.trim());
    expect(checks).toEqual([
      expect.stringMatching(/Passed\s*docker/),
      expect.stringMatching(/Passed\s*login/),
      expect.stringMatching(/Passed\s*slots/),
    ]);
    await shot(opened).toMatchScreenshot('health', { kind: 'DATA' });
  });

  it('lists a target’s leases, and reads them again after a lease of it changed', async (context) => {
    if (!(await recorded(CONNECTED_WITH_LEASES, 'listLeases'))) context.skip();
    const { opened, card } = await render();
    await card.getByRole('button', { name: 'Leases' }).click();
    await opened.idle();
    one('GET', LEASES).flush(await goldenMaster(CONNECTED_WITH_LEASES, 'listLeases', SYSTEM));
    await opened.settled();
    const rows = card.getByRole('table', { name: 'lab leases' }).getByRole('row').elements();
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/Slot\s*Owner\s*Ref\s*State\s*Detail/);
    await shot(opened).toMatchScreenshot('leases', { kind: 'DATA' });
    // Another target's lease reads nothing; this one's reads its leases again, not the list's
    // own events' answer only.
    await wait(REOPEN_DEBOUNCE_MS + 50);
    const stream = streams.at(-1)!;
    stream.onmessage?.({
      data: JSON.stringify({
        name: 'TargetLeaseChanged',
        payload: JSON.stringify({ targetId: '00000000-0000-4000-8000-000000000009' }),
      }),
    });
    stream.onmessage?.({
      data: JSON.stringify({
        name: 'TargetLeaseChanged',
        payload: JSON.stringify({ targetId: ID }),
      }),
    });
    await wait(REFRESH_DEBOUNCE_MS + 100);
    await opened.idle();
    one('GET', LEASES).flush(await goldenMaster(CONNECTED_WITH_LEASES, 'listLeases', SYSTEM));
    await answer(opened, CONNECTED_WITH_LEASES);
  });

  it('reads the install script on opening, and says so when it cannot', async () => {
    // qits-system records the script as a JSON string, not as the text/plain it serves, so no
    // screenshot shows it: the pact binds its status and media type, and this shot the refusal
    // (RUNNER_PLANE_UNCONFIGURED, a 503) a page meets while commissioning is not set up.
    const { opened, view } = await render();
    await view.getByRole('button', { name: 'View install script' }).click();
    await opened.idle();
    one('GET', `${LIST}/install.sh`).flush(null, {
      status: 503,
      statusText: 'Service Unavailable',
    });
    await opened.settled();
    await expect
      .element(view.getByRole('region', { name: 'Install script' }))
      .toMatchTextContent('The install script could not be read.');
    await shot(opened).toMatchScreenshot('install-script-unavailable', { kind: 'ERROR' });
  });

  it('start-, submit-, cancel-target-sign-in sent: a sign-in is followed until it is cancelled', async () => {
    const { opened, card } = await render();
    await card.getByRole('button', { name: 'Sign in to Claude again' }).click();
    await opened.idle();
    const start = one('POST', `${TARGET}/sign-ins`);
    expect(start.request.body).toEqual({ harness: 'claude' });
    start.flush(await goldenMaster(CONNECTED, 'startTargetSignIn', SYSTEM), {
      status: 202,
      statusText: 'Accepted',
    });
    await opened.settled();
    const signIn = card.getByRole('group', { name: 'Claude sign-in' });
    await expect.element(signIn).toMatchTextContent('Starting the sign-in on the target…');
    // No event follows a sign-in: it is read again every 2 s while it has not settled.
    await wait(SIGN_IN_POLL_MS + 150);
    await opened.idle();
    expect(await answerFollows(opened)).toBe(1);
    await expect.element(signIn).toMatchTextContent('paste the code the browser shows');
    const link = signIn.getByRole('link', { name: 'Open the Claude sign-in page' });
    await expect.element(link).toBeVisible();
    expect(link.element().getAttribute('href')).toMatch(/^https:\/\/claude\.com\//);
    await userEvent.fill(signIn.getByRole('textbox'), 'contract-code#contract');
    await shot(opened).toMatchScreenshot('sign-in-code', { kind: 'DATA' });
    await signIn.getByRole('button', { name: 'Submit' }).click();
    await opened.idle();
    const code = one('POST', `${SIGN_IN}/code`);
    expect(code.request.body).toEqual({ code: 'contract-code#contract' });
    code.flush(await goldenMaster(AWAITING_CODE, 'submitTargetSignInCode', SYSTEM), {
      status: 202,
      statusText: 'Accepted',
    });
    await answerFollows(opened);
    // Once per state: the field waits until the sign-in moves.
    await expect.element(signIn.getByRole('textbox')).toBeDisabled();
    await expect
      .element(signIn)
      .toMatchTextContent('Code sent: waiting for the target to take it.');
    await signIn.getByRole('button', { name: 'Cancel sign-in' }).click();
    await opened.idle();
    one('DELETE', SIGN_IN).flush(await goldenMaster(AWAITING_CODE, 'cancelTargetSignIn', SYSTEM), {
      status: 202,
      statusText: 'Accepted',
    });
    await answerFollows(opened);
    expect(reached()).toEqual([
      'start-target-sign-in:sent',
      'submit-target-sign-in-code:sent',
      'cancel-target-sign-in:sent',
    ]);
    await expect.element(signIn).toMatchTextContent('The sign-in was cancelled.');
    await shot(opened).toMatchScreenshot('sign-in-cancelled', { kind: 'DATA' });
    // Settled: nothing reads it again.
    await wait(SIGN_IN_POLL_MS + 150);
    await opened.idle();
    http.expectNone((r) => r.url === SIGN_IN);
  });

  it('follows the running sign-in a SIGN_IN_RUNNING refusal names', async () => {
    const { opened, card } = await render();
    await card.getByRole('button', { name: 'Sign in to Claude again' }).click();
    await opened.idle();
    one('POST', `${TARGET}/sign-ins`).flush(
      {
        code: 'SIGN_IN_RUNNING',
        message: 'A claude sign-in is running: 00000000-0000-4000-8000-000000000003',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await opened.idle();
    one('GET', SIGN_IN).flush(await goldenMaster(AWAITING_CODE, 'getTargetSignIn', SYSTEM));
    await opened.settled();
    await expect
      .element(card.getByRole('group', { name: 'Claude sign-in' }))
      .toMatchTextContent('paste the code the browser shows');
    await card.getByRole('button', { name: 'Cancel sign-in' }).click();
    await opened.idle();
    one('DELETE', SIGN_IN).flush(await goldenMaster(AWAITING_CODE, 'cancelTargetSignIn', SYSTEM), {
      status: 202,
      statusText: 'Accepted',
    });
    await answerFollows(opened);
  });

  it('reads the targets again on Refresh, and after a runner connected', async () => {
    const { opened, view } = await render();
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answer(opened, CONNECTED_WITH_LEASES);
    // The stream opens after `DomainEvents`' reopen debounce.
    await wait(REOPEN_DEBOUNCE_MS + 50);
    expect(streams.length).toBeGreaterThan(0);
    streams.at(-1)!.onmessage?.({
      data: JSON.stringify({
        name: 'TargetConnectionChanged',
        payload: JSON.stringify({ targetId: ID }),
      }),
    });
    await opened.idle();
    expect(reads()).toHaveLength(0);
    // One read once the burst's debounce is over.
    await wait(REFRESH_DEBOUNCE_MS + 100);
    await opened.idle();
    await answer(opened, CONNECTED_WITH_LEASES);
  });
});
