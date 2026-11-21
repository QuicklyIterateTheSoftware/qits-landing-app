import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { NEVER } from 'rxjs';
import { client as systemClient } from '../../../../../../api/system/client.gen';
import { provideHeyApiClient } from '../../../../../../api/system/client/client.gen';
import type { NodeImage } from '$core/system/node-images.consumes';
import { OPEN_SWARM_NODE } from '$core/system/open-swarm-node';
import type { SwarmNodeDetail } from '$core/system/swarm.consumes';
import { systemGoldenMaster } from '../../../../../../../testing/golden-masters';
import { SwarmNodeImagesPage } from './swarm-node-images.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const SWARM = 'a single-node swarm';

/** The node "a single-node swarm" recorded (`fake-host`, `self`), as the layout read it. */
const recordedNode = (): SwarmNodeDetail =>
  systemGoldenMaster<SwarmNodeDetail>(SWARM, 'getSwarmNode');

/** Its one image: `qits-ci:3e501b6`, 325 000 000 bytes, created `+0200 CEST`, three containers. */
const recordedImages = (): NodeImage[] => systemGoldenMaster<NodeImage[]>(SWARM, 'listNodeImages');

/**
 * A swarm node's Images tab (qits-2353) on what its screenshots cannot show yet, each derived from
 * qits-system's recordings of "a single-node swarm" and saying how: an image nothing uses, a
 * dangling image, a count docker did not make and a date that is none (the recorded row with those
 * fields changed); no images (the recording with no rows); another node (the recorded node with
 * `self` false, which the tab never reads); a 409 `NODE_REMOTE` (its body as qits-system answers
 * it), a 403 and a 503. The open node is the layout's (`OPEN_SWARM_NODE`), given here as signals.
 * The live stream is one that never sends: the tab's `refreshOn` is its browser spec's.
 */
