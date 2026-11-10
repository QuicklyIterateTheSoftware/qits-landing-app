import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../testing/browser/app-route';

/**
 * Screenshots of the Network access pane inside the shell (`openRoute`), with no project open.
 * Every answer is qits-network-access' golden master: the recorded device peer, the recorded node
 * and the announced private edge; the edge's 404 (none announced yet, as live today) is a status
 * only.
 */
describe('NetworkAccessPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
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
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('loaded');
  });

  it('says no private edge has announced itself', async () => {
    const opened = await render('none');
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('No private edge has announced itself yet.');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('no-private-edge');
  });
});
