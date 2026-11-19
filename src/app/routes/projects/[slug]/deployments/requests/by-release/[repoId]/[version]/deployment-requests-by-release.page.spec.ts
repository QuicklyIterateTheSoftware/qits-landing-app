import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { filter, Subject } from 'rxjs';
import { client as deploymentsClient } from '../../../../../../../../api/deployments/client.gen';
import { provideHeyApiClient as provideDeploymentsClient } from '../../../../../../../../api/deployments/client/client.gen';
import { client as projectsClient } from '../../../../../../../../api/projects/client.gen';
import { provideHeyApiClient as provideProjectsClient } from '../../../../../../../../api/projects/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { SelectedProject } from '$core/projects/selected-project';
import {
  deploymentsGoldenMaster,
  deploymentsGoldenMasters,
  goldenMaster,
  isRecorded,
} from '../../../../../../../../../testing/golden-masters';
import { DeploymentRequestsByReleasePage } from './deployment-requests-by-release.page';

/** Runs the effects a read starts on, then the generated client's few awaits. */
const settle = async () => {
  for (let i = 0; i < 3; i++) {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }
};

const WITH_VARIANT = 'a release with a variant deployed';
const REPOSITORIES = 'a project with 3 repositories';
const REQUESTS = '/deployments/api/deployment-requests';

/** A request of the recording, as far as the spec reads it. */
interface Recorded {
  readonly id: string;
  readonly applicationName: string;
  readonly variant: string | null;
  variants: string[];
  readonly repoId: string;
  readonly version: string;
}

/** Where the one request's page would render: a stand-in, the request's page is its own spec's. */
@Component({ selector: 'app-request-stand-in', template: '' })
class RequestStandIn {}

/**
 * One release's deployment requests (qits-2323) on qits-deployments' recording "a release with a
 * variant deployed" (the main application `contract-app-00000001` and its `private` variant, both
 * ACTIVE), for what a screenshot cannot show: the one-request redirect, a variant still to come,
 * Look again and which domain events read again. The repository is named from qits-projects' "a
 * project with 3 repositories". qits-deployments records the state from 2026.1119.842 on: until
 * the pin reaches it, the spec skips itself.
 */
