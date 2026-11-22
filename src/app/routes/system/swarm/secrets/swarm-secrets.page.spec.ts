import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { NEVER } from 'rxjs';
import { client as systemClient } from '../../../../api/system/client.gen';
import { provideHeyApiClient } from '../../../../api/system/client/client.gen';
import { formatInstant } from '$core/release-requests/release-request-model';
import type { SwarmSecret } from '$core/system/swarm.consumes';
import { chipClass } from '$ui/components/chip/chip';
import { systemGoldenMaster } from '../../../../../testing/golden-masters';
import { SwarmSecretsPage } from './swarm-secrets.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const SECRETS = '/system/api/swarm/secrets';

/**
 * The recorded swarm's secrets: `qits-dns-hetzner-token-…` (labelled, used by no service) and
 * `qits-platform-idp-signing-key` (no labels, used by `dev-qits-artifacts`).
 */
const recorded = (): SwarmSecret[] =>
  systemGoldenMaster<SwarmSecret[]>('a single-node swarm', 'listSwarmSecrets');

/**
 * The swarm secrets page (qits-2350) on answers its screenshots do not show, each derived from
 * qits-system's recorded swarm ("a single-node swarm"): the recorded rows as drawn, an empty
 * listing (the recording with no rows), and every secret in use (the recorded rows with the used
 * one's `usedBy` given to both: no ", unused" in the caption). The page's `refreshOn` is its
 * browser spec's; the live stream here is one that never sends.
 */
describe('SwarmSecretsPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(systemClient),
        { provide: QITS_DOMAIN_EVENTS, useValue: { on: () => NEVER } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Runs the page's effects and lets the client build its request. */
  async function ticked() {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      await settle();
    }
  }

  /** The page, its one read answered with `answer`; the page's element. */
  async function shown(answer: SwarmSecret[]): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(SwarmSecretsPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(SECRETS).flush(answer);
    await ticked();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** Each cell's text of the table's rows. */
  const cells = (element: HTMLElement) =>
    [...element.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => text(cell)),
    );

  it('lists the recorded secrets with their usage, labels and formatted instants', async () => {
    const [hetzner, idp] = recorded();
    const element = await shown(recorded());
    expect([...element.querySelectorAll('thead th')].map((heading) => text(heading))).toEqual([
      'Name',
      'ID',
      'Used by',
      'Labels',
      'Created',
      'Updated',
    ]);
    expect(cells(element)).toEqual([
      [
        'qits-dns-hetzner-token-2d945672e91b',
        'x4kq7v2m9p1c',
        'Unused',
        'qits.platform.deployments.target=platform',
        formatInstant(hetzner.createdAt),
        formatInstant(hetzner.updatedAt),
      ],
      [
        'qits-platform-idp-signing-key',
        'jvbcnrfhrbn8',
        'dev-qits-artifacts',
        '—',
        formatInstant(idp.createdAt),
        formatInstant(idp.updatedAt),
      ],
    ]);
    // The whole id, and the served instant, on hover.
    expect(
      [...element.querySelectorAll('tbody td[title]')].map((cell) => cell.getAttribute('title')),
    ).toEqual([
      'x4kq7v2m9p1c8d0w5n3b6e2rt',
      hetzner.createdAt,
      hetzner.updatedAt,
      'jvbcnrfhrbn8u9c9c0nfg2rrj',
      idp.createdAt,
      idp.updatedAt,
    ]);
    // Unused is a waiting chip, a service a neutral one.
    const [unused, used] = [...element.querySelectorAll('tbody tr')].map((row) =>
      row.querySelectorAll('td')[2].querySelector('ui-chip'),
    );
    expect(text(unused)).toBe('Unused');
    expect(unused?.className).toContain(chipClass('waiting'));
    expect(text(used)).toBe('dev-qits-artifacts');
    expect(used?.className).toContain(chipClass('neutral'));
    expect(text(element.querySelector('[data-lede]'))).toBe('2 secrets, 1 unused');
    expect(text(element)).toContain('Secret values are never shown');
  });

  it('says a swarm holding no secrets holds none, with no table', async () => {
    // The recording with no rows: what the door answers for a swarm holding none.
    const element = await shown(recorded().slice(0, 0));
    expect(text(element.querySelector('[role="status"]'))).toBe('This swarm holds no secrets.');
    expect(element.querySelector('table')).toBeNull();
    expect(text(element.querySelector('[data-lede]'))).toBe('0 secrets');
  });

  it('counts no unused secret while every one is in use', async () => {
    const [unused, used] = recorded();
    const element = await shown([{ ...unused, usedBy: used.usedBy }, used]);
    expect(text(element.querySelector('[data-lede]'))).toBe('2 secrets');
    expect(text(element)).not.toContain('Unused');
  });

  it('says a 503 is the swarm not answering, and a 403 a missing role', async () => {
    const fixture = TestBed.createComponent(SwarmSecretsPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(SECRETS).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await ticked();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element.querySelector('ui-load-failure'))).toContain(
      'The swarm cannot be read right now.',
    );

    const refused = TestBed.createComponent(SwarmSecretsPage);
    refused.detectChanges();
    await ticked();
    http.expectOne(SECRETS).flush(null, { status: 403, statusText: 'Forbidden' });
    await ticked();
    refused.detectChanges();
    const refusal = refused.nativeElement as HTMLElement;
    expect(text(refusal.querySelector('[role="alert"]'))).toContain(
      'Reading the swarm needs an admin role',
    );
    expect(refusal.querySelector('ui-load-failure')).toBeNull();
  });
});
