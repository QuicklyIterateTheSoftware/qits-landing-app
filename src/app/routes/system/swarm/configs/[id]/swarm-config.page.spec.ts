import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { NEVER } from 'rxjs';
import { client as systemClient } from '../../../../../api/system/client.gen';
import { provideHeyApiClient } from '../../../../../api/system/client/client.gen';
import type { SwarmConfigDetail } from '$core/system/swarm.consumes';
import { systemGoldenMasters } from '../../../../../../testing/golden-masters';
import { configContent, configLabelPairs, SwarmConfigPage } from './swarm-config.page';

/**
 * One swarm config's page (qits-2349), its read answered with qits-system's recording "a
 * single-node swarm" (`qits-edge-vhosts`, one label, its data one line of text, `binary: false`).
 * What no pinned recording holds yet is derived from the recorded config and says how: a config
 * with no data, one holding binary data, one with several labels or none. A 404, a 403 and a 503
 * are statuses only.
 */
const SWARM = 'a single-node swarm';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const recorded = () => systemGoldenMasters.body<SwarmConfigDetail>(SWARM, 'getSwarmConfig');

/** The recorded config's id, as the configs list links it. */
const CONFIG = 'ktnbjxoalbkvbvedmg1urrz8h';

@Component({ template: 'stub' })
class Stub {}

describe('SwarmConfigPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'system/swarm/configs/:id', component: SwarmConfigPage },
          { path: 'system/swarm/configs', component: Stub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(systemClient),
        // The page has no `refreshOn`; a stream that never sends.
        { provide: QITS_DOMAIN_EVENTS, useValue: { on: () => NEVER } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Lets the requests go out and the page draw. */
  async function answered(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
      harness.fixture.detectChanges();
    }
  }

  /** The page of config `id`, its read answered with `body` (or `status` and no body). */
  async function render(id: string, body: object | null, status = 200) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/system/swarm/configs/${id}`);
    await answered(harness);
    const read = http.expectOne(`/system/api/swarm/configs/${id}`);
    if (status === 200) read.flush(body);
    else read.flush(body, { status, statusText: 'Error' });
    await answered(harness);
    return { harness, element: harness.routeNativeElement as HTMLElement };
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('sorts labels by key and tells data, binary and empty apart', () => {
    expect(configLabelPairs({ zone: 'fsn1', 'qits.edge': 'true' })).toEqual([
      'qits.edge=true',
      'zone=fsn1',
    ]);
    expect(configLabelPairs({})).toEqual([]);
    expect(configContent({ data: 'a\n', binary: false })).toBe('data');
    expect(configContent({ data: '', binary: false })).toBe('empty');
    // The door answers a binary config's data `""`: binary, never empty.
    expect(configContent({ data: '', binary: true })).toBe('binary');
  });

  it('shows the recorded config: its id, exact instants, label and data verbatim', async () => {
    const config = recorded();
    const { element } = await render(CONFIG, config);
    expect(text(element.querySelector('h1'))).toBe('qits-edge-vhosts');
    const facts = [...element.querySelectorAll('dl[aria-label="Facts"] > *')].map((cell) =>
      text(cell),
    );
    expect(facts).toEqual([
      'ID',
      CONFIG,
      'Created',
      '18 Aug 2026 04:31:02Z',
      'Updated',
      '18 Aug 2026 04:31:02Z',
      'Labels',
      'qits.platform.deployments.target=platform',
    ]);
    // The served instant, nanoseconds and all, on hover.
    expect(element.querySelector('[data-created]')?.getAttribute('title')).toBe(config.createdAt);
    expect(element.querySelector('[data-updated]')?.getAttribute('title')).toBe(config.updatedAt);
    expect(element.querySelector('[data-labels] ui-chip')).not.toBeNull();
    // Verbatim: the trailing newline too, nothing trimmed or parsed.
    const pre = element.querySelector('pre[data-content]');
    expect(pre?.textContent).toBe(config.data);
    expect(element.querySelector('[data-binary], [data-empty]')).toBeNull();
  });

  it('says a config with no data is empty, with no data block', async () => {
    // The recorded config with the fields a config holding nothing answers.
    const { element } = await render(CONFIG, { ...recorded(), data: '', labels: {} });
    expect(text(element.querySelector('[data-empty]'))).toBe('This config is empty.');
    expect(element.querySelector('pre')).toBeNull();
    expect(text(element.querySelector('[data-labels]'))).toBe('—');
  });

  it('says a binary config holds binary data, never that it is empty', async () => {
    // The recorded config as the door answers bytes that are not UTF-8: `""` and `binary: true`.
    const { element } = await render(CONFIG, { ...recorded(), data: '', binary: true });
    expect(text(element.querySelector('[data-binary]'))).toBe(
      'This config holds binary data, which is not shown.',
    );
    expect(element.querySelector('[data-empty]')).toBeNull();
    expect(element.querySelector('pre')).toBeNull();
  });

  it('draws each of several labels on its own chip, by key', async () => {
    // The recorded config with two labels in reverse order.
    const { element } = await render(CONFIG, { ...recorded(), labels: { b: '2', a: '1' } });
    expect(
      [...element.querySelectorAll('[data-labels] ui-chip')].map((chip) => text(chip)),
    ).toEqual(['a=1', 'b=2']);
  });

  it('says there is no such config, and shows nothing else', async () => {
    const { element } = await render('no-such-config', null, 404);
    expect(text(element.querySelector('[data-missing]'))).toBe('No swarm config no-such-config.');
    expect(element.querySelector('[data-config]')).toBeNull();
    expect(text(element.querySelector('h1'))).toBe('no-such-config');
  });

  it('says a 403 is a missing role', async () => {
    const { element } = await render(CONFIG, null, 403);
    expect(text(element.querySelector('[role="alert"]'))).toContain(
      'Reading the swarm needs an admin role',
    );
    expect(element.querySelector('ui-load-failure')).toBeNull();
  });

  it('says a 503 is the swarm not answering, with Retry', async () => {
    const { element } = await render(CONFIG, null, 503);
    expect(text(element.querySelector('ui-load-failure'))).toContain(
      'The swarm cannot be read right now.',
    );
    expect(element.querySelector('[data-config]')).toBeNull();
  });
});
