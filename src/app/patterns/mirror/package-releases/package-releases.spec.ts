import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client as maintenanceClient } from '../../../api/maintenance/client.gen';
import { provideHeyApiClient } from '../../../api/maintenance/client/client.gen';
import type { ArtifactDependents, DependencyEntry } from '$core/maintenance/maintenance.consumes';
import { maintenanceGoldenMaster } from '../../../../testing/golden-masters';
import { PackageReleases } from './package-releases';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const DEPENDENCIES = '/maintenance/api/dependencies';
const DEPENDENTS = '/maintenance/api/dependencies/dependents';

/** A request URL's path, without its query. */
const pathOf = (url: string) => url.split('?')[0];

/** One query parameter of a request URL. */
const queryOf = (url: string, key: string) => new URL(url, 'http://x').searchParams.get(key);

/** "released artifacts, some behind": contract-core embedded by a daemon, an image and a jar. */
const released = (): ArtifactDependents =>
  maintenanceGoldenMaster<ArtifactDependents>(
    'released artifacts, some behind',
    'listDependencyDependents',
  );

/** "external dependencies matching a glob, some behind": left-pad among other external pins. */
const external = (): DependencyEntry[] =>
  maintenanceGoldenMaster<DependencyEntry[]>(
    'external dependencies matching a glob, some behind',
    'listDependencies',
  );

/**
 * Which of our releases embed a cached package, and who pins it (qits-2488), on answers derived
 * from qits-maintenance's recordings: the requests it makes per cache type (an image's dependents
 * wait for its pins), the dependents grouped by version with their links, the pins with the
 * behind ones marked, nothing either way, and a refusal.
 */
describe('PackageReleases', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(maintenanceClient),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function ticked() {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      await settle();
    }
  }

  async function shown(root: string, type: string, name: string) {
    const fixture = TestBed.createComponent(PackageReleases);
    fixture.componentRef.setInput('root', root);
    fixture.componentRef.setInput('type', type);
    fixture.componentRef.setInput('name', name);
    fixture.detectChanges();
    await ticked();
    return fixture;
  }

  async function settled(fixture: { detectChanges(): void }) {
    await ticked();
    fixture.detectChanges();
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  const rows = (element: HTMLElement, label: string) =>
    [...element.querySelectorAll(`table[aria-label="${label}"] tbody tr`)].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => text(cell)),
    );

  it('asks for an npm package by its name, and lists who embeds it per version and who pins it', async () => {
    const fixture = await shown('npmjs', 'npm-proxy', 'left-pad');
    const pins = http.expectOne((r) => pathOf(r.url) === DEPENDENCIES);
    expect(queryOf(pins.request.urlWithParams, 'kind')).toBe('EXTERNAL');
    expect(queryOf(pins.request.urlWithParams, 'name')).toBe('left-pad');
    const dependents = http.expectOne((r) => pathOf(r.url) === DEPENDENTS);
    expect(queryOf(dependents.request.urlWithParams, 'ecosystem')).toBe('npm');
    expect(queryOf(dependents.request.urlWithParams, 'name')).toBe('left-pad');
    pins.flush(external());
    dependents.flush(released());
    await settled(fixture);
    const element = fixture.nativeElement as HTMLElement;
    expect(rows(element, 'Releases that embed it')).toEqual([
      ['2026.1101.1', 'contract-daemon', '2026.1104.1', 'contract-daemon', 'direct'],
      ['2026.1101.2', 'qits/contract-service', '2026.1102.1', 'contract-service', 'direct'],
      [
        '',
        'eu.wohlben.qits:contract-service-client',
        '2026.1102.1',
        'contract-service',
        'transitive',
      ],
    ]);
    const links = [...element.querySelectorAll('table[aria-label="Releases that embed it"] a')].map(
      (a) => a.getAttribute('href'),
    );
    expect(links).toEqual([
      '/artifacts/repositories/daemons/daemons/contract-daemon',
      '/artifacts/repositories/qits/images/contract-service',
      '/artifacts/repositories/maven/maven-packages/eu.wohlben.qits:contract-service-client',
    ]);
    const pinned = rows(element, 'Pins');
    expect(pinned.length).toBeGreaterThan(0);
    expect(pinned.every((row) => row[1] === '1.3.0')).toBe(true);
  });

  it('asks an image’s dependents by the name its pins use, once they answered', async () => {
    const fixture = await shown('hub', 'oci-mirror', 'library/node');
    const pins = http.expectOne((r) => pathOf(r.url) === DEPENDENCIES);
    expect(queryOf(pins.request.urlWithParams, 'name')).toBe('*node');
    http.expectNone((r) => pathOf(r.url) === DEPENDENTS);
    pins.flush([
      { ecosystem: 'npm', name: '@types/node', latest: null, error: null, pins: [] },
      ...external()
        .slice(0, 1)
        .map((entry) => ({ ...entry, ecosystem: 'docker', name: 'node' })),
    ]);
    await settled(fixture);
    const dependents = http.expectOne((r) => pathOf(r.url) === DEPENDENTS);
    expect(queryOf(dependents.request.urlWithParams, 'ecosystem')).toBe('docker');
    expect(queryOf(dependents.request.urlWithParams, 'name')).toBe('node');
    dependents.flush({ ...released(), dependents: [] });
    await settled(fixture);
  });

  it('says when no release embeds the package and no repository pins it', async () => {
    const fixture = await shown('npmjs', 'npm-proxy', 'left-pad');
    http.expectOne((r) => pathOf(r.url) === DEPENDENCIES).flush([]);
    http.expectOne((r) => pathOf(r.url) === DEPENDENTS).flush({ ...released(), dependents: [] });
    await settled(fixture);
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element.querySelector('[data-no-dependents]'))).toBe(
      'No release of ours embeds left-pad.',
    );
    expect(text(element.querySelector('[data-no-pins]'))).toBe(
      'No repository of ours pins left-pad.',
    );
  });

  it('says which roles may read the inventory on a 403', async () => {
    const fixture = await shown('central', 'maven-proxy', 'g:a');
    http
      .expectOne((r) => pathOf(r.url) === DEPENDENCIES)
      .flush(null, { status: 403, statusText: 'Forbidden' });
    http
      .expectOne((r) => pathOf(r.url) === DEPENDENTS)
      .flush(null, { status: 403, statusText: 'Forbidden' });
    await settled(fixture);
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element.querySelector('[role="alert"]'))).toContain('needs a staff role');
  });
});
