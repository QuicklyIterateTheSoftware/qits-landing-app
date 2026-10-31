import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as githostClient } from '../../../api/githost/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { goldenMaster, projectsGoldenMasters } from '../../../../testing/golden-masters';
import { CommitChangesView } from './commit-changes';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** A root commit (`parent` null) that adds one file, `src/export.txt`. */
const STATE = 'a released release request';
const REPO = projectsGoldenMasters.operation(STATE, 'listCommitChanges').params['repositoryId'];
const SHA: string = goldenMaster(STATE, 'listCommitChanges').commit;
const CHANGES = `/projects/api/repositories/${REPO}/commits/${SHA}/changes`;

describe('CommitChangesView', () => {
  let http: HttpTestingController;
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

  beforeEach(() => {
    // jsdom has no object URLs.
    URL.createObjectURL = () => 'blob:1';
    URL.revokeObjectURL = () => undefined;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(githostClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });

  async function render() {
    const fixture = TestBed.createComponent(CommitChangesView);
    fixture.componentRef.setInput('repoId', REPO);
    fixture.componentRef.setInput('sha', SHA);
    fixture.detectChanges();
    await settle();
    const step = async () => {
      fixture.detectChanges();
      await settle();
      fixture.detectChanges();
    };
    return { element: fixture.nativeElement as HTMLElement, step };
  }

  it('shows an added image after only, read at the commit, and asks for no diff', async () => {
    const { element, step } = await render();
    // The recorded commit, its one added file renamed to an image.
    const changes = goldenMaster(STATE, 'listCommitChanges');
    changes.files[0].path = 'docs/shot.png';
    http.expectOne(CHANGES).flush(changes);
    await step();

    // A root commit has no parent, and an added image no before: one read, at the commit.
    const read = http.expectOne(
      `/githost/api/repositories/${REPO}/raw?rev=${SHA}&path=docs%2Fshot.png`,
    );
    http.expectNone((req) => req.url.includes('/diff'));
    read.flush(new Blob(['png'], { type: 'image/png' }));
    await step();
    await step();

    expect(element.querySelector('ui-diff-viewer')).toBeNull();
    const panes = [...element.querySelectorAll('ui-image-diff figure')];
    expect(panes.map((pane) => pane.querySelector('figcaption')?.textContent?.trim())).toEqual([
      'After',
    ]);
    expect(panes[0].querySelector('img')?.getAttribute('src')).toBe('blob:1');
  });

  it('keeps the text diff for a file that is no image', async () => {
    const { element, step } = await render();
    http.expectOne(CHANGES).flush(goldenMaster(STATE, 'listCommitChanges'));
    await step();
    await step();
    http
      .expectOne(`/projects/api/repositories/${REPO}/commits/${SHA}/diff?path=src%2Fexport.txt`)
      .flush(goldenMaster(STATE, 'getCommitFileDiff'));
    await step();
    http.expectNone((req) => req.url.includes('/githost/'));
    expect(element.querySelector('ui-image-diff')).toBeNull();
  });
});
