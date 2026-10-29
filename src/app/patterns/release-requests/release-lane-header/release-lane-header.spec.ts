import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { goldenMaster } from '../../../../testing/golden-masters';
import type { BranchLane } from '$core/release-requests/branch-graph';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
import { ReleaseLaneHeader } from './release-lane-header';

/**
 * The frozen request qits-projects records for the soft feature freeze (epic qits-1580): `main`,
 * which never counts, and three branches naming work items, which do.
 */
const frozen: ReleaseRequest = goldenMaster(
  'a frozen release request with a queued next request',
  'getReleaseRequest',
).request;

/** The request queued behind it, with `main` and one branch of its own. */
const queued: ReleaseRequest = goldenMaster(
  'a frozen release request with a queued next request',
  'getProjectReleaseRequest',
).request;

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ReleaseLaneHeader', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function chips(request: ReleaseRequest, lane: BranchLane): (string | undefined)[] {
    const fixture = TestBed.createComponent(ReleaseLaneHeader);
    fixture.componentRef.setInput('request', request);
    fixture.componentRef.setInput('lane', lane);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return [...element.querySelectorAll('ui-chip')].map((chip) => chip.textContent?.trim());
  }

  it('marks a source that counts toward the feature freeze, and not one that never counts', () => {
    expect(chips(frozen, { label: 'ticket/contract-11', kind: 'source' })).toEqual(['counted']);
    expect(chips(frozen, { label: 'main', kind: 'source' })).toEqual([]);
  });

  it('marks a source that joined the frozen request by its id', () => {
    // Derived from the recorded frozen request: a fourth counted branch named onto it while it was
    // frozen, which qits-projects admits as an explicit join.
    const joined: ReleaseRequest = {
      ...frozen,
      sources: [
        ...(frozen.sources ?? []),
        {
          kind: 'BRANCH',
          name: 'ticket/contract-15',
          ref: 'refs/heads/ticket/contract-15',
          implicit: false,
          priority: 'MEDIUM',
          feature: true,
          explicitJoin: true,
        },
      ],
    };
    expect(chips(joined, { label: 'ticket/contract-15', kind: 'source' })).toEqual([
      'counted',
      'joined',
    ]);
  });

  it('marks nothing on a lane that is not a source', () => {
    expect(chips(frozen, { label: frozen.backingBranch ?? '', kind: 'backing' })).toEqual([]);
  });

  describe('Move to next request (qits-1665)', () => {
    const MOVE = `/projects/api/repositories/${frozen.repoId}/release-requests/${frozen.id}/sources/move`;

    function header(request: ReleaseRequest, label: string, mainBranch?: string) {
      const fixture = TestBed.createComponent(ReleaseLaneHeader);
      fixture.componentRef.setInput('request', request);
      fixture.componentRef.setInput('lane', { label, kind: 'source' });
      if (mainBranch) fixture.componentRef.setInput('mainBranch', mainBranch);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const button = (name: string) =>
        [...element.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === name);
      return { fixture, element, button };
    }

    /** Presses the action, types `reason` and presses Move. */
    async function moveWith(view: ReturnType<typeof header>, reason: string) {
      if (view.button('Move to next request')) {
        view.button('Move to next request')!.click();
        view.fixture.detectChanges();
      }
      const input = view.element.querySelector('input')!;
      input.value = reason;
      input.dispatchEvent(new Event('input'));
      view.fixture.detectChanges();
      view.button('Move')!.click();
      await settle();
    }

    async function settled(view: ReturnType<typeof header>) {
      await settle();
      await view.fixture.whenStable();
      view.fixture.detectChanges();
    }

    it('is offered on a branch of a shared open request, never on main', () => {
      expect(header(frozen, 'ticket/contract-11').button('Move to next request')).toBeDefined();
      expect(header(frozen, 'main').button('Move to next request')).toBeUndefined();
    });

    it('is not offered on a request queued behind another, nor on its only branch', () => {
      expect(header(queued, 'ticket/contract-14').button('Move to next request')).toBeUndefined();
    });

    it('keeps off the repository’s own default branch', () => {
      const view = header(frozen, 'ticket/contract-11', 'ticket/contract-11');
      expect(view.button('Move to next request')).toBeUndefined();
    });

    it('asks for a reason before it moves, and sends it with the branch', async () => {
      const view = header(frozen, 'ticket/contract-11');
      view.button('Move to next request')!.click();
      view.fixture.detectChanges();
      expect(view.button('Move')!.disabled).toBe(true);
      await moveWith(view, ' It conflicts. ');
      const call = http.expectOne(MOVE);
      expect(call.request.body).toEqual({ branch: 'ticket/contract-11', reason: 'It conflicts.' });
      // The answer: the recorded frozen request without the branch, and the queued one with it.
      call.flush({
        from: {
          ...frozen,
          sources: (frozen.sources ?? []).filter((source) => source.name !== 'ticket/contract-11'),
        },
        to: { ...queued, sources: [...(queued.sources ?? []), frozen.sources![1]] },
      });
      await settled(view);
      expect(view.element.querySelector('[role="alert"]')).toBeNull();
      expect(view.button('Move')).toBeUndefined();
    });

    it('says why a move was refused, in the service’s words', async () => {
      const view = header(frozen, 'ticket/contract-11');
      await moveWith(view, 'It conflicts.');
      http
        .expectOne(MOVE)
        .flush({ message: 'Not open to change' }, { status: 409, statusText: 'Conflict' });
      await settled(view);
      expect(view.element.querySelector('[role="alert"]')?.textContent).toContain(
        'Not moved — 409 Not open to change.',
      );
      expect(view.button('Move to next request')).toBeDefined();
    });

    it('hides the action once the service says this viewer may not move', async () => {
      const view = header(frozen, 'ticket/contract-11');
      await moveWith(view, 'It conflicts.');
      http
        .expectOne(MOVE)
        .flush({ message: 'Not allowed' }, { status: 403, statusText: 'Forbidden' });
      await settled(view);
      expect(view.element.querySelector('[role="alert"]')?.textContent).toContain('403');
      expect(view.button('Move to next request')).toBeUndefined();
    });
  });
});
