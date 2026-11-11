import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import {
  follow,
  openRecordedWork,
  routedQualifiedId,
  WORK_LINK_TARGETS,
} from '../../../../testing/browser/recorded-work';
import { WorkRef } from './work-ref';

/**
 * Screenshots of a work reference tag, on its own, 24rem wide: the item is the routed one of "a
 * project with work in every status" (`recorded-work.ts`), its brief from the project's work
 * (`SelectedWork`), as the Schedule tab and the Needs panel show it.
 *
 * Both of its links are declared exits (`open-work-ref-tag`, epic qits-2000), each followed once:
 * the tag (`open`, shown by `tag`) and the id in its preview (`openFromPreview`), which shows only
 * while the pointer is on the tag (`preview`, a hover screenshot).
 */
@Component({
  imports: [WorkRef],
  // Room below the tag for its preview, which hangs under it.
  host: { class: 'block w-[24rem] p-4 pb-32' },
  template: `<app-work-ref [qualifiedId]="qualifiedId ?? ''" />`,
})
class OneRef {
  readonly qualifiedId = routedQualifiedId();
}

const EVERY_STATUS = 'a project with work in every status';
const ITEM = 'contract-00000001-6';

describe('WorkRef (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          ...WORK_LINK_TARGETS,
          { path: 'projects/:slug/:view/:qualifiedId', component: OneRef },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function shown() {
    const { element } = await openRecordedWork(http, 'ref', ITEM, EVERY_STATUS);
    const locator = page.elementLocator(element);
    const tag = locator.getByRole('link', { name: `Ticket: ${ITEM}` });
    await expect.element(tag).toBeVisible();
    return { locator, tag };
  }

  it('tag', async () => {
    const { locator } = await shown();
    await expect.element(locator).toMatchScreenshot('tag', { kind: 'DATA' });
  });

  it('preview', async () => {
    const { locator, tag } = await shown();
    await userEvent.hover(tag);
    const preview = locator.getByRole('tooltip');
    await expect.element(preview).toBeVisible();
    await expect.element(preview).toMatchTextContent('Ready for dev ticket');
    await expect.element(locator).toMatchScreenshot('preview', { kind: 'DATA' });
  });

  it('open-work-ref-tag open: the tag opens the item’s page', async () => {
    const { tag } = await shown();
    const { url, reached } = await follow(tag);
    expect(url).toBe(`/projects/contract-00000001/work/detail/${ITEM}`);
    expect(reached).toEqual(['open-work-ref-tag:open']);
  });

  it('open-work-ref-tag openFromPreview: the id in the preview opens the item’s page', async () => {
    const { locator, tag } = await shown();
    await userEvent.hover(tag);
    const id = locator.getByRole('tooltip').getByRole('link', { name: ITEM, exact: true });
    await expect.element(id).toBeVisible();
    const { url, reached } = await follow(id);
    expect(url).toBe(`/projects/contract-00000001/work/detail/${ITEM}`);
    expect(reached).toEqual(['open-work-ref-tag:openFromPreview']);
  });
});
