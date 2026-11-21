import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { client as mirrorClient } from '../../../../api/mirror/client.gen';
import { provideHeyApiClient } from '../../../../api/mirror/client/client.gen';
import type { RepositoryPackages } from '$core/mirror/repository-packages.consumes';
import {
  isRecorded,
  mirrorGoldenMaster,
  mirrorGoldenMasters,
} from '../../../../../testing/golden-masters';
import { MirrorRepositoryPage } from './mirror-repository.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const OPERATION = 'listRepositoryPackages';
const OCI = 'a mirror holding a pinned and an unpinned tag';
const MAVEN = 'a maven cache holding a cached artifact';
const NPM = 'an npm cache holding a package';
const EMPTY = 'the default caches';

/** What `state` recorded for the page's read. */
const recorded = (state: string): RepositoryPackages =>
  mirrorGoldenMaster<RepositoryPackages>(state, OPERATION);

/** Whether the pinned golden masters record `state` (qits-mirror records most from qits-2358 on). */
const holds = (state: string) => isRecorded(state, OPERATION, mirrorGoldenMasters);

/**
 * A cache root's page (qits-2358) on answers derived from qits-mirror's recordings: an OCI root
 * (digests shortened, tags as chips, the pin sentence, no Files column), a maven root (the Files
 * column), an npm root, a root nobody pulled through (the recording with no packages), an unknown
 * name (404), a failed read (500), the search and the selection. A case recorded only from a later
 * qits-mirror release than the pinned one skips itself. Its screenshots are its browser spec's.
 */
