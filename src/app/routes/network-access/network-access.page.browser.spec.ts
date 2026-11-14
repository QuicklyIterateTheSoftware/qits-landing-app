import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page, userEvent } from 'vitest/browser';
import { WIREGUARD_KEYS } from '$core/network-access/wireguard-keys';
import { goldenMaster, goldenMasterString } from '../../../testing/browser/golden-master';
import { openRoute, provideAppRoute, type OpenedRoute } from '../../../testing/browser/app-route';
import { fixedWireGuardKeys } from '../../../testing/wireguard-keys';

/**
 * Screenshots of the Network access pane inside the shell (`openRoute`), with no project open.
 * Every answer is qits-network-access' golden master: the recorded device peer, the recorded node
 * and the announced private edge; the edge's 404 (none announced yet, as live today) is a status
 * only.
 *
 * Add device (qits-2262) makes its keys with a fixed pair (`WIREGUARD_KEYS`, the recorded
 * `createPeer`'s public key), so its QR code is the same every run. Its add answers with the
 * recorded `createPeer` ("an announced private edge"), whose peer is the recorded device peer (the
 * same frozen id), so the config read answers with that peer's recorded `getPeerAppConfig` ("a
 * device peer behind an announced private edge"), a JSON string read as text (`goldenMasterString`). A refusal is a status and the service's
 * `{ message }`.
 */
describe('NetworkAccessPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideAppRoute(), { provide: WIREGUARD_KEYS, useValue: fixedWireGuardKeys }],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  async function render(edge: 'announced' | 'none') {
    await page.viewport(1140, 900);
    const opened = await openRoute('/network-access');
    http
      .expectOne('/network-access/api/peers')
      .flush(
        await goldenMaster(
          'a device peer behind an announced private edge',
          'getPeers',
          'qits-network-access',
        ),
      );
    http
      .expectOne('/network-access/api/nodes')
      .flush(await goldenMaster('a joined node', 'getNodes', 'qits-network-access'));
    const request = http.expectOne('/network-access/api/private-edge');
    if (edge === 'none') request.flush(null, { status: 404, statusText: 'Not Found' });
    else {
      request.flush(
        await goldenMaster('an announced private edge', 'getPrivateEdge', 'qits-network-access'),
      );
    }
    await opened.settled();
    return opened;
  }

  it('lists the peers, the private edge and the connect line', async () => {
    const opened = await render('announced');
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('table', { name: 'Peers' })).toMatchTextContent('laptop');
    await expect.element(view).toMatchTextContent('46.224.171.33:47812');
    await expect.element(view).toMatchTextContent('qits network-access up');
    await expect
      .element(view.getByRole('button', { name: 'Download WireGuard config' }))
      .toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
  });

  it('says no private edge has announced itself', async () => {
    const opened = await render('none');
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('No private edge has announced itself yet.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('no-private-edge', { kind: 'NO_DATA' });
  });

  /**
   * Makes the viewport tall enough for the whole page, so a screenshot holds all of it at every
   * width it is shot at: measured at the phone's width, where the page is tallest and the frame
   * grows with it (the shell's `<main>` scrolls on its own from 768px up only).
   */
  async function fitWholePage(opened: OpenedRoute) {
    const width = window.innerWidth;
    await page.viewport(390, 844);
    await opened.settled();
    const height = opened.frame.scrollHeight;
    await page.viewport(width, Math.max(height, 900) + 40);
    await opened.settled();
  }

  /** Types `name` into Add device and presses Add; gives the add's request. */
  async function add(opened: OpenedRoute, name: string) {
    const view = page.elementLocator(opened.page);
    await userEvent.fill(view.getByRole('textbox', { name: 'Device name' }), name);
    await userEvent.click(view.getByRole('button', { name: 'Add', exact: true }));
    await opened.settled();
    return http.expectOne({ method: 'POST', url: '/network-access/api/peers' });
  }

  it('offers Add device with a name typed', async () => {
    const opened = await render('announced');
    const view = page.elementLocator(opened.page);
    await userEvent.fill(view.getByRole('textbox', { name: 'Device name' }), 'phone');
    await expect.element(view.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
    await expect.element(view).toMatchTextContent('only its public key is sent');
    await fitWholePage(opened);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('add-device', { kind: 'DATA' });
  });

  it('shows a new device’s config once, as a QR code, a file and its text', async () => {
    const opened = await render('announced');
    const view = page.elementLocator(opened.page);
    (await add(opened, 'laptop')).flush(
      await goldenMaster('an announced private edge', 'createPeer', 'qits-network-access'),
      { status: 201, statusText: 'Created' },
    );
    await opened.settled();
    // The add reads the list again, so the new row shows.
    http
      .expectOne('/network-access/api/peers')
      .flush(
        await goldenMaster(
          'a device peer behind an announced private edge',
          'getPeers',
          'qits-network-access',
        ),
      );
    await opened.settled();
    http
      .expectOne('/network-access/api/peers/00000000-0000-4000-8000-000000000001/app-config')
      .flush(
        await goldenMasterString(
          'a device peer behind an announced private edge',
          'getPeerAppConfig',
          'qits-network-access',
        ),
      );
    await opened.settled();
    await expect
      .element(view.getByRole('img', { name: 'WireGuard config of laptop' }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('It is shown once and stored nowhere');
    await expect.element(view.getByRole('button', { name: 'Download .conf' })).toBeVisible();
    await expect.element(view.getByRole('button', { name: 'Done' })).toBeVisible();
    await fitWholePage(opened);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('device-config', { kind: 'DATA' });
  });

  it('shows the service’s words when it refuses a device', async () => {
    const opened = await render('announced');
    const view = page.elementLocator(opened.page);
    (await add(opened, 'laptop')).flush(
      { message: 'you already have an active peer of this name' },
      { status: 409, statusText: 'Conflict' },
    );
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toHaveTextContent('you already have an active peer of this name');
    await fitWholePage(opened);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('add-device-refused', { kind: 'ERROR' });
  });
});
