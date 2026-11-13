import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { client as githostClient } from '../../../api/githost/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { goldenMaster } from '../../../../testing/golden-masters';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
import { provideWorkReferences } from '$core/work/work-briefs';
import { ReleaseChangesView } from './release-changes';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const STATE = 'a release request awaiting approval';
const request: ReleaseRequest = goldenMaster(STATE, 'getReleaseRequest').request;
const CHANGES = `/projects/api/repositories/${request.repoId}/release-requests/${request.id}/changes`;

/** The recorded fold, its README (MODIFIED) renamed to an image. */
function foldWithImage() {
  const changes = goldenMaster(STATE, 'listReleaseRequestChanges');
  changes.files[0].path = 'docs/shot.png';
  return changes;
}

/** The recorded pin move, its README (MODIFIED) renamed to an image inside the sibling. */
function pinWithImage() {
  const moved = goldenMaster(STATE, 'getReleaseRequestSubmoduleChanges');
  moved.files[0].path = 'docs/logo.png';
  return moved;
}

const png = (name: string) => new Blob([name], { type: 'image/png' });

describe('ReleaseChangesView', () => {
  let http: HttpTestingController;
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

  beforeEach(() => {
    // jsdom has no object URLs.
    let made = 0;
    URL.createObjectURL = () => `blob:${++made}`;
    URL.revokeObjectURL = () => undefined;
  });

  afterEach(() => {
    http.verify();
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });

  async function render(path: string, slug = '') {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ path })) } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(githostClient),
        provideWorkReferences(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ReleaseChangesView);
    fixture.componentRef.setInput('request', request);
    fixture.componentRef.setInput('slug', slug);
    fixture.detectChanges();
    await settle();
    const step = async () => {
      fixture.detectChanges();
      await settle();
      fixture.detectChanges();
    };
    return { fixture, element: fixture.nativeElement as HTMLElement, step };
  }

  /** The raw reads in flight, as `repoId@rev#path`. */
  const rawReads = () =>
    http
      .match((req) => req.url.includes('/githost/api/repositories/'))
      .map((req) => {
        const url = new URL(req.request.urlWithParams, 'http://githost');
        const repoId = url.pathname.split('/')[4];
        const read = `${repoId}@${url.searchParams.get('rev')}#${url.searchParams.get('path')}`;
        return { read, req };
      });

  it('shows a fold’s image before and after, read at the base release and the fold', async () => {
    const { element, step } = await render('docs/shot.png');
    const changes = foldWithImage();
    http.expectOne(CHANGES).flush(changes);
    await step();

    const reads = rawReads();
    expect(reads.map((r) => r.read)).toEqual([
      `${request.repoId}@${changes.base}#docs/shot.png`,
      `${request.repoId}@${changes.mergedSha}#docs/shot.png`,
    ]);
    http.expectNone(`${CHANGES}/diff?path=docs%2Fshot.png`);
    for (const { req, read } of reads) req.flush(png(read));
    await step();

    expect(element.querySelector('ui-diff-viewer')).toBeNull();
    const panes = [...element.querySelectorAll('ui-image-diff figure')];
    expect(panes.map((pane) => pane.querySelector('figcaption')?.textContent?.trim())).toEqual([
      'Before',
      'After',
    ]);
    expect(panes.every((pane) => pane.querySelector('img'))).toBe(true);
  });

  it('shows an image inside a submodule pin, read in the sibling at the two pins', async () => {
    const gitlink = 'components/contract/contract-service';
    const { element, step } = await render(`${gitlink}/docs/logo.png`);
    http.expectOne(CHANGES).flush(goldenMaster(STATE, 'listReleaseRequestChanges'));
    await step();
    await step();
    const moved = pinWithImage();
    http.expectOne(`${CHANGES}/submodule?path=${encodeURIComponent(gitlink)}`).flush(moved);
    await step();

    const reads = rawReads();
    expect(reads.map((r) => r.read)).toEqual([
      `${moved.repositoryId}@${moved.oldSha}#docs/logo.png`,
      `${moved.repositoryId}@${moved.newSha}#docs/logo.png`,
    ]);
    http.expectNone((req) => req.url.endsWith('/changes/submodule/diff'));
    reads[0].req.flush(png('old'));
    reads[1].req.flush(null, { status: 404, statusText: 'Not Found' });
    await step();
    await step();

    const panes = [...element.querySelectorAll('ui-image-diff figure')];
    expect(panes[0].querySelector('img')).not.toBeNull();
    expect(panes[1].textContent).toContain('The image is not in the repository at this revision.');
    expect(panes[1].querySelector('img')).toBeNull();
  });

  it('nests an expanded pin’s files directly after its row, relative to the submodule', async () => {
    const gitlink = 'components/contract/contract-service';
    const { element, step } = await render(gitlink);
    const changes = goldenMaster(STATE, 'listReleaseRequestChanges');
    changes.files = [
      ...changes.files,
      { path: 'zz-notes.md', changeType: 'ADDED', submodule: null },
    ];
    http.expectOne(CHANGES).flush(changes);
    await step();
    await step();
    const moved = goldenMaster(STATE, 'getReleaseRequestSubmoduleChanges');
    http.expectOne(`${CHANGES}/submodule?path=${encodeURIComponent(gitlink)}`).flush(moved);
    await step();

    const rows = [...element.querySelectorAll('ui-change-list li')];
    const texts = rows.map((li) =>
      li.querySelector('button')?.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(texts).toEqual([
      'M README.md',
      'M components/contract/contract-service',
      'M README.md',
      'A src/export.txt',
      'M src/invoice.txt',
      'A zz-notes.md',
    ]);
    expect(rows.map((li) => li.getAttribute('data-depth'))).toEqual([
      null,
      null,
      '1',
      '1',
      '1',
      null,
    ]);

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');
    (rows[2].querySelector('button') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { path: `${gitlink}/README.md` } }),
    );
  });

  it('keeps the text diff for a file that is no image', async () => {
    const { element, step } = await render('README.md');
    http.expectOne(CHANGES).flush(goldenMaster(STATE, 'listReleaseRequestChanges'));
    await step();
    await step();
    http
      .expectOne(`${CHANGES}/diff?path=README.md`)
      .flush(goldenMaster(STATE, 'getReleaseRequestChangeDiff'));
    await step();
    expect(rawReads()).toEqual([]);
    expect(element.querySelector('ui-image-diff')).toBeNull();
    expect(element.querySelector('ui-diff-viewer li')).not.toBeNull();
  });

  it('draws the work ids a pin’s commit messages name as references with their brief', async () => {
    const BRIEFS = 'a project with work to brief';
    const briefs = goldenMaster(BRIEFS, 'listProjectWorkBriefs');
    const ticket = briefs.briefs[0];
    const slug = ticket.qualifiedId.replace(/-\d+$/, '');
    const gitlink = 'components/contract/contract-service';
    const { element, step } = await render(gitlink, slug);
    http.expectOne(CHANGES).flush(goldenMaster(STATE, 'listReleaseRequestChanges'));
    await step();
    await step();
    // The recorded pin move, its newest commit's message naming the briefs recording's ticket
    // (the recorded messages name no work item).
    const moved = goldenMaster(STATE, 'getReleaseRequestSubmoduleChanges');
    moved.commits[0].message = `feat(${ticket.qualifiedId}): ${moved.commits[0].message}`;
    http.expectOne(`${CHANGES}/submodule?path=${encodeURIComponent(gitlink)}`).flush(moved);
    await step();

    // The briefs of one render go out together, a microtask after it, through the generated client.
    await step();
    const read = http.expectOne((req) => req.urlWithParams.includes('/work/briefs'));
    expect(read.request.urlWithParams).toBe(
      `/projects/api/projects/${slug}/work/briefs?id=${ticket.qualifiedId}`,
    );
    read.flush(briefs);
    await step();

    const message = element.querySelector('qits-commit-message')!;
    const ref = message.querySelector('qits-work-ref .qits-work-ref')!;
    expect(ref.textContent).toBe(ticket.qualifiedId);
    const panel = message.querySelector('[role="tooltip"]')!;
    expect(panel.textContent).toContain(ticket.title);
    expect(panel.querySelector('a')?.getAttribute('href')).toBe(
      `/projects/${slug}/work/detail/${ticket.qualifiedId}`,
    );
    // The panel is in the DOM (for aria-describedby); without it, the text is the message.
    const shown = message.cloneNode(true) as Element;
    shown.querySelectorAll('.qits-work-ref-panel').forEach((open) => open.remove());
    expect(shown.textContent).toBe(moved.commits[0].message);
  });
});
