import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { NEVER } from 'rxjs';
import { client as systemClient } from '../../../../api/system/client.gen';
import { provideHeyApiClient } from '../../../../api/system/client/client.gen';
import type { SwarmConfig } from '$core/system/swarm.consumes';
import { systemGoldenMaster } from '../../../../../testing/golden-masters';
import { SwarmConfigsPage } from './swarm-configs.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const CONFIGS = '/system/api/swarm/configs';

/** The recorded swarm: one config, `qits-edge-vhosts`, with one label. */
const recorded = (): SwarmConfig[] =>
  systemGoldenMaster<SwarmConfig[]>('a single-node swarm', 'listSwarmConfigs');

/**
 * The swarm configs page (qits-2348) on answers its screenshots cannot show yet, each derived from
 * qits-system's recorded swarm ("a single-node swarm"): an empty listing (the recording with no
 * rows), and a config with no labels and one with several (the recorded row with its labels
 * changed). Created and Updated are docker's text, shown as served: the assertions read it from
 * the recording rather than spelling it. The page has no `refreshOn`; the live stream is one that
 * never sends.
 */
describe('SwarmConfigsPage', () => {
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
  async function shown(answer: SwarmConfig[]): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(SwarmConfigsPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(CONFIGS).flush(answer);
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

  it('lists the recorded config with its label and docker’s dates as given', async () => {
    const [config] = recorded();
    const element = await shown(recorded());
    expect([...element.querySelectorAll('thead th')].map((heading) => text(heading))).toEqual([
      'Name',
      'ID',
      'Labels',
      'Created',
      'Updated',
    ]);
    expect(cells(element)).toEqual([
      [
        'qits-edge-vhosts',
        'ktnbjxoalbkv',
        'qits.platform.deployments.target=platform',
        config.createdAt,
        config.updatedAt,
      ],
    ]);
    // The whole id on hover; the label on a chip; the name is no link (qits-2349's).
    expect(element.querySelector('tbody td[title]')?.getAttribute('title')).toBe(
      'ktnbjxoalbkvbvedmg1urrz8h',
    );
    expect(element.querySelector('tbody ui-chip')?.textContent?.trim()).toBe(
      'qits.platform.deployments.target=platform',
    );
    expect(element.querySelector('tbody a')).toBeNull();
    expect(text(element.querySelector('[data-lede]'))).toBe('1 config');
  });

  it('says a swarm holding no configs holds none, with no table', async () => {
    // The recording with no rows: what the door answers for a swarm holding none.
    const element = await shown(recorded().slice(0, 0));
    expect(text(element.querySelector('[role="status"]'))).toBe('This swarm holds no configs.');
    expect(element.querySelector('table')).toBeNull();
    expect(text(element.querySelector('[data-lede]'))).toBe('0 configs');
  });

  it('draws a dash for a config with no labels, and each of several labels on its own chip, by key', async () => {
    const [config] = recorded();
    const element = await shown([
      { ...config, labels: {} },
      { ...config, id: 'q3zk0n5d1x8a7m2p4r6t9v0wy', name: 'other', labels: { b: '2', a: '1' } },
    ]);
    const rows = element.querySelectorAll('tbody tr');
    expect(cells(element)[0][2]).toBe('—');
    expect(rows[0].querySelector('ui-chip')).toBeNull();
    expect([...rows[1].querySelectorAll('ui-chip')].map((chip) => text(chip))).toEqual([
      'a=1',
      'b=2',
    ]);
    expect(cells(element)[1][2]).toBe('a=1 b=2');
    expect(text(element.querySelector('[data-lede]'))).toBe('2 configs');
  });

  it('says a 503 is the swarm not answering, and a 403 a missing role', async () => {
    const fixture = TestBed.createComponent(SwarmConfigsPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(CONFIGS).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await ticked();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element.querySelector('ui-load-failure'))).toContain(
      'The swarm cannot be read right now.',
    );

    const refused = TestBed.createComponent(SwarmConfigsPage);
    refused.detectChanges();
    await ticked();
    http.expectOne(CONFIGS).flush(null, { status: 403, statusText: 'Forbidden' });
    await ticked();
    refused.detectChanges();
    const refusal = refused.nativeElement as HTMLElement;
    expect(text(refusal.querySelector('[role="alert"]'))).toContain(
      'Reading the swarm needs an admin role',
    );
    expect(refusal.querySelector('ui-load-failure')).toBeNull();
  });
});
