import { Component, computed, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { commands, page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedWork } from '$core/work/selected-work';
import { openRecordedWork, routedQualifiedId } from '../../../../testing/browser/recorded-work';
import { WorkNeedsPanel } from './work-needs-panel';

/**
 * Screenshots of a work item's Needs panel (epic qits-1899), 40rem wide, on qits-projects' "a
 * ticket that needs another" (recorded from 2026.1106.140436 on): the item is the one the URL
 * names in the project's work (`recorded-work.ts`), its needs as the work list carries them. Its
 * READY_FOR_DEV ticket needs another ticket at VERIFIED, now REFINED, not met; the ticket it needs
 * needs nothing.
 */
@Component({
  imports: [WorkNeedsPanel],
  host: { class: 'block w-[40rem] p-4' },
  template: `
    @if (entry(); as entry) {
      <app-work-needs-panel [qualifiedId]="entry.qualifiedId ?? ''" [needs]="entry.needs ?? []" />
    }
  `,
})
class OneItem {
  private readonly work = inject(SelectedWork);
  private readonly qualifiedId = routedQualifiedId();
  readonly entry = computed(() =>
    this.work.entries().find((e) => e.qualifiedId === this.qualifiedId),
  );
}

const NEEDS = 'a ticket that needs another';

describe('WorkNeedsPanel (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/:view/:qualifiedId', component: OneItem }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function shown(qualifiedId: string) {
    const { element, harness } = await openRecordedWork(http, 'needs', qualifiedId, NEEDS);
    const locator = page.elementLocator(element);
    await expect.element(locator.getByRole('heading', { name: 'Needs' })).toBeVisible();
    return { locator, harness };
  }

  it('a need not met: the item linked, the status it needs, where it is now', async () => {
    const { locator } = await shown('contract-00000001-2');
    await expect
      .element(locator.getByRole('link', { name: 'Ticket: contract-00000001-1' }))
      .toBeVisible();
    await expect.element(locator).toMatchTextContent('at verified');
    await expect.element(locator).toMatchTextContent('(now refined)');
    await expect.element(locator).toMatchTextContent('not met');
    await commands.parkPointer();
    await expect.element(locator).toMatchScreenshot('panel');
  });

  it('an item that needs nothing', async () => {
    const { locator } = await shown('contract-00000001-1');
    await expect.element(locator).toMatchTextContent('It needs no other item.');
    await expect.element(locator).toMatchScreenshot('panel-empty');
  });

  it('adding a need: the item and the status to pick', async () => {
    const { locator, harness } = await shown('contract-00000001-2');
    await userEvent.click(locator.getByRole('button', { name: 'Add a need' }));
    harness.fixture.detectChanges();
    await userEvent.fill(
      locator.getByRole('textbox', { name: 'Needed item' }),
      'contract-00000001-3',
    );
    await expect
      .element(locator.getByRole('combobox', { name: 'Needed status' }))
      .toHaveValue('VERIFIED');
    await commands.parkPointer();
    await expect.element(locator).toMatchScreenshot('panel-adding');
  });
});
