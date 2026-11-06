import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import {
  goldenMaster,
  isRecorded,
  NEEDS_STATE,
  projectsGoldenMasters,
} from '../../../../testing/golden-masters';
import { WorkNeedsPanel } from './work-needs-panel';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The patch answered: no recording patches `needs`, so "a reported ticket"'s recorded patch. */
const PATCHED = 'a reported ticket';

/**
 * A work item's Needs panel (epic qits-1899), on `NEEDS_STATE`'s `getWork`: a READY_FOR_DEV ticket
 * needing another ticket at VERIFIED, not met. Each write PATCHes the whole `needs` list.
 */
describe.skipIf(!isRecorded(NEEDS_STATE, 'getWork'))('WorkNeedsPanel', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    const work = goldenMaster(NEEDS_STATE, 'listProjectWork');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        // The links' previews read the project's work; the state's, as recorded.
        { provide: SelectedWork, useValue: { entries: signal(work.entities) } },
        { provide: SelectedProject, useValue: { slug: signal('contract') } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const item = () => goldenMaster(NEEDS_STATE, 'getWork');
  const ref = () => projectsGoldenMasters.operation(NEEDS_STATE, 'getWork').params['qualifiedId'];

  function render() {
    const fixture = TestBed.createComponent(WorkNeedsPanel);
    fixture.componentRef.setInput('qualifiedId', ref());
    fixture.componentRef.setInput('needs', item().needs);
    let changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
    /** Each row's items, as the row lays them out side by side; the link's preview left out. */
    const rows = () =>
      [...element.querySelectorAll('[data-work-need]')].map((li) => {
        const row = li.cloneNode(true) as HTMLElement;
        row.querySelectorAll('[role=tooltip]').forEach((tooltip) => tooltip.remove());
        return [...row.children]
          .map((item) => item.textContent?.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join(' ');
      });
    return { fixture, element, button, rows, changed: () => changed };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('lists each need: the item linked, the status it needs, where it is now, met or not', () => {
    const { element, rows } = render();
    expect(rows()).toEqual([
      'Ticket: contract-00000001-1 at verified (now refined) not met Remove',
    ]);
    expect(element.querySelector('[data-work-need] a')?.getAttribute('href')).toBe(
      '/projects/contract/work/detail/contract-00000001-1',
    );
  });

  it('adds a need: the whole list, the new one last, then says it changed', async () => {
    const { fixture, element, button, changed } = render();
    button('Add a need').click();
    fixture.detectChanges();
    const input = element.querySelector<HTMLInputElement>('input[aria-label="Needed item"]')!;
    input.value = 'contract-00000001-4';
    input.dispatchEvent(new Event('input'));
    const select = element.querySelector<HTMLSelectElement>('select[aria-label="Needed status"]')!;
    expect([...select.options].map((o) => o.value)).toEqual([
      'REPORTED',
      'REFINED',
      'READY_FOR_DEV',
      'IMPLEMENTING',
      'IMPLEMENTED',
      'VERIFYING',
      'VERIFIED',
      'DONE',
      'DROPPED',
    ]);
    select.value = 'DONE';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button('Add').click();
    await settle();
    const patch = http.expectOne(`/projects/api/work/${ref()}`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({
      needs: [
        { item: 'contract-00000001-1', status: 'VERIFIED' },
        { item: 'contract-00000001-4', status: 'DONE' },
      ],
    });
    patch.flush(goldenMaster(PATCHED, 'patchWork'));
    await answered(fixture);
    expect(changed()).toBe(1);
  });

  it('removes a need by writing the list without it, which clears the last one', async () => {
    const { fixture, button, changed } = render();
    button('Remove').click();
    await settle();
    const patch = http.expectOne(`/projects/api/work/${ref()}`);
    expect(patch.request.body).toEqual({ needs: [] });
    patch.flush(goldenMaster(PATCHED, 'patchWork'));
    await answered(fixture);
    expect(changed()).toBe(1);
  });

  it('shows a refusal in the service’s words, and changes nothing', async () => {
    const { fixture, element, button, changed } = render();
    button('Add a need').click();
    fixture.detectChanges();
    const input = element.querySelector<HTMLInputElement>('input[aria-label="Needed item"]')!;
    input.value = ref();
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Add').click();
    await settle();
    // An error answer is a status only; the message is the service's.
    http
      .expectOne(`/projects/api/work/${ref()}`)
      .flush({ message: 'An item cannot need itself' }, { status: 400, statusText: 'Bad Request' });
    await answered(fixture);
    expect(element.querySelector('[role=alert]')?.textContent).toBe('An item cannot need itself');
    expect(changed()).toBe(0);
  });
});
