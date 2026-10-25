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
});
