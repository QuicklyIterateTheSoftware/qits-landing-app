import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { client as githostClient } from '../../../api/githost/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { goldenMaster } from '../../../../testing/golden-masters';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
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

  async function render(path: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ path })) } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(githostClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ReleaseChangesView);
    fixture.componentRef.setInput('request', request);
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
});