describe('MirrorRepositoryPage', () => {
  let http: HttpTestingController;

  /** Configures the page at `/mirror/repositories/<name>`. */
  function at(name: string) {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(mirrorClient),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ repository: name })) },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => http.verify());

  /** Runs the page's effects and lets the client build its request. */
  async function ticked() {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      await settle();
    }
  }

  /** The page at `name`, its one read answered by `answer`; the fixture. */
  async function shown(
    name: string,
    answer: (request: ReturnType<HttpTestingController['expectOne']>) => void,
  ) {
    at(name);
    const fixture = TestBed.createComponent(MirrorRepositoryPage);
    fixture.detectChanges();
    await ticked();
    answer(http.expectOne(`/mirror/api/repositories/${name}/packages`));
    await ticked();
    fixture.detectChanges();
    return fixture;
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  const table = (element: HTMLElement, label: string) =>
    element.querySelector(`table[aria-label="${label}"]`);

  const headers = (element: HTMLElement, label: string) =>
    [...(table(element, label)?.querySelectorAll('th') ?? [])].map((cell) => text(cell));

  const cells = (element: HTMLElement, label: string) =>
    [...(table(element, label)?.querySelectorAll('tbody tr') ?? [])].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => text(cell)),
    );

  it.skipIf(!holds(OCI))(
    'shows an OCI root’s type, upstream, totals, eviction rule with the pin sentence, and its digests',
    async () => {
      const element = (await shown('hub', (request) => request.flush(recorded(OCI))))
        .nativeElement as HTMLElement;
      expect(text(element.querySelector('h1'))).toBe('hub');
      const facts = text(element.querySelector('[data-facts]'));
      expect(facts).toContain('oci-mirror');
      expect(facts).toContain('a cache of docker.io');
      expect(text(element.querySelector('[data-lede]'))).toBe(
        '1 image · 2 cached versions · 800 B',
      );
      expect(text(element.querySelector('[data-eviction]'))).toBe(
        'Entries unused for 30 days are evicted by the next sweep. A tag that an image pin from ' +
          'qits-maintenance names is kept whatever its age; the pins reach the mirror only at ' +
          'sweep time, so they are not shown here.',
      );
      expect(cells(element, 'Packages')).toEqual([
        ['library/node', '2', '800 B', '1 Jan 2026 00:00:00Z'],
      ]);
      expect(headers(element, 'Versions')).toEqual([
        'Version',
        'Tags',
        'Size',
        'Cached',
        'Last used',
      ]);
      expect(cells(element, 'Versions')).toEqual([
        [
          'sha256:555492b05ef5',
          '24-alpine',
          '400 B',
          '1 Jan 2026 00:00:00Z',
          '1 Jan 2026 00:00:00Z',
        ],
        [
          'sha256:a88d1a5183df',
          '22-alpine',
          '400 B',
          '1 Jan 2026 00:00:00Z',
          '1 Jan 2026 00:00:00Z',
        ],
      ]);
      const digest = table(element, 'Versions')?.querySelector('tbody td');
      expect(digest?.getAttribute('title')).toBe(recorded(OCI).packages?.[0].versions?.[0].version);
      expect(table(element, 'Versions')?.querySelectorAll('ui-chip')).toHaveLength(2);
    },
  );

  it.skipIf(!holds(MAVEN))('shows a maven root’s coordinates with a Files column', async () => {
    const element = (await shown('central', (request) => request.flush(recorded(MAVEN))))
      .nativeElement as HTMLElement;
    expect(text(element.querySelector('[data-lede]'))).toBe(
      '1 coordinate · 1 cached version · 160 B',
    );
    expect(text(element.querySelector('[data-eviction]'))).toBe(
      'Entries unused for 90 days are evicted by the next sweep.',
    );
    expect(headers(element, 'Versions')).toContain('Files');
    const [row] = cells(element, 'Versions');
    expect(row.slice(0, 3)).toEqual(['1.0.0', '—', '2']);
    const files = table(element, 'Versions')?.querySelectorAll('tbody td')[2];
    expect(files?.getAttribute('title')).toBe(
      'contract-library-1.0.0.jar\ncontract-library-1.0.0.pom',
    );
  });

  it('shows an npm root’s packages with their tags and no Files column', async () => {
    const element = (await shown('npmjs', (request) => request.flush(recorded(NPM))))
      .nativeElement as HTMLElement;
    expect(text(element.querySelector('[data-lede]'))).toBe('1 package · 1 cached version · 70 B');
    expect(cells(element, 'Packages')).toEqual([['left-pad', '1', '70 B', '1 Jan 2026 00:00:00Z']]);
    expect(headers(element, 'Versions')).not.toContain('Files');
    expect(cells(element, 'Versions')[0].slice(0, 2)).toEqual(['1.3.0', 'latest']);
  });

  it('says a root without an eviction window is not swept, and one without an upstream lost it', async () => {
    // The npm recording with eviction off and its upstream deleted, which no recording holds.
    const answer = recorded(NPM);
    const element = (
      await shown('npmjs', (request) =>
        request.flush({
          ...answer,
          repository: { ...answer.repository, evictionWindow: null, upstream: null },
        }),
      )
    ).nativeElement as HTMLElement;
    expect(text(element.querySelector('[data-eviction]'))).toBe(
      'This cache is not swept: nothing is evicted.',
    );
    expect(text(element.querySelector('[data-facts]'))).toContain(
      'Its upstream was deleted: it serves what is cached and fetches nothing new.',
    );
  });

  it('marks never-used entries as never', async () => {
    // The npm recording with no last use, as a version cached but never served again reads.
    const answer = recorded(NPM);
    const [pkg] = answer.packages ?? [];
    const element = (
      await shown('npmjs', (request) =>
        request.flush({
          ...answer,
          packages: [
            {
              ...pkg,
              lastAccessedAt: null,
              versions: (pkg.versions ?? []).map((v) => ({ ...v, lastAccessedAt: null })),
            },
          ],
        }),
      )
    ).nativeElement as HTMLElement;
    expect(cells(element, 'Packages')[0][3]).toBe('never');
    expect(cells(element, 'Versions')[0].at(-1)).toBe('never');
  });

  it('keeps the server’s order, selects the first package, and swaps the versions on a press', async () => {
    // The npm recording with a second package before the first: the server's order is kept.
    const answer = recorded(NPM);
    const [pkg] = answer.packages ?? [];
    const second = {
      ...pkg,
      name: 'zz-pad',
      versions: (pkg.versions ?? []).map((v) => ({ ...v, version: '9.9.9', labels: [] })),
    };
    const fixture = await shown('npmjs', (request) =>
      request.flush({ ...answer, packages: [second, pkg] }),
    );
    const element = fixture.nativeElement as HTMLElement;
    expect(cells(element, 'Packages').map((row) => row[0])).toEqual(['zz-pad', 'left-pad']);
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('tbody button')];
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(cells(element, 'Versions')[0].slice(0, 2)).toEqual(['9.9.9', '—']);
    buttons[1].click();
    fixture.detectChanges();
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(cells(element, 'Versions')[0].slice(0, 2)).toEqual(['1.3.0', 'latest']);
  });

  it('narrows the packages by name, and says when none match', async () => {
    const fixture = await shown('npmjs', (request) => request.flush(recorded(NPM)));
    const element = fixture.nativeElement as HTMLElement;
    const search = element.querySelector<HTMLInputElement>('input[type="search"]');
    expect(search?.getAttribute('aria-label')).toBe('Search packages');
    search!.value = 'LEFT';
    search!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(cells(element, 'Packages')).toHaveLength(1);
    search!.value = 'nothing-like-it';
    search!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(table(element, 'Packages')).toBeNull();
    expect(table(element, 'Versions')).toBeNull();
    expect(text(element.querySelector('[role="status"]'))).toBe(
      'No packages match “nothing-like-it”.',
    );
  });

  it.skipIf(!holds(EMPTY))('says nothing is cached in a root nobody pulled through', async () => {
    const element = (await shown('hub', (request) => request.flush(recorded(EMPTY))))
      .nativeElement as HTMLElement;
    expect(text(element.querySelector('[role="status"]'))).toBe(
      'Nothing is cached in hub yet. It fills as clients pull through it.',
    );
    expect(text(element.querySelector('[data-lede]'))).toBe('0 images · 0 cached versions · 0 B');
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelector('input[type="search"]')).toBeNull();
  });

  it('says the mirror has no root of an unknown name, with no Retry', async () => {
    const element = (
      await shown('nope', (request) =>
        request.flush(null, { status: 404, statusText: 'Not Found' }),
      )
    ).nativeElement as HTMLElement;
    expect(text(element.querySelector('[role="status"]'))).toBe(
      'The mirror has no cache root called nope.',
    );
    expect(element.querySelector('ui-load-failure')).toBeNull();
    expect(element.querySelector('table')).toBeNull();
  });

  it('says the contents cannot be read on a failed read, with Retry', async () => {
    const element = (
      await shown('hub', (request) =>
        request.flush(null, { status: 500, statusText: 'Internal Server Error' }),
      )
    ).nativeElement as HTMLElement;
    const failure = element.querySelector('ui-load-failure');
    expect(text(failure)).toContain('This cache’s contents cannot be read right now.');
    expect(failure?.classList.contains('hidden')).toBe(false);
    expect(element.querySelector('table')).toBeNull();
  });
});
