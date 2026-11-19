import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { filter, Subject } from 'rxjs';
import { client as deploymentsClient } from '../../../../../../api/deployments/client.gen';
import { provideHeyApiClient } from '../../../../../../api/deployments/client/client.gen';
import { OpenDeploymentRequest } from '$core/deployments/open-deployment-request';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { ProjectReleaseRequests } from '$core/projects/project-release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import {
  deploymentsGoldenMaster,
  deploymentsGoldenMasters,
  isRecorded,
} from '../../../../../../../testing/golden-masters';
import { DeploymentRequestPage } from './deployment-request.page';

/** Runs the effects a read starts on, then the generated client's few awaits. */
const settle = async () => {
  for (let i = 0; i < 3; i++) {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }
};

const DEPLOYED = 'a deployment request that deployed';
const HELD = 'a deployment request held for approval';
const HELD_FOR_DECLINE = 'a deployment request held for decline';
const IN_TIER = 'an application deployed in an environment';
const AN_ENVIRONMENT = 'an environment';

const REQUESTS = '/deployments/api/deployment-requests';
const TIER = '/deployments/api/deployments';
const ENVIRONMENTS = '/deployments/api/environments';

/**
 * One deployment request's page (qits-2322) on qits-deployments' recordings, for what a screenshot
 * cannot show: the writes and their refusals, the tiles a failed side read degrades, and which
 * domain events read the request again. The recorded requests, the tier's deployments and the
 * tiers share their frozen ids (application `contract-app-00000001` in tier
 * `00000000-0000-4000-8000-000000000001`). The project's release requests are the shell's
 * (`ProjectReleaseRequests`), stood in for by a release request of the recorded repository.
 */