describe.skipIf(!isRecorded(WITH_VARIANT, 'listDeploymentRequests', deploymentsGoldenMasters))(
  'DeploymentRequestsByReleasePage',
  () => {
    let http: HttpTestingController;
    let events: Subject<DomainEvent>;
    const answer = () =>
      deploymentsGoldenMaster<{ deploymentRequests: Recorded[] }>(
        WITH_VARIANT,
        'listDeploymentRequests',
      );
    const params = () =>
      deploymentsGoldenMasters.operation(WITH_VARIANT, 'listDeploymentRequests').params;

    beforeEach(() => {
      events = new Subject<DomainEvent>();
      TestBed.configureTestingModule({
        providers: [
          { provide: PLATFORM_ID, useValue: 'browser' },
          provideRouter([
            {
              path: 'projects/:slug/deployments/requests/by-release/:repoId/:version',
              component: DeploymentRequestsByReleasePage,
            },
            { path: 'projects/:slug/deployments/requests/:requestId', component: RequestStandIn },
          ]),
          provideHttpClient(),
          provideHttpClientTesting(),
          provideDeploymentsClient(deploymentsClient),
          provideProjectsClient(projectsClient),
          { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
          {
            provide: DomainEvents,
            useValue: {
              on: (names: readonly string[]) =>
                events.pipe(filter((event) => names.includes(event.name ?? ''))),
            },
          },
          {
            provide: SelectedProject,
            useValue: { project: signal({ id: 'p1' }), slug: signal('p'), url: signal('') },
          },
        ],
      });
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    const reads = () =>
      http.match((req) => req.urlWithParams.split('?')[0] === REQUESTS && req.method === 'GET');

    /**
     * The page of the recorded release (or of `repoId`), the requests answered with `body` and the
     * project's repositories with qits-projects' recording.
     */
    async function render(body: object, repoId = params()['repoId']) {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(
        `/projects/p/deployments/requests/by-release/${encodeURIComponent(repoId)}/` +
          encodeURIComponent(params()['version']),
      );
      await settle();
      const [read] = reads();
      const query = new URL(read.request.urlWithParams, 'http://x').searchParams;
      expect(query.get('repoId')).toBe(repoId);
      expect(query.get('version')).toBe(params()['version']);
      expect(query.get('includeVariants')).toBe('true');
      read.flush(body);
      http
        .expectOne('/projects/api/projects/p1/repositories')
        .flush(goldenMaster(REPOSITORIES, 'listProjectRepositories'));
      await settle();
      harness.fixture.detectChanges();
      return { harness, element: () => harness.routeNativeElement as HTMLElement };
    }

    const rowsOf = (element: HTMLElement) => Array.from(element.querySelectorAll('tbody tr'));
    const text = (node: Element | null | undefined) =>
      node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const shownText = (element: HTMLElement) =>
      Array.from(element.querySelectorAll('p, [role=alert]'))
        .filter((node) => !node.closest('.hidden'))
        .map(text)
        .join(' ');

    it('lists every request of the release, the variant’s with its variant, each linking its page', async () => {
      const { element } = await render(answer());
      const rows = rowsOf(element());
      expect(rows).toHaveLength(2);
      const [variant, main] = answer().deploymentRequests;
      const variantRow = rows.find((row) => text(row).includes(variant.applicationName))!;
      expect(text(variantRow.querySelectorAll('td')[1])).toBe('private');
      const mainRow = rows.find((row) => text(row.querySelector('td')) === main.applicationName)!;
      expect(text(mainRow.querySelectorAll('td')[1])).toBe('');
      expect(text(mainRow)).not.toContain('still to come');
      expect(variantRow.querySelector('a')?.getAttribute('href')).toBe(
        `/projects/p/deployments/requests/${variant.id}`,
      );
      expect(text(element().querySelector('h1'))).toBe(
        `${params()['repoId']}@${params()['version']}`,
      );
    });

    it('says a declared variant whose request has not arrived is still to come', async () => {
      // The recording, its main application declaring a second variant, `public`, no row deploys.
      const body = answer();
      const main = body.deploymentRequests.find((row) => !row.variant)!;
      main.variants = [...main.variants, 'public'];
      const { element } = await render(body);
      const mainRow = rowsOf(element()).find(
        (row) => text(row.querySelector('td span')) === main.applicationName,
      );
      expect(text(mainRow)).toContain('The public variant’s request is still to come.');
      expect(text(mainRow)).not.toContain('The private variant');
    });

    it('opens the one request of a release in its place', async () => {
      // The recording cut to its main application's row alone.
      const body = answer();
      const [, main] = body.deploymentRequests;
      main.variants = [];
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigateByUrl');
      const { harness } = await render({ deploymentRequests: [main] });
      await harness.fixture.whenStable();
      expect(router.url).toBe(`/projects/p/deployments/requests/${main.id}`);
      expect(navigate.mock.calls.at(-1)?.[1]).toMatchObject({ replaceUrl: true });
    });

    it('says why a release has none, and reads again on Look again', async () => {
      // The recording with its rows taken out: a release none was asked for.
      const { element } = await render({ ...answer(), deploymentRequests: [] });
      expect(shownText(element())).toContain(
        `No deployment request exists for ${params()['repoId']}@${params()['version']}: the ` +
          'release may deploy nothing (a library or an SPA), or it has not reached ' +
          'qits-deployments yet.',
      );
      const look = Array.from(element().querySelectorAll('button')).find(
        (button) => text(button) === 'Look again',
      )!;
      look.click();
      await settle();
      const again = reads();
      expect(again).toHaveLength(1);
      again[0].flush(answer());
      await settle();
    });

    it('names the release by its repository when the project has it', async () => {
      const repositories = goldenMaster(REPOSITORIES, 'listProjectRepositories');
      const repository = repositories.entries[3].repository as { id: string; name: string };
      const { element } = await render(answer(), repository.id);
      expect(text(element().querySelector('h1'))).toBe(`${repository.name}@${params()['version']}`);
    });

    it('says a refused read is a matter of roles', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(
        `/projects/p/deployments/requests/by-release/r1/${params()['version']}`,
      );
      await settle();
      reads()[0].flush(null, { status: 403, statusText: 'Forbidden' });
      http.expectOne('/projects/api/projects/p1/repositories').flush(null, {
        status: 403,
        statusText: 'Forbidden',
      });
      await settle();
      harness.fixture.detectChanges();
      const element = harness.routeNativeElement as HTMLElement;
      expect(shownText(element)).toContain(
        'Reading deployment requests needs qits:admin, qits:admin-agent, qits:desk-admin, ' +
          'qits:desk, qits:agent or qits:system.',
      );
      expect(element.querySelector('ui-load-failure')?.classList).toContain('hidden');
    });

    /** Sends `sent` as one burst and lets the debounce pass; the reads it started. */
    async function after(...sent: DomainEvent[]) {
      vi.useFakeTimers();
      try {
        for (const event of sent) events.next(event);
        vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
      } finally {
        vi.useRealTimers();
      }
      await settle();
      return reads();
    }

    const event = (name: string, payload: object): DomainEvent => ({
      name,
      payload: JSON.stringify(payload),
    });

    it('reads again after a release of its repository or a deployment on screen, never another', async () => {
      await render(answer());
      const [variant] = answer().deploymentRequests;
      const release = (repository: string) =>
        event('SoftwareRelease', { repository, version: '1', packageType: 'docker' });
      expect(await after(release('elsewhere-service'))).toHaveLength(0);
      expect(
        await after(event('DeploymentActive', { applicationName: 'qits-other', version: '1' })),
      ).toHaveLength(0);
      for (const sent of [
        release(params()['repoId']),
        event('DeploymentFailed', { applicationName: variant.applicationName, version: '1' }),
        event('DeploymentRequestDeclined', { deploymentRequestId: variant.id }),
      ]) {
        const again = await after(sent);
        expect(again).toHaveLength(1);
        again[0].flush(answer());
        await settle();
      }
    });
  },
);
