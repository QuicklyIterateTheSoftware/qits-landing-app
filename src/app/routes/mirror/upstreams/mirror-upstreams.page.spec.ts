import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as mirrorClient } from '../../../api/mirror/client.gen';
import { provideHeyApiClient } from '../../../api/mirror/client/client.gen';
import type { Upstreams } from '$core/mirror/upstreams.consumes';
import { mirrorGoldenMaster } from '../../../../testing/golden-masters';
import { MirrorUpstreamsPage } from './mirror-upstreams.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const UPSTREAMS = '/mirror/api/upstreams';

/** The recorded upstreams: docker.io, quay.io and registry.access.redhat.com, no images cached. */
const recorded = (): Upstreams =>
  mirrorGoldenMaster<Upstreams>('the default caches', 'listUpstreams');

/**
 * The OCI upstreams page (qits-2357) on answers derived from qits-mirror's recording ("the default
 * caches"): the rows in the server's order with their columns, a mirror fronting no registry (the
 * recording with no rows), and a failed read. Its screenshots are its browser spec's.
 */
describe('MirrorUpstreamsPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(mirrorClient),
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

  /** The page, its one read answered by `answer`; the page's element. */
  async function shown(
    answer: (request: ReturnType<HttpTestingController['expectOne']>) => void,
  ): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(MirrorUpstreamsPage);
    fixture.detectChanges();
    await ticked();
    answer(http.expectOne(UPSTREAMS));
    await ticked();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('lists each upstream’s host, namespace, cached images and registration, in the server’s order', async () => {
    const element = await shown((request) => request.flush(recorded()));
    const cells = [...element.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => text(cell)),
    );
    expect(cells).toEqual([
      ['docker.io', 'hub', '0', '1 Jan 2026 00:00:00Z'],
      ['quay.io', 'quay', '0', '1 Jan 2026 00:00:00Z'],
      ['registry.access.redhat.com', 'redhat', '0', '1 Jan 2026 00:00:00Z'],
    ]);
    expect(text(element.querySelector('[data-lede]'))).toBe('3 mirrored registries');
  });

  it('keeps the server’s order rather than sorting', async () => {
    const answer = recorded();
    const reversed = { upstreams: [...(answer.upstreams ?? [])].reverse() };
    const element = await shown((request) => request.flush(reversed));
    const hosts = [...element.querySelectorAll('tbody tr td:first-child')].map((cell) =>
      text(cell),
    );
    expect(hosts).toEqual(['registry.access.redhat.com', 'quay.io', 'docker.io']);
  });

  it('says a mirror fronting no registry fronts none, with no table', async () => {
    // The recording with no rows: what the door answers once every upstream is deleted.
    const element = await shown((request) => request.flush({ ...recorded(), upstreams: [] }));
    expect(text(element.querySelector('[role="status"]'))).toBe('This mirror fronts no registry.');
    expect(element.querySelector('table')).toBeNull();
    expect(text(element.querySelector('[data-lede]'))).toBe('0 mirrored registries');
  });

  it('says the upstreams cannot be read on a failed read', async () => {
    const element = await shown((request) =>
      request.flush(null, { status: 500, statusText: 'Internal Server Error' }),
    );
    expect(text(element.querySelector('ui-load-failure'))).toContain(
      'The mirror’s upstreams cannot be read right now.',
    );
    expect(element.querySelector('table')).toBeNull();
  });
});
