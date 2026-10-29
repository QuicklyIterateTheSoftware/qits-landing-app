import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { goldenMaster } from '../../../../../testing/golden-masters';
import { participantsOf, requestItems } from '$core/projects/release-requests';
import { ReleaseRequestsPage } from './release-requests.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The empty note: always rendered, hidden by class while there are requests. */
const empty = (element: HTMLElement) =>
  Array.from(element.querySelectorAll('p')).find((p) => p.textContent?.includes('Nothing is open'));

describe('ReleaseRequestsPage', () => {
  let http: HttpTestingController;
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/release-requests', component: ReleaseRequestsPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page of the recorded project; its request list asked for and returned unanswered. */
  async function render() {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/release-requests`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    harness.fixture.detectChanges();
    await settle();
    TestBed.tick();
    await settle();
    const request = http.expectOne(`/projects/api/projects/${project.id}/release-requests`);
    const answered = async () => {
      await settle();
      harness.fixture.detectChanges();
    };
    return { element: harness.routeNativeElement as HTMLElement, request, answered };
  }

  it('lists every request, finalized ones too, each linking to its own page', async () => {
    const { element, request, answered } = await render();
    const listed = goldenMaster(
      'a project with pending release requests',
      'listProjectReleaseRequests',
    );
    request.flush(listed);
    await answered();
    const rows = element.querySelectorAll('li');
    expect(rows).toHaveLength(6);
    const first = rows[0];
    const recordedFirst = listed.requests[0];
    const qualifiedId = recordedFirst.qualifiedId!;
    expect(qualifiedId).toMatch(/^contract-service-rr-\d+$/);
    expect(first.querySelector('a')?.textContent?.trim()).toBe(qualifiedId);
    // What the row carries and who asked, exactly as the recording implies: qits-projects before
    // qits-1673 answers neither items nor participants on these rows (and no sources), while
    // 2026.1028.230057 on answers a participant but still no items here.
    expect(first.textContent).not.toContain('Waiting on its gates');
    expect(first.querySelectorAll('[data-item]')).toHaveLength(requestItems(recordedFirst).length);
    expect(first.querySelector('[data-participants]')?.textContent?.trim()).toBe(
      participantsOf(recordedFirst),
    );
    expect(first.textContent).toContain('2026-01-01 00:00 UTC');
    expect(first.querySelector('ui-lifecycle-line [title="Test: pending"]')).not.toBeNull();
    // Every link of the row opens the request by its logical id.
    for (const link of Array.from(first.querySelectorAll('a'))) {
      expect(link.getAttribute('href')).toBe(
        `/projects/${project.slug}/release-requests/${qualifiedId}`,
      );
    }
    expect(rows[5].textContent).toContain('finalized');
    expect(rows[5].textContent).toContain('2026.101.100001');
    // The CONFLICTED request carries the service's detail; the others hide the line.
    expect(rows[4].querySelector('p')?.classList.contains('hidden')).toBe(false);
    expect(rows[0].querySelector('p')?.classList.contains('hidden')).toBe(true);
    expect(empty(element)?.classList.contains('hidden')).toBe(true);
  });

  it('marks a frozen request and links a queued one to the request it waits behind', async () => {
    const { element, request, answered } = await render();
    // Recorded: rr-2, queued behind rr-1, then rr-1, frozen at 3 of 3 counted branches.
    const listed = goldenMaster(
      'a frozen release request with a queued next request',
      'listProjectReleaseRequests',
    );
    request.flush(listed);
    await answered();
    const rows = Array.from(element.querySelectorAll('li'));
    const [queued, frozen] = listed.requests;
    const rowOf = (qualifiedId: string) =>
      rows.find((row) =>
        Array.from(row.querySelectorAll('a')).some(
          (link) => link.textContent?.trim() === qualifiedId,
        ),
      )!;
    const frozenRow = rowOf(frozen.qualifiedId);
    const queuedRow = rowOf(queued.qualifiedId);
    const chips = (row: Element) =>
      Array.from(row.querySelectorAll('ui-chip')).map((chip) => chip.textContent?.trim());
    expect(chips(frozenRow)).toContain('frozen 3/3');
    expect(chips(queuedRow)).not.toContain('frozen 3/3');
    const behind = Array.from(queuedRow.querySelectorAll('a')).find((link) =>
      link.textContent?.includes('queued behind'),
    )!;
    expect(behind.textContent?.trim()).toBe(`queued behind ${frozen.qualifiedId}`);
    expect(behind.getAttribute('href')).toBe(
      `/projects/${project.slug}/release-requests/${frozen.qualifiedId}`,
    );
    expect(frozenRow.textContent).not.toContain('queued behind');
    // Neither shows the quiet count: one is frozen (its chip says it), the other queued.
    expect(frozenRow.textContent).not.toContain('1/3');
    expect(queuedRow.textContent).not.toContain('1/3');
  });

  it('counts an open request’s counted branches quietly until it freezes', async () => {
    const { element, request, answered } = await render();
    // Derived from the recorded queued request (1 of 3 counted): the same request, no longer
    // queued, as it reads once the request ahead of it has released.
    const listed = goldenMaster(
      'a frozen release request with a queued next request',
      'listProjectReleaseRequests',
    );
    const active = { ...listed.requests[0], queuedBehind: null, queuedBehindQualifiedId: null };
    request.flush({ requests: [active] });
    await answered();
    const row = element.querySelector('li')!;
    expect(row.textContent).toContain('1/3');
    expect(row.textContent).not.toContain('queued behind');
  });

  it('shows what a request carries, each work item linked, and who asked (qits-1673)', async () => {
    const { element, request, answered } = await render();
    // Derived from the recorded pending request: the items and participants qits-projects answers
    // from 2026.1028.230057 on, one item naming a work item and one a plain branch.
    const listed = goldenMaster(
      'a project with pending release requests',
      'listProjectReleaseRequests',
    );
    const carrying = {
      ...listed.requests[0],
      participants: ['agent@qits', 'dev'],
      items: [
        {
          source: 'ticket/qits-1673',
          label: 'ticket/qits-1673',
          workItem: { qualifiedId: 'qits-1673', title: 'Show items and participants' },
        },
        { source: 'fix/rounding', label: 'fix/rounding', workItem: null },
      ],
    };
    request.flush({ requests: [carrying] });
    await answered();
    const row = element.querySelector('li')!;
    const items = Array.from(row.querySelectorAll('[data-item]'));
    expect(items).toHaveLength(2);
    const linked = items[0].querySelector('a[data-work-item]')!;
    expect(linked.textContent?.trim()).toBe('qits-1673');
    expect(linked.getAttribute('href')).toBe(`/projects/${project.slug}/work/detail/qits-1673`);
    expect(items[0].textContent).toContain('Show items and participants');
    expect(items[0].textContent).not.toContain('ticket/qits-1673');
    // An item naming no work item shows its label, linking to the request like the rest.
    expect(items[1].querySelector('[data-work-item]')).toBeNull();
    expect(items[1].textContent?.trim()).toBe('fix/rounding');
    expect(items[1].querySelector('a')?.getAttribute('href')).toBe(
      `/projects/${project.slug}/release-requests/${carrying.qualifiedId}`,
    );
    expect(row.querySelector('[data-participants]')?.textContent?.trim()).toBe('agent@qits, dev');
  });

  it('names the source branches and nobody on an answer without items or participants', async () => {
    const { element, request, answered } = await render();
    // An explicit fixture for an older qits-projects answer (no items, no participants), with two
    // source branches set: the row falls back to their names. Built without relying on whether the
    // recording itself carries items/participants, since 2026.1028.230057 on it does.
    const listed = goldenMaster(
      'a project with pending release requests',
      'listProjectReleaseRequests',
    );
    const older = {
      ...listed.requests[0],
      participants: [],
      items: [],
      sources: [{ name: 'feature/export' }, { name: 'fix/rounding' }],
    };
    request.flush({ requests: [older] });
    await answered();
    const row = element.querySelector('li')!;
    const items = Array.from(row.querySelectorAll('[data-item]'));
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      'feature/export',
      'fix/rounding',
    ]);
    expect(row.querySelector('[data-work-item]')).toBeNull();
    expect(row.querySelector('[data-participants]')?.textContent?.trim()).toBe('–');
  });

  it('says so when the project has no release requests', async () => {
    const { element, request, answered } = await render();
    request.flush(goldenMaster('a project with no release requests', 'listProjectReleaseRequests'));
    await answered();
    expect(element.querySelectorAll('li')).toHaveLength(0);
    expect(empty(element)?.classList.contains('hidden')).toBe(false);
  });

  it('says the list could not be read, and reads it again on Retry', async () => {
    const { element, request, answered } = await render();
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await answered();
    const failure = element.querySelector('ui-load-failure')!;
    expect(failure.classList.contains('hidden')).toBe(false);
    expect(failure.textContent).toContain('could not be read');
    expect(element.querySelector('ui-spinner')?.classList.contains('hidden')).toBe(true);
    failure.querySelector('button')!.click();
    await settle();
    const again = http.expectOne(`/projects/api/projects/${project.id}/release-requests`);
    again.flush(
      goldenMaster('a project with pending release requests', 'listProjectReleaseRequests'),
    );
    await answered();
    expect(failure.classList.contains('hidden')).toBe(true);
    expect(element.querySelectorAll('li')).toHaveLength(6);
  });
});
