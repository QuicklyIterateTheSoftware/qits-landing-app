import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { NEVER } from 'rxjs';
import { client as maintenanceClient } from '../../../../../../api/maintenance/client.gen';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { goldenMaster, maintenanceGoldenMaster } from '../../../../../../../testing/golden-masters';
import { DomainEvents } from '$core/events/domain-events';
import { RepositoryDependentsPage } from './repository-dependents.page';

/**
 * A repository's Dependents page (qits-2489, the bottom half of qits-2334's repository page and
 * its releases), at `contract-service` of qits-projects' "a project with 3 repositories". Its
 * qits-maintenance reads are answered with "a repository with pins and bumps" (one published
 * artifact with a behind and a current dependent, a two-level downstream) or "a repository with
 * nothing pinned" (empty), whose answers the page does not check against the name; its releases
 * with qits-projects' "a repository with a release not merged to main" (rr-3 withdrawn, rr-2
 * released, rr-1 finalized) and the newest one's journey with "a release some consumers adopted".
 */
const PINS_AND_BUMPS = 'a repository with pins and bumps';
const NOTHING_PINNED = 'a repository with nothing pinned';
const REPOSITORIES = 'a project with 3 repositories';
const RELEASES = 'a repository with a release not merged to main';
const ADOPTED = 'a release some consumers adopted';
const REPO = 'contract-service';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

@Component({ template: 'stub' })
class Stub {}

