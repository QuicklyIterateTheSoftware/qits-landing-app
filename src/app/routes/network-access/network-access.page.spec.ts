import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { client as networkAccessClient } from '../../api/network-access/client.gen';
import { provideHeyApiClient } from '../../api/network-access/client/client.gen';
import { networkAccessGoldenMaster } from '../../../testing/golden-masters';
import { CONNECT_COMMAND, NetworkAccessPage, PAC_URL } from './network-access.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const DEVICE = 'a device peer behind an announced private edge';
const NODE = 'a joined node';
const EDGE = 'an announced private edge';

const PEERS = '/network-access/api/peers';
const NODES = '/network-access/api/nodes';
const PRIVATE_EDGE = '/network-access/api/private-edge';

/**
 * The peers list as recorded (one ACTIVE device), with the recorded node's own peer appended, as
 * `getNodes` in "a joined node" records it, so the table holds a device and a node.
 */
function deviceAndNode() {
  const nodes = networkAccessGoldenMaster<{ peer: { id: string } }[]>(NODE, 'getNodes');
  const node = { ...nodes[0].peer, id: '00000000-0000-4000-8000-000000000003' };
  const answer = networkAccessGoldenMaster<object[]>(DEVICE, 'getPeers');
  return {
    peers: [...answer, node],
    // The node's peer id moved with it, so the nodes answer names it too.
    nodes: [{ ...nodes[0], peer: node }],
  };
}

