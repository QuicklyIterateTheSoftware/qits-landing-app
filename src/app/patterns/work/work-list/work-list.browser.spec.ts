import { Component, computed, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedWork } from '$core/work/selected-work';
import { openRecordedWork } from '../../../../testing/browser/recorded-work';
import { WorkList } from './work-list';
import type { WorkListView } from './work-list-view';

/**
 * Screenshots of a whole list, 40rem wide: the Backlog or the Archive of the work the app builds
 * from qits-projects' golden masters (`recorded-work.ts`), from the case's state.
 */
@Component({
  imports: [WorkList],
  host: { class: 'block w-[40rem] p-4 pb-8' },
  template: `<app-work-list [tree]="tree()" base="/projects/contract/work" [view]="view" />`,
})
class WholeList {
  readonly view = inject(ActivatedRoute).snapshot.paramMap.get('view') as WorkListView;
  private readonly work = inject(SelectedWork);
  readonly tree = computed(() => this.work.graph().tree(this.view));
}

const EVERY_STATUS = 'a project with work in every status';

describe('WorkList (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/:view/:qualifiedId', component: WholeList }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function shown(view: WorkListView, state: string) {
    const { element } = await openRecordedWork(http, view, 'all', state);
    return page.elementLocator(element);
  }

  it('the Backlog', async () => {
    const list = await shown('backlog', EVERY_STATUS);
    await expect.element(list).toHaveTextContent('Reported epic');
    await expect.element(list).toHaveTextContent('Reported ticket');
    await expect.element(list).toMatchScreenshot('backlog');
  });

  it('the Archive: Done and Dropped mixed', async () => {
    const list = await shown('archive', EVERY_STATUS);
    await expect.element(list).toHaveTextContent('Done ticket');
    await expect.element(list).toHaveTextContent('Dropped epic');
    await expect.element(list).toMatchScreenshot('archive');
  });

  it('an empty list says so', async () => {
    const list = await shown('archive', 'an epic with features and tasks');
    await expect.element(list).toHaveTextContent('Nothing here');
    await expect.element(list).toMatchScreenshot('empty');
  });
});