describe('RepositoryDependentsPage', () => {
  let http: HttpTestingController;
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;
  const repositories = goldenMaster(REPOSITORIES, 'listProjectRepositories');
  const repoId = (name: string) =>
    repositories.entries.find(
      (entry: { repository?: { name?: string } }) => entry.repository?.name === name,
    )?.repository.id as string | undefined;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/components/:repo/dependents',
            component: RepositoryDependentsPage,
          },
          { path: 'projects/:slug/components/:repo/depends-on', component: Stub },
          { path: 'projects/:slug/components/:repo/adoption/:version', component: Stub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(maintenanceClient),
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
        // No event moves what these tests show.
        { provide: DomainEvents, useValue: { on: () => NEVER } },
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

  const repositoryUrl = (name: string) => `/maintenance/api/repositories/${name}`;
  const adoptionUrl = (version: string) =>
    `/maintenance/api/adoption/by-release?repository=${REPO}&version=${version}`;

  /**
   * The page of `name`: its dependents and downstream answered with `state`'s recordings (or
   * `status`, no body), the project's repositories with theirs; the requests and the journey left
   * open for the test.
   */
  async function open(name = REPO, state = PINS_AND_BUMPS, status = 200) {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/components/${name}/dependents`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    for (const [url, operationId] of [
      [`${repositoryUrl(name)}/dependents`, 'listRepositoryDependents'],
      [`${repositoryUrl(name)}/downstream`, 'getRepositoryDownstream'],
    ]) {
      const read = http.expectOne(url);
      if (status === 200) read.flush(maintenanceGoldenMaster(state, operationId));
      else read.flush(null, { status, statusText: 'Error' });
    }
    http.expectOne(`/projects/api/projects/${project.id}/repositories`).flush(repositories);
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    return { harness, element };
  }

  /** The page of {@link REPO}, every read answered. */
  async function render(state = PINS_AND_BUMPS) {
    const opened = await open(REPO, state);
    const requests = goldenMaster(RELEASES, 'listRepositoryReleaseRequests');
    http
      .expectOne(`/projects/api/repositories/${repoId(REPO)}/release-requests?state=all`)
      .flush(requests);
    await answered(opened.harness);
    http
      .expectOne(adoptionUrl('2026.101.100400'))
      .flush(maintenanceGoldenMaster(ADOPTED, 'getAdoptionByRelease'));
    await answered(opened.harness);
    return opened;
  }

  const alerts = (element: HTMLElement) =>
    [...element.querySelectorAll<HTMLElement>('[role="alert"]')].filter(
      (alert) => !alert.closest('.hidden'),
    );

  const text = (element: Element | null | undefined, selector?: string) =>
    (selector ? element?.querySelector(selector) : element)?.textContent
      ?.replace(/\s+/g, ' ')
      .trim() ?? '';

  it('groups dependents per published artifact, each repository linked to its Depends on, behind first', async () => {
    const { element } = await render();
    const artifact = element.querySelector('[data-artifact]')!;
    const heading = [...artifact.querySelectorAll('h4 span')].map((span) => text(span));
    expect(heading).toEqual(['eu.wohlben.qits:contract-core', 'maven', 'latest 2026.1101.2']);
    const rows = [...artifact.querySelectorAll('li')];
    expect(rows.map((row) => text(row.querySelector('a')))).toEqual([
      'contract-daemon',
      'contract-service',
    ]);
    expect(text(rows[0])).toContain('behind');
    expect(text(rows[1])).toContain('current');
    expect(rows[0].querySelector('a')!.getAttribute('href')).toBe(
      `/projects/${project.slug}/components/contract-daemon/depends-on`,
    );
    expect(alerts(element)).toEqual([]);
  });

  it('shows the downstream closure with depth, links and via, counted', async () => {
    const { element } = await render();
    const table = element.querySelector('table[aria-label="Downstream"]')!;
    expect(text(table, 'caption')).toBe('3 repositories downstream');
    const rows = [...table.querySelectorAll('tbody tr')].map((row) => text(row));
    expect(rows).toEqual([
      '1 contract-daemon DAEMON contract-javalib',
      '1 contract-service SERVICE contract-javalib',
      '2 contract-cli CLI contract-service',
    ]);
    expect(table.querySelector('a')!.getAttribute('href')).toBe(
      `/projects/${project.slug}/components/contract-daemon/depends-on`,
    );
  });

  it('lists the released versions, newest first, each linking its adoption page', async () => {
    const { element } = await render();
    const links = [...element.querySelectorAll<HTMLAnchorElement>('ul[aria-label="Releases"] a')];
    expect(links.map((a) => text(a))).toEqual(['2026.101.100400', '2026.101.100100']);
    expect(links[0].getAttribute('href')).toBe(
      `/projects/${project.slug}/components/${REPO}/adoption/2026.101.100400`,
    );
  });

  it('says how far the newest release got downstream', async () => {
    const { element } = await render();
    const { adopters } = maintenanceGoldenMaster(ADOPTED, 'getAdoptionByRelease');
    const adopted = adopters.filter((a: { state: string }) => a.state === 'ADOPTED').length;
    expect(text(element, '[data-adoption]')).toBe(
      `${adopted} of ${adopters.length} downstream carry 2026.101.100400`,
    );
  });

  it('says each section is empty for a repository nothing embeds and with no release', async () => {
    const opened = await open(REPO, NOTHING_PINNED);
    http
      .expectOne(`/projects/api/repositories/${repoId(REPO)}/release-requests?state=all`)
      .flush({ requests: [] });
    await answered(opened.harness);
    const { element } = opened;
    expect(text(element, '[data-no-dependents]')).toBe(
      `Nothing of ours embeds what ${REPO} publishes.`,
    );
    expect(text(element, '[data-no-downstream]')).toBe(`Nothing is downstream of ${REPO}.`);
    expect(text(element, '[data-no-releases]')).toBe(`${REPO} has no release yet.`);
    expect(element.querySelector('[data-adoption]')).toBeNull();
  });

  it('says the project has no such repository instead of reading its releases', async () => {
    const { element } = await open('contract-javalib');
    expect(text(element, '[data-unknown]')).toBe(
      'This project has no repository contract-javalib.',
    );
    http.expectNone((request) => request.url.includes('/release-requests'));
  });

  it('says a refusal needs a staff role on a 403', async () => {
    const opened = await open(REPO, PINS_AND_BUMPS, 403);
    http
      .expectOne(`/projects/api/repositories/${repoId(REPO)}/release-requests?state=all`)
      .flush({ requests: [] });
    await answered(opened.harness);
    const [alert] = alerts(opened.element);
    expect(alert.textContent).toContain('Reading a repository’s dependents needs a staff role');
  });
});
