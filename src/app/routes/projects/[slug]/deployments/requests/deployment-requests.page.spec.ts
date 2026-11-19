import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { filter, Subject } from 'rxjs';
import { client as deploymentsClient } from '../../../../../api/deployments/client.gen';
import { provideHeyApiClient } from '../../../../../api/deployments/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { ProjectReleaseRequests } from '$core/projects/project-release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import {
  deploymentsGoldenMaster,
  deploymentsGoldenMasters,
  isRecorded,
} from '../../../../../../testing/golden-masters';
import { DeploymentRequestsPage } from './deployment-requests.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const WITH_REQUESTS = 'a project with deployment requests';
const LIST = '/deployments/api/deployment-requests';

/** A request of the recording: the held one first (newest first), then the deployed one. */
interface Recorded {
  readonly id: string;
  readonly applicationName: string;
  readonly repoId: string;
}

/**
 * The Deployments section's Requests page (qits-2315) on qits-deployments' recordings, for what a
 * screenshot cannot show: which domain events read the list again. The open project is the
 * recorded one ("a project with deployment requests"' `projectId`), and its release requests name
 * one repository, `billing-service`, which no deployment request names. qits-deployments records
 * the state from 2026.1119.842 on: until the pin reaches it, the spec skips
 * itself.
 */
describe.skipIf(!isRecorded(WITH_REQUESTS, 'listDeploymentRequests', deploymentsGoldenMasters))(
  'DeploymentRequestsPage',
  () => {
    let http: HttpTestingController;
    let events: Subject<DomainEvent>;
    const projectId = () =>
      deploymentsGoldenMasters.operation(WITH_REQUESTS, 'listDeploymentRequests').params[
        'projectId'
      ];
    const recorded = (): readonly Recorded[] =>
      deploymentsGoldenMaster(WITH_REQUESTS, 'listDeploymentRequests').deploymentRequests;

    beforeEach(() => {
      events = new Subject<DomainEvent>();
      TestBed.configureTestingModule({
        providers: [
          { provide: PLATFORM_ID, useValue: 'browser' },
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          provideHeyApiClient(deploymentsClient),
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
            useValue: { project: signal({ id: projectId() }), slug: signal('p'), url: signal('') },
          },
          {
            provide: ProjectReleaseRequests,
            useValue: { requests: signal([{ repoName: 'billing-service' }]) },
          },
        ],
      });
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    const listReads = () => http.match((req) => req.urlWithParams.split('?')[0] === LIST);

    async function shown() {
      const fixture = TestBed.createComponent(DeploymentRequestsPage);
      fixture.detectChanges();
      await ticked();
      const [read] = listReads();
      expect(new URL(read.request.urlWithParams, 'http://x').searchParams.get('projectId')).toBe(
        projectId(),
      );
      read.flush(deploymentsGoldenMaster(WITH_REQUESTS, 'listDeploymentRequests'));
      await settle();
      await fixture.whenStable();
      fixture.detectChanges();
      return { fixture, element: fixture.nativeElement as HTMLElement };
    }

    /** Runs the page's effects and lets the client build its requests. */
    async function ticked() {
      for (let i = 0; i < 3; i++) {
        TestBed.tick();
        await settle();
      }
    }

    /** Sends `sent` as one burst and lets the debounce pass; the reads it started. */
    async function after(...sent: DomainEvent[]) {
      vi.useFakeTimers();
      try {
        for (const event of sent) events.next(event);
        vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
      } finally {
        vi.useRealTimers();
      }
      await ticked();
      return listReads();
    }

    const event = (name: string, payload: object): DomainEvent => ({
      name,
      payload: JSON.stringify(payload),
    });

    it('shows the held request as pending and the deployed one as completed', async () => {
      const { element } = await shown();
      const [held, deployed] = recorded();
      const pending = element.querySelector(
        'section[aria-labelledby="deployment-requests-pending"]',
      );
      const completed = element.querySelector(
        'section[aria-labelledby="deployment-requests-completed"]',
      );
      expect(pending?.textContent).toContain(held.applicationName);
      expect(completed?.textContent).toContain(deployed.applicationName);
      const open = completed?.querySelector('a') as HTMLAnchorElement;
      expect(open.getAttribute('href')).toBe(`/projects/p/deployments/requests/${deployed.id}`);
    });

    it('reads again after a decline of a request on screen, never of another', async () => {
      await shown();
      const [held] = recorded();
      expect(
        await after(event('DeploymentRequestDeclined', { deploymentRequestId: 'another' })),
      ).toHaveLength(0);
      const reads = await after(
        event('DeploymentRequestDeclined', { deploymentRequestId: held.id }),
      );
      expect(reads).toHaveLength(1);
      reads[0].flush(deploymentsGoldenMaster(WITH_REQUESTS, 'listDeploymentRequests'));
      await settle();
    });

    it('reads again after any deployment while a request is pending, once per burst', async () => {
      await shown();
      const reads = await after(
        event('DeploymentQueued', { applicationName: 'qits-other', version: '1' }),
        event('DeploymentStarted', { applicationName: 'qits-other', version: '1' }),
      );
      expect(reads).toHaveLength(1);
      reads[0].flush(deploymentsGoldenMaster(WITH_REQUESTS, 'listDeploymentRequests'));
      await settle();
    });

    it('reads again after a release of a repository on screen or of the project, never another', async () => {
      await shown();
      const [, deployed] = recorded();
      const release = (repository: string) =>
        event('SoftwareRelease', { repository, version: '1', packageType: 'docker' });
      expect(await after(release('elsewhere-service'))).toHaveLength(0);
      for (const repository of [deployed.repoId, 'billing-service']) {
        const reads = await after(release(repository));
        expect(reads).toHaveLength(1);
        reads[0].flush(deploymentsGoldenMaster(WITH_REQUESTS, 'listDeploymentRequests'));
        await settle();
      }
    });
  },
);
