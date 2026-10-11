import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { goldenMaster } from '../../../../testing/golden-masters';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
import { ASKED, ReleaseAutomations } from './release-automations';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const STATE = 'a release request held by a failed automation';
const recorded: ReleaseRequest = goldenMaster(STATE, 'getReleaseRequest').request;

/**
 * The recorded request, REJECTED by a QA that found the entity diagram stale (qits-1178): the
 * diagram is DEFERRED, QA checks it instead of a run before it.
 */
const rejected: ReleaseRequest = {
  ...recorded,
  state: 'REJECTED',
  automations: [
    ...(recorded.automations ?? []),
    {
      kind: 'entity-diagram',
      label: 'Entity diagram',
      state: 'DEFERRED',
      foldSha: recorded.mergedSha,
    },
  ],
};

describe('ReleaseAutomations', () => {
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

  function render(request: ReleaseRequest) {
    const fixture = TestBed.createComponent(ReleaseAutomations);
    fixture.componentRef.setInput('request', request);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const row = (label: string) =>
      [...element.querySelectorAll('li')].find(
        (li) => li.querySelector('.font-semibold')?.textContent?.trim() === label,
      )!;
    const rerun = (label: string) =>
      [...row(label).querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Re-run',
      );
    return { fixture, row, rerun };
  }

  it('greys a deferred row like one that does not apply, and says QA checks it', () => {
    const { row } = render(rejected);
    const deferred = row('Entity diagram');
    expect(deferred.className).toContain('border-dashed');
    expect(deferred.textContent).toContain('checked by QA');
    expect(row('Estate pins').className).toContain('border-cinnabar-200');
  });

  it('offers Re-run on a rejected request, for the failed, fresh and deferred rows', () => {
    const { rerun } = render(rejected);
    expect(rerun('Estate pins')).toBeDefined();
    expect(rerun('Screenshot baselines')).toBeDefined();
    expect(rerun('Entity diagram')).toBeDefined();
  });

  it('asks for the deferred kind on the request and says what happens next', async () => {
    const { fixture, row, rerun } = render(rejected);
    rerun('Entity diagram')!.click();
    await settle();
    const asked = http.expectOne(
      `/projects/api/repositories/${rejected.repoId}/release-requests/${rejected.id}` +
        '/automations/entity-diagram/runs',
    );
    expect(asked.request.method).toBe('POST');
    asked.flush({ id: 'bump-1' }, { status: 202, statusText: 'Accepted' });
    await settle();
    fixture.detectChanges();
    expect(row('Entity diagram').textContent).toContain(ASKED);
  });

  it('says one is already running on a 409', async () => {
    const { fixture, row, rerun } = render(rejected);
    rerun('Entity diagram')!.click();
    await settle();
    http
      .expectOne(
        `/projects/api/repositories/${rejected.repoId}/release-requests/${rejected.id}` +
          '/automations/entity-diagram/runs',
      )
      .flush({ message: 'already active' }, { status: 409, statusText: 'Conflict' });
    await settle();
    fixture.detectChanges();
    expect(row('Entity diagram').textContent).toContain('one is already running');
  });
});