describe('NetworkAccessPage', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<NetworkAccessPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(networkAccessClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const element = () => fixture.nativeElement as HTMLElement;
  // Not `whenStable()`: a resource whose request waits for the spec's answer is a pending task, so
  // stability never comes while one is open (qits-2146). A few turns let the requests be built.
  const redraw = async () => {
    for (let turn = 0; turn < 3; turn++) {
      await settle();
      fixture.detectChanges();
    }
  };
  const button = (label: string, within: ParentNode = element()) =>
    Array.from(within.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  const rows = () => Array.from(element().querySelectorAll('tbody tr'));

  async function render(edge: 'recorded' | 404 = 'recorded') {
    fixture = TestBed.createComponent(NetworkAccessPage);
    fixture.detectChanges();
    await settle();
    const { peers, nodes } = deviceAndNode();
    http.expectOne(PEERS).flush(peers);
    http.expectOne(NODES).flush(nodes);
    const request = http.expectOne(PRIVATE_EDGE);
    if (edge === 404) request.flush(null, { status: 404, statusText: 'Not Found' });
    else request.flush(networkAccessGoldenMaster(EDGE, 'getPrivateEdge'));
    await redraw();
  }

  it('lists the peers with their kind, tunnel IP, owner, status and created', async () => {
    await render();
    const [device, node] = rows();
    expect(rows()).toHaveLength(2);
    expect(device.textContent).toContain('laptop');
    expect(device.textContent).toContain('Device');
    expect(device.textContent).toContain('100.96.0.10');
    expect(device.textContent).toContain('operator');
    expect(device.querySelector('ui-chip')?.textContent?.trim()).toBe('active');
    expect(device.textContent).toContain('2026-01-01 00:00 UTC');
    expect(node.textContent).toContain('Node');
    expect(node.textContent).toContain('node-a');
    // A device row downloads its config; a node row does not.
    expect(button('Download WireGuard config', device)).toBeTruthy();
    expect(button('Download WireGuard config', node)).toBeUndefined();
    expect(button('Revoke', device)).toBeTruthy();
    expect(button('Revoke', node)).toBeTruthy();
  });

  it('shows the private edge, or says none announced itself', async () => {
    await render();
    const card = element().querySelector('[data-private-edge]');
    expect(card?.textContent).toContain('46.224.171.33:47812');
    expect(card?.textContent).toContain('AAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAc=');
    expect(card?.textContent).toContain('2026-01-01 00:00 UTC');
  });

  it('says no private edge has announced itself on a 404', async () => {
    await render(404);
    expect(element().querySelector('[data-private-edge]')?.textContent).toContain(
      'No private edge has announced itself yet.',
    );
  });

  it('offers the connect line to copy', async () => {
    await render();
    expect(element().querySelector('app-copy-text code')?.textContent?.trim()).toBe(
      CONNECT_COMMAND,
    );
    expect(CONNECT_COMMAND).toBe('qits network-access up');
    expect(element().textContent).toContain('needs Docker');
  });

  it('offers the browsers PAC URL to copy, with its own copy button', async () => {
    await render();
    const copyTexts = Array.from(element().querySelectorAll('app-copy-text'));
    const pacCopyText = copyTexts.find(
      (el) => el.querySelector('code')?.textContent?.trim() === PAC_URL,
    );
    expect(PAC_URL).toBe('http://127.0.0.1:47813/proxy.pac');
    expect(pacCopyText).toBeTruthy();
    expect(pacCopyText?.querySelector('button')).toBeTruthy();
    expect(element().textContent).toContain('Browsers');
    expect(element().textContent).toContain('automatic proxy configuration URL');
  });

  it('narrows the list by filter, and reads Mine with owner=me', async () => {
    await render();
    button('Nodes')?.click();
    await redraw();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Node');
    button('Revoked')?.click();
    await redraw();
    expect(rows()).toHaveLength(0);
    expect(element().textContent).toContain('No peers match this filter.');
    button('Devices')?.click();
    await redraw();
    expect(rows()).toHaveLength(1);

    button('Mine')?.click();
    await redraw();
    http.expectOne(`${PEERS}?owner=me`).flush(networkAccessGoldenMaster(DEVICE, 'getPeers'));
    await redraw();
    expect(rows()).toHaveLength(1);
    expect(button('Mine')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('revokes an ACTIVE peer after a confirmation, then reads the lists again', async () => {
    await render();
    const [device] = rows();
    button('Revoke', device)?.click();
    await redraw();
    expect(button('Confirm revoke?', rows()[0])).toBeTruthy();
    http.expectNone(`${PEERS}/00000000-0000-4000-8000-000000000001/revoke`);
    button('Confirm revoke?', rows()[0])?.click();
    await redraw();
    http
      .expectOne(`${PEERS}/00000000-0000-4000-8000-000000000001/revoke`)
      .flush(networkAccessGoldenMaster(DEVICE, 'revokePeer'));
    await redraw();
    // The device's row as revoked, in the recorded list (the revoke's recorded answer).
    http.expectOne(PEERS).flush([networkAccessGoldenMaster(DEVICE, 'revokePeer')]);
    http.expectOne(NODES).flush(networkAccessGoldenMaster(NODE, 'getNodes'));
    await redraw();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].querySelector('ui-chip')?.textContent?.trim()).toBe('revoked');
    expect(button('Revoke', rows()[0])).toBeUndefined();
  });

  it('says the credential may not revoke peers on a 403', async () => {
    await render();
    button('Revoke', rows()[0])?.click();
    await redraw();
    button('Confirm revoke?', rows()[0])?.click();
    await redraw();
    http
      .expectOne(`${PEERS}/00000000-0000-4000-8000-000000000001/revoke`)
      .flush(null, { status: 403, statusText: 'Forbidden' });
    await redraw();
    expect(element().querySelector('[data-refusal]')?.textContent?.trim()).toBe(
      'Your credential may not revoke peers.',
    );
  });

  it('downloads a device’s WireGuard config as text, keeping the placeholder', async () => {
    await render();
    const clicks: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
    });
    try {
      button('Download WireGuard config', rows()[0])?.click();
      await redraw();
      http
        .expectOne(`${PEERS}/00000000-0000-4000-8000-000000000001/config`)
        .flush(networkAccessGoldenMaster<string>(DEVICE, 'getPeerConfig'));
      await redraw();
      expect(clicks).toHaveLength(1);
      expect(clicks[0].download).toBe('laptop.conf');
      const text = decodeURIComponent(
        clicks[0].href.replace(/^data:text\/plain;charset=utf-8,/, ''),
      );
      expect(text).toBe(networkAccessGoldenMaster<string>(DEVICE, 'getPeerConfig'));
      expect(text).toContain('PrivateKey = <PRIVATE_KEY>');
    } finally {
      click.mockRestore();
    }
  });
});