describe('SwarmNodeImagesPage', () => {
  let http: HttpTestingController;
  const node = signal<SwarmNodeDetail | undefined>(undefined);
  const nodeId = signal('local');

  beforeEach(() => {
    node.set(recordedNode());
    nodeId.set('local');
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(systemClient),
        { provide: QITS_DOMAIN_EVENTS, useValue: { on: () => NEVER } },
        { provide: OPEN_SWARM_NODE, useValue: { nodeId, node } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Runs the tab's effects and lets the client build its request. */
  async function ticked() {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      await settle();
    }
  }

  const IMAGES = '/system/api/nodes/local/images';

  /** The tab, its read still open (or never made); the fixture. */
  async function opened() {
    const fixture = TestBed.createComponent(SwarmNodeImagesPage);
    fixture.detectChanges();
    await ticked();
    return fixture;
  }

  /** The tab, its one read answered with `body` (and `status`); the tab's element. */
  async function shown(body: unknown, status = 200): Promise<HTMLElement> {
    const fixture = await opened();
    const read = http.expectOne(IMAGES);
    if (status === 200) read.flush(body as object);
    else read.flush(body as object | null, { status, statusText: 'Error' });
    await ticked();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  const cells = (element: HTMLElement) =>
    [...element.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => text(cell)),
    );

  it('lists the recorded image: repository, tag, short id, created, size, in use', async () => {
    const element = await shown(recordedImages());
    const heads = [...element.querySelectorAll('thead th')].map((cell) => text(cell));
    expect(heads).toEqual(['Repository', 'Tag', 'ID', 'Created', 'Size', 'In use']);
    expect(heads).not.toContain('Digest');
    expect(cells(element)).toEqual([
      [
        'registry.dev.localhost:8080/qits/qits-ci',
        '3e501b6',
        '14beaf669b73',
        // `2026-08-18 04:46:43 +0200 CEST`, by its offset.
        '18 Aug 2026 02:46:43Z',
        '310 MiB',
        '3',
      ],
    ]);
    expect(element.querySelector('[data-image-id]')?.getAttribute('title')).toBe(
      'sha256:14beaf669b73',
    );
    expect(text(element.querySelector('[data-caption]'))).toBe('1 image, 310 MiB');
    expect(element.querySelector('ui-chip')).toBeNull();
  });

  it('chips an image nothing uses and a dangling one, and dashes what docker did not give', async () => {
    // The recorded row three times: unused; dangling and not counted (`N/A`); dated no date.
    const [image] = recordedImages();
    const element = await shown([
      { ...image, id: 'sha256:aaaaaaaaaaaa1111', containers: '0' },
      {
        ...image,
        id: 'sha256:bbbbbbbbbbbb2222',
        repository: '<none>',
        tag: '<none>',
        containers: 'N/A',
      },
      { ...image, id: 'sha256:cccccccccccc3333', createdAt: '5 days ago' },
    ]);
    const rows = cells(element);
    expect(rows.map((row) => row[0])).toEqual([
      'registry.dev.localhost:8080/qits/qits-ci',
      'dangling',
      'registry.dev.localhost:8080/qits/qits-ci',
    ]);
    expect(rows.map((row) => row[1])).toEqual(['3e501b6', '—', '3e501b6']);
    expect(rows.map((row) => row[2])).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc']);
    expect(rows.map((row) => row[3])).toEqual([
      '18 Aug 2026 02:46:43Z',
      '18 Aug 2026 02:46:43Z',
      '—',
    ]);
    expect(rows.map((row) => row[5])).toEqual(['unused', '—', '3']);
    expect(text(element.querySelector('[data-caption]'))).toBe('3 images, 930 MiB');
  });

  it('says a node holding no images holds none, with no table', async () => {
    // The recording with no rows: what `docker image ls` answers on a node holding none.
    const element = await shown(recordedImages().slice(0, 0));
    expect(text(element.querySelector('[role="status"]'))).toBe('This node holds no images.');
    expect(element.querySelector('table')).toBeNull();
    expect(text(element.querySelector('[data-caption]'))).toBe('0 images, 0 B');
  });

  it('reads nothing until the layout has read the node', async () => {
    node.set(undefined);
    const fixture = await opened();
    expect(http.match(IMAGES)).toHaveLength(0);
    node.set(recordedNode());
    await ticked();
    http.expectOne(IMAGES).flush(recordedImages());
    await ticked();
    fixture.detectChanges();
    expect(cells(fixture.nativeElement)).toHaveLength(1);
  });

  it('reads nothing of another node, and says only the local one can be read', async () => {
    // The recorded node as another node of the swarm: not the one qits-system runs on.
    node.set({ ...recordedNode(), self: false });
    nodeId.set('worker-1');
    const fixture = await opened();
    fixture.detectChanges();
    expect(http.match(() => true)).toHaveLength(0);
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element.querySelector('[role="status"]'))).toBe(
      'Only the node qits-system runs on can be read; this is another node.',
    );
    expect(element.querySelector('ui-load-failure')).toBeNull();
    expect(element.querySelector('table')).toBeNull();
  });

  it('says a 409 NODE_REMOTE is another node, in the door’s words, never a failure', async () => {
    // The refusal as qits-system answers it for a node it does not run on (live, 2026-11-20).
    const element = await shown(
      { code: 'NODE_REMOTE', message: 'only the local node is reachable in this version' },
      409,
    );
    expect(text(element.querySelector('[role="status"]'))).toBe(
      'Only the node qits-system runs on can be read; this is another node. (only the local node is reachable in this version)',
    );
    expect(element.querySelector('ui-load-failure')).toBeNull();
    expect(element.querySelector('button')).toBeNull();
  });

  it('reads again on Retry after a 503, and lists what it answers', async () => {
    const fixture = await opened();
    http.expectOne(IMAGES).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await ticked();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('ui-load-failure button')!.click();
    await ticked();
    http.expectOne(IMAGES).flush(recordedImages());
    await ticked();
    fixture.detectChanges();
    expect(element.querySelector('ui-load-failure')?.classList.contains('hidden')).toBe(true);
    expect(cells(element)).toHaveLength(1);
  });

  it('says a 503 is a load failure with Retry, and a 403 a missing role', async () => {
    const unavailable = await shown(null, 503);
    const failure = unavailable.querySelector('ui-load-failure');
    expect(failure?.classList.contains('hidden')).toBe(false);
    expect(text(failure)).toContain('The node’s images cannot be read right now.');

    const refused = await shown(null, 403);
    expect(text(refused.querySelector('[role="alert"]'))).toContain(
      'Reading the swarm needs an admin role',
    );
    expect(refused.querySelector('ui-load-failure')).toBeNull();
  });
});
