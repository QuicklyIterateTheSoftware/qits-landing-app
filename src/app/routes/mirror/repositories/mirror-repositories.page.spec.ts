import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client as mirrorClient } from '../../../api/mirror/client.gen';
import { provideHeyApiClient } from '../../../api/mirror/client/client.gen';
import type { CacheRoots } from '$core/mirror/repositories.consumes';
import { mirrorGoldenMaster } from '../../../../testing/golden-masters';
import { MirrorRepositoriesPage } from './mirror-repositories.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const ROOTS = '/mirror/api/repositories';

/** The recorded roots: central, hub, npmjs, quay and redhat. */
const recorded = (): CacheRoots =>
  mirrorGoldenMaster<CacheRoots>('the default caches', 'listRepositories');

/**
 * The Caches page (qits-2471) on answers derived from qits-mirror's recording ("the default
 * caches"): the rows in the server's order with their columns, a root whose upstream was deleted
 * or that is not swept, a mirror holding no root (the recording with no rows), and a failed read.
 * Its screenshots are its browser spec's.
 */
describe('MirrorRepositoriesPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(mirrorClient),
        provideRouter([]),
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
    const fixture = TestBed.createComponent(MirrorRepositoriesPage);
    fixture.detectChanges();
    await ticked();
    answer(http.expectOne(ROOTS));
    await ticked();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('lists each root’s name, type, upstream, eviction window and registration, in the server’s order', async () => {
    const element = await shown((request) => request.flush(recorded()));
    const cells = [...element.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => text(cell)),
    );
    const at = '1 Jan 2026 00:00:00Z';
    expect(cells).toEqual([
      ['central', 'maven-proxy', 'https://repo1.maven.org/maven2', '90 days', at],
      ['hub', 'oci-mirror', 'docker.io', '30 days', at],
      ['npmjs', 'npm-proxy', 'https://registry.npmjs.org', '30 days', at],
      ['quay', 'oci-mirror', 'quay.io', '30 days', at],
      ['redhat', 'oci-mirror', 'registry.access.redhat.com', '30 days', at],
    ]);
    expect(text(element.querySelector('[data-lede]'))).toBe('5 cache roots');
    const links = [...element.querySelectorAll('tbody a')].map((a) => a.getAttribute('href'));
    expect(links[0]).toBe('/mirror/repositories/central');
  });

  it('keeps the server’s order rather than sorting', async () => {
    const answer = recorded();
    const reversed = { repositories: [...(answer.repositories ?? [])].reverse() };
    const element = await shown((request) => request.flush(reversed));
    const names = [...element.querySelectorAll('tbody tr td:first-child')].map((cell) =>
      text(cell),
    );
    expect(names).toEqual(['redhat', 'quay', 'npmjs', 'hub', 'central']);
  });

  it('says a deleted upstream and an unswept cache in words', async () => {
    // The recording's hub, as a mirror with its upstream deleted and eviction off answers it.
    const answer = recorded();
    const hub = { ...answer.repositories![1], upstream: null, evictionWindow: null };
    const element = await shown((request) => request.flush({ repositories: [hub] }));
    const cells = [...element.querySelectorAll('tbody td')].map((cell) => text(cell));
    expect(cells.slice(0, 4)).toEqual(['hub', 'oci-mirror', 'deleted', 'not swept']);
  });

  it('says a mirror holding no cache root holds none, with no table', async () => {
    const element = await shown((request) => request.flush({ ...recorded(), repositories: [] }));
    expect(text(element.querySelector('[role="status"]'))).toBe('This mirror holds no cache root.');
    expect(element.querySelector('table')).toBeNull();
    expect(text(element.querySelector('[data-lede]'))).toBe('0 cache roots');
  });

  it('says the caches cannot be read on a failed read', async () => {
    const element = await shown((request) =>
      request.flush(null, { status: 500, statusText: 'Internal Server Error' }),
    );
    expect(text(element.querySelector('ui-load-failure'))).toContain(
      'The mirror’s caches cannot be read right now.',
    );
    expect(element.querySelector('table')).toBeNull();
  });
});