describe.skipIf(!isRecorded(DEPLOYED, 'getDeploymentRequest', deploymentsGoldenMasters))(
  'DeploymentRequestPage',
  () => {
    let http: HttpTestingController;
    let events: Subject<DomainEvent>;
    const releaseReload = vi.fn();
    const recorded = (state: string) => deploymentsGoldenMaster(state, 'getDeploymentRequest');

    beforeEach(() => {
      events = new Subject<DomainEvent>();
      releaseReload.mockReset();
      const request = recorded(DEPLOYED).deploymentRequest;
      TestBed.configureTestingModule({
        providers: [
          { provide: PLATFORM_ID, useValue: 'browser' },
          provideRouter([
            {
              path: 'projects/:slug/deployments/requests/:requestId',
              component: DeploymentRequestPage,
            },
          ]),
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
            useValue: { project: signal({ id: 'p1' }), slug: signal('p'), url: signal('') },
          },
          {
            provide: ProjectReleaseRequests,
            useValue: {
              state: signal('loaded'),
              requests: signal([
                {
                  repoName: request.repoId,
                  version: request.version,
                  mergedToMainAt: '2026-01-02T00:00:00Z',
                },
              ]),
              resource: { reload: releaseReload },
            },
          },
        ],
      });
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    const reads = (path: string) =>
      http.match((req) => req.urlWithParams.split('?')[0] === path && req.method === 'GET');

    /** The page at the request of `state`, the request read answered (and the side reads too). */
    async function render(state: string, answerSides = true) {
      const id = recorded(state).deploymentRequest.id as string;
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/projects/p/deployments/requests/${id}`);
      await settle();
      http.expectOne(`${REQUESTS}/${id}`).flush(recorded(state));
      await settle();
      if (answerSides) {
        const [tier] = reads(TIER);
        expect(
          new URL(tier.request.urlWithParams, 'http://x').searchParams.get('environmentId'),
        ).toBe(recorded(state).deploymentRequest.environmentId);
        tier.flush(deploymentsGoldenMaster(IN_TIER, 'listDeployments'));
        http
          .expectOne(ENVIRONMENTS)
          .flush(deploymentsGoldenMaster(AN_ENVIRONMENT, 'listEnvironments'));
        await settle();
      }
      harness.fixture.detectChanges();
      return { id, harness, element: harness.routeNativeElement as HTMLElement };
    }

    const tile = (element: HTMLElement, id: string) =>
      element.querySelector(`[data-stage="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim();

    const button = (element: HTMLElement, label: RegExp) =>
      Array.from(element.querySelectorAll('button')).find((b) => label.test(b.textContent ?? ''))!;

    const alertText = (element: HTMLElement) =>
      Array.from(element.querySelectorAll('[role=alert]'))
        .filter((alert) => !alert.closest('.hidden'))
        .map((alert) => alert.textContent?.replace(/\s+/g, ' ').trim());

    /** Sends `sent` as one burst and lets the debounce pass. */
    async function after(...sent: DomainEvent[]) {
      vi.useFakeTimers();
      try {
        for (const event of sent) events.next(event);
        vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
      } finally {
        vi.useRealTimers();
      }
      await settle();
    }

    const event = (name: string, payload: object): DomainEvent => ({
      name,
      payload: JSON.stringify(payload),
    });

    it('shows a deployed version running in its tier and merged, and names it in the trail', async () => {
      const { id, element } = await render(DEPLOYED);
      const request = recorded(DEPLOYED).deploymentRequest;
      expect(element.querySelector('h1')?.textContent?.trim()).toBe(
        `${request.version} · ${request.applicationName}`,
      );
      expect(tile(element, 'released')).toContain(`Released ${request.version}`);
      expect(tile(element, 'tier')).toContain('Running in contract-00000001');
      expect(tile(element, 'tier')).toContain('reached');
      expect(tile(element, 'merged')).toContain('2 Jan 2026 00:00:00Z');
      expect(element.textContent).toContain('Gate met');
      expect(element.querySelector('pre')).toBeNull();
      const commit = element.querySelector('code[title]');
      expect(commit?.getAttribute('title')).toBe(recorded(DEPLOYED).deployment.commitSha);
      expect(commit?.textContent?.trim()).toBe(recorded(DEPLOYED).deployment.commitSha.slice(0, 7));
      expect(TestBed.inject(OpenDeploymentRequest).shown()).toEqual({
        id,
        version: request.version,
        applicationName: request.applicationName,
      });
    });

    it('degrades only the tiles whose reads failed', async () => {
      const { element } = await render(DEPLOYED, false);
      reads(TIER)[0].flush(null, { status: 500, statusText: 'Server Error' });
      http.expectOne(ENVIRONMENTS).flush(null, { status: 500, statusText: 'Server Error' });
      await settle();
      const environmentId = recorded(DEPLOYED).deploymentRequest.environmentId;
      expect(tile(element, 'tier')).toContain(`Running in ${environmentId}`);
      expect(tile(element, 'tier')).toContain('the tier’s deployments could not be read');
      expect(element.textContent).toContain('Gate met');
      expect(alertText(element)).toEqual([]);
    });

    it('approves a held request on the second press and shows the answer in its place', async () => {
      const { id, element } = await render(HELD);
      expect(element.textContent).toContain('Held for approval');
      expect(element.textContent).toContain('No deployment was queued for this request.');
      expect(element.textContent).toContain(
        'A decline is final — the release request ends WITHDRAWN.',
      );
      button(element, /^\s*Approve\s*$/).click();
      await settle();
      expect(http.match(`${REQUESTS}/${id}/approve`)).toHaveLength(0);
      button(element, /Confirm approve\?/).click();
      await settle();
      const approve = http.expectOne(`${REQUESTS}/${id}/approve`);
      expect(approve.request.method).toBe('POST');
      approve.flush(deploymentsGoldenMaster(HELD, 'approveDeploymentRequest'));
      await settle();
      TestBed.tick();
      expect(element.textContent).toContain('Approved by an-operator');
      expect(element.textContent).toContain('Queued');
      expect(reads(`${REQUESTS}/${id}`)).toHaveLength(0);
    });

    it('declines with the note typed, then clears it', async () => {
      const { id, element } = await render(HELD_FOR_DECLINE);
      const input = element.querySelector('input') as HTMLInputElement;
      input.value = 'the change is wrong';
      input.dispatchEvent(new Event('input'));
      button(element, /^\s*Decline\s*$/).click();
      await settle();
      button(element, /Confirm decline\?/).click();
      await settle();
      const decline = http.expectOne(`${REQUESTS}/${id}/decline`);
      expect(decline.request.body).toEqual({ note: 'the change is wrong' });
      decline.flush(deploymentsGoldenMaster(HELD_FOR_DECLINE, 'declineDeploymentRequest'));
      await settle();
      TestBed.tick();
      expect(element.textContent).toContain('Declined by an-operator at');
      expect(element.querySelector('input')).toBeNull();
    });

    it('says a 409 means somebody settled it first, and reads the request again', async () => {
      const { id, element } = await render(HELD);
      button(element, /^\s*Approve\s*$/).click();
      await settle();
      button(element, /Confirm approve\?/).click();
      await settle();
      http
        .expectOne(`${REQUESTS}/${id}/approve`)
        .flush(null, { status: 409, statusText: 'Conflict' });
      await settle();
      TestBed.tick();
      expect(alertText(element)).toEqual([
        'This request is no longer held: somebody settled it first. Reading it again.',
      ]);
      const [again] = reads(`${REQUESTS}/${id}`);
      expect(again).toBeDefined();
      again.flush(recorded(HELD));
      await settle();
    });

    it('names a refused decline beside the buttons, the page kept', async () => {
      const { id, element } = await render(HELD);
      button(element, /^\s*Decline\s*$/).click();
      await settle();
      button(element, /Confirm decline\?/).click();
      await settle();
      const decline = http.expectOne(`${REQUESTS}/${id}/decline`);
      expect(decline.request.body).toBeNull();
      decline.flush(null, { status: 404, statusText: 'Not Found' });
      await settle();
      TestBed.tick();
      expect(alertText(element)).toEqual(['Could not decline: no such deployment request.']);
      expect(element.textContent).toContain('Held for approval');
    });

    it('says when no deployment request has the id', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/projects/p/deployments/requests/nope');
      await settle();
      http.expectOne(`${REQUESTS}/nope`).flush(null, { status: 404, statusText: 'Not Found' });
      await settle();
      harness.fixture.detectChanges();
      const element = harness.routeNativeElement as HTMLElement;
      const missing = Array.from(element.querySelectorAll('p')).find((p) =>
        p.textContent?.includes('No deployment request nope.'),
      );
      expect(missing?.classList.contains('hidden')).toBe(false);
      expect(element.querySelector('ui-load-failure')?.classList.contains('hidden')).toBe(true);
    });

    it('reads the request and the tier again after its own events only', async () => {
      const { id } = await render(DEPLOYED);
      const request = recorded(DEPLOYED).deploymentRequest;
      await after(
        event('DeploymentActive', { applicationName: 'qits-other', version: '1' }),
        event('DeploymentRequestDeclined', { deploymentRequestId: 'another' }),
        event('SoftwareRelease', { repository: 'elsewhere-service', version: '1' }),
      );
      expect(reads(`${REQUESTS}/${id}`)).toHaveLength(0);
      expect(reads(TIER)).toHaveLength(0);
      for (const sent of [
        event('DeploymentStarted', { applicationName: request.applicationName, version: '2' }),
        event('DeploymentRequestDeclined', { deploymentRequestId: id }),
        event('SoftwareRelease', { repository: request.repoId, version: '2' }),
      ]) {
        await after(sent);
        const [again] = reads(`${REQUESTS}/${id}`);
        expect(again).toBeDefined();
        again.flush(recorded(DEPLOYED));
        const [tier] = reads(TIER);
        expect(tier).toBeDefined();
        tier.flush(deploymentsGoldenMaster(IN_TIER, 'listDeployments'));
        await settle();
      }
    });

    it('reads all four again on Refresh', async () => {
      const { id, element } = await render(DEPLOYED);
      button(element, /Refresh/).click();
      await settle();
      reads(`${REQUESTS}/${id}`)[0].flush(recorded(DEPLOYED));
      reads(TIER)[0].flush(deploymentsGoldenMaster(IN_TIER, 'listDeployments'));
      http
        .expectOne(ENVIRONMENTS)
        .flush(deploymentsGoldenMaster(AN_ENVIRONMENT, 'listEnvironments'));
      expect(releaseReload).toHaveBeenCalledTimes(1);
      await settle();
    });
  },
);
