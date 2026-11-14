import { type HttpRequest, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { client as networkAccessClient } from '../../api/network-access/client.gen';
import { provideHeyApiClient } from '../../api/network-access/client/client.gen';
import { WIREGUARD_KEYS, type WireGuardKeyMaker } from '$core/network-access/wireguard-keys';
import { networkAccessGoldenMaster } from '../../../testing/golden-masters';
import {
  FIXED_WIREGUARD_KEYS,
  fixedWireGuardKeys,
  noX25519,
} from '../../../testing/wireguard-keys';
import { CONNECT_COMMAND, NetworkAccessPage, NO_X25519, PAC_URL } from './network-access.page';

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
  /** Every request the page made, as sent: Add device's checks look for the private key in them. */
  let sent: HttpRequest<unknown>[];
  /** What `WIREGUARD_KEYS` makes: the fixed pair, unless a test says otherwise. */
  let makeKeys: WireGuardKeyMaker;

  beforeEach(() => {
    sent = [];
    makeKeys = fixedWireGuardKeys;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([
            (request, next) => {
              sent.push(request);
              return next(request);
            },
          ]),
        ),
        provideHttpClientTesting(),
        provideHeyApiClient(networkAccessClient),
        { provide: WIREGUARD_KEYS, useValue: () => makeKeys() },
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

  describe('Add device', () => {
    const CREATED = 'an announced private edge';
    const DEVICE_ID = '00000000-0000-4000-8000-000000000001';
    const section = () => element().querySelector('[data-add-device]') as HTMLElement;
    const input = () => section().querySelector('input') as HTMLInputElement;

    async function type(name: string) {
      input().value = name;
      input().dispatchEvent(new Event('input'));
      await redraw();
    }

    /** Types `name`, presses Add, and answers the add with `answer`. */
    async function addAnswered(name: string, answer: (request: TestRequest) => void) {
      await type(name);
      button('Add', section())?.click();
      await redraw();
      answer(http.expectOne({ method: 'POST', url: PEERS }));
      await redraw();
    }

    /** Answers the lists the add reads again, and gives the config read. */
    async function afterAdd() {
      http.expectOne(PEERS).flush(networkAccessGoldenMaster(DEVICE, 'getPeers'));
      await redraw();
      return http.expectOne(`${PEERS}/${DEVICE_ID}/app-config`);
    }

    const created = (request: TestRequest) =>
      request.flush(networkAccessGoldenMaster(CREATED, 'createPeer'), {
        status: 201,
        statusText: 'Created',
      });

    /** Whether the private key shows anywhere in what the page sent. */
    const keySent = () =>
      sent.some((request) =>
        [
          request.urlWithParams,
          JSON.stringify(request.body ?? null),
          ...headerValues(request),
        ].some((part) => part.includes(FIXED_WIREGUARD_KEYS.privateKey)),
      );

    it('sends the name and the public key, then shows the config once with the private key', async () => {
      await render();
      expect(button('Add', section())?.disabled).toBe(true);
      await addAnswered('laptop', (request) => {
        expect(request.request.body).toEqual({
          name: 'laptop',
          publicKey: FIXED_WIREGUARD_KEYS.publicKey,
        });
        created(request);
      });
      (await afterAdd()).flush(networkAccessGoldenMaster<string>(DEVICE, 'getPeerAppConfig'));
      await redraw();

      const shown = section().querySelector('[data-device-config]') as HTMLElement;
      expect(shown.textContent).toContain('laptop is added at 100.96.0.10');
      expect(shown.textContent).toContain('It is shown once and stored nowhere');
      expect(shown.textContent).toContain('revoke this device and add it again');
      const config = shown.querySelector('app-copy-text code')?.textContent ?? '';
      expect(config).toContain(`PrivateKey = ${FIXED_WIREGUARD_KEYS.privateKey}`);
      expect(config).not.toContain('<PRIVATE_KEY>');
      expect(shown.querySelector('ui-qr-code svg path')?.getAttribute('d')).toBeTruthy();
      // The config, the QR code and the key carry no data mark; nothing was sent or stored with it.
      expect(shown.querySelector('[data-qits-field], [data-qits-entity]')).toBeNull();
      expect(sent.map((request) => request.method)).toContain('POST');
      expect(keySent()).toBe(false);
      expect(JSON.stringify({ ...localStorage })).not.toContain(FIXED_WIREGUARD_KEYS.privateKey);
      expect(JSON.stringify({ ...sessionStorage })).not.toContain(FIXED_WIREGUARD_KEYS.privateKey);

      // Download .conf saves what is shown, as `<name>.conf`.
      const clicks: HTMLAnchorElement[] = [];
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        clicks.push(this);
      });
      try {
        button('Download .conf', shown)?.click();
        expect(clicks[0]?.download).toBe('laptop.conf');
        expect(
          decodeURIComponent(clicks[0].href.replace(/^data:text\/plain;charset=utf-8,/, '')),
        ).toBe(config);
      } finally {
        click.mockRestore();
      }

      button('Done', shown)?.click();
      await redraw();
      expect(section().querySelector('[data-device-config]')).toBeNull();
      expect(element().textContent).not.toContain(FIXED_WIREGUARD_KEYS.privateKey);
      expect(input().value).toBe('');
    });

    it('drops a config still shown when the page goes', async () => {
      await render();
      await addAnswered('laptop', created);
      (await afterAdd()).flush(networkAccessGoldenMaster<string>(DEVICE, 'getPeerAppConfig'));
      await redraw();
      const page = fixture.componentInstance as unknown as { added(): unknown };
      expect(page.added()).not.toBeNull();
      fixture.destroy();
      expect(page.added()).toBeNull();
    });

    it('waits for a private edge: nothing can be added without one', async () => {
      await render(404);
      await type('laptop');
      expect(input().disabled).toBe(true);
      expect(button('Add', section())?.disabled).toBe(true);
      expect(section().querySelector('[data-add-blocked]')?.textContent).toContain(
        'No private edge has announced itself yet',
      );
    });

    it('checks the name as the service does, before anything is sent', async () => {
      await render();
      await type('My_Phone');
      expect(section().querySelector('[data-name-rule]')?.textContent?.trim()).toBe(
        'name must be a DNS label: lower-case letters, digits and inner dashes, at most 63',
      );
      expect(button('Add', section())?.disabled).toBe(true);
      http.expectNone({ method: 'POST', url: PEERS });
    });

    it('shows a 400’s or a 409’s own words, and reads no config', async () => {
      await render();
      const refusals = [
        { status: 400, statusText: 'Bad Request', message: 'publicKey must decode to 32 bytes' },
        {
          status: 409,
          statusText: 'Conflict',
          message: 'you already have an active peer of this name',
        },
      ];
      for (const { status, statusText, message } of refusals) {
        await addAnswered('laptop', (request) =>
          request.flush({ message }, { status, statusText }),
        );
        expect(section().querySelector('[data-add-refusal]')?.textContent?.trim()).toBe(message);
      }
      http.expectNone(`${PEERS}/${DEVICE_ID}/app-config`);
      expect(section().querySelector('[data-device-config]')).toBeNull();
    });

    it('says the credential may not add devices on a 403', async () => {
      await render();
      await addAnswered('laptop', (request) =>
        request.flush(null, { status: 403, statusText: 'Forbidden' }),
      );
      expect(section().querySelector('[data-add-refusal]')?.textContent?.trim()).toBe(
        'Your credential may not add devices.',
      );
    });

    it('says to revoke and add again when the config cannot be read after the add', async () => {
      await render();
      await addAnswered('laptop', created);
      (await afterAdd()).flush(null, { status: 409, statusText: 'Conflict' });
      await redraw();
      expect(section().querySelector('[data-add-refusal]')?.textContent?.trim()).toBe(
        'laptop was added, but its config could not be read, and its private key is gone with ' +
          'it. Revoke it and add it again.',
      );
      expect(section().querySelector('[data-device-config]')).toBeNull();
      expect(element().textContent).not.toContain(FIXED_WIREGUARD_KEYS.privateKey);
    });

    it('sends nothing where the browser cannot make X25519 keys', async () => {
      makeKeys = noX25519;
      await render();
      await type('laptop');
      button('Add', section())?.click();
      await redraw();
      http.expectNone({ method: 'POST', url: PEERS });
      expect(section().querySelector('[data-add-refusal]')?.textContent?.trim()).toBe(NO_X25519);
    });
  });
});

/** Every header value of `request`. */
function headerValues(request: HttpRequest<unknown>): string[] {
  return request.headers.keys().flatMap((name) => request.headers.getAll(name) ?? []);
}
