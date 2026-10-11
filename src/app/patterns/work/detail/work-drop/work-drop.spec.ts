import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import type { WorkEntry } from '$core/work/work.consumes';
import { WorkDrop } from './work-drop';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const PROJECT_ID = 'project-1';
const ENTRY = { id: 'e-1', qualifiedId: 'qits-245', archetype: 'TICKET' } as WorkEntry;

describe('WorkDrop', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render() {
    const fixture = TestBed.createComponent(WorkDrop);
    fixture.componentRef.setInput('projectId', PROJECT_ID);
    fixture.componentRef.setInput('entry', ENTRY);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const select = element.querySelector<HTMLSelectElement>('select[aria-label="Outcome"]')!;
    const reference = () =>
      element.querySelector<HTMLInputElement>('input[aria-label="Reference"]');
    const confirm = () =>
      [...element.querySelectorAll('button')].find((b) =>
        b.textContent?.trim().startsWith('Confirm'),
      )!;
    const cancel = () =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Cancel')!;
    const pick = (outcome: string) => {
      select.value = outcome;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    const type = (text: string) => {
      const box = reference()!;
      box.value = text;
      box.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, element, select, reference, confirm, cancel, pick, type };
  }

  it('keeps Confirm disabled until an outcome is chosen', () => {
    const { confirm } = render();
    expect(confirm().disabled).toBe(true);
  });

  it.each(['DUPLICATE', 'RESOLVED_ELSEWHERE', 'SUPERSEDED'])(
    '%s needs a reference before Confirm is enabled',
    (outcome) => {
      const { pick, reference, confirm, type } = render();
      pick(outcome);
      expect(reference()).not.toBeNull();
      expect(confirm().disabled).toBe(true);
      type('   ');
      expect(confirm().disabled).toBe(true);
      type('qits-378');
      expect(confirm().disabled).toBe(false);
    },
  );

  it.each(['OBSOLETE', 'INVALID', 'WONT_DO'])(
    '%s shows no reference field, and enables Confirm at once',
    (outcome) => {
      const { pick, reference, confirm } = render();
      pick(outcome);
      expect(reference()).toBeNull();
      expect(confirm().disabled).toBe(false);
    },
  );

  it('drops a reason-free outcome with no supersededBy', async () => {
    const { pick, confirm } = render();
    pick('OBSOLETE');
    confirm().click();
    await settle();
    const request = http.expectOne(`/projects/api/work/${ENTRY.qualifiedId}/status`);
    expect(request.request.body).toEqual({ target: 'DROPPED', outcome: 'OBSOLETE' });
    request.flush({ status: 'DROPPED' });
    await settle();
  });

  it('sends the typed reference with an outcome that needs one', async () => {
    const { pick, type, confirm } = render();
    pick('DUPLICATE');
    type('qits-378');
    confirm().click();
    await settle();
    const request = http.expectOne(`/projects/api/work/${ENTRY.qualifiedId}/status`);
    expect(request.request.body).toEqual({
      target: 'DROPPED',
      outcome: 'DUPLICATE',
      supersededBy: 'qits-378',
    });
    request.flush({ status: 'DROPPED' });
    await settle();
  });

  it('emits dropped once the move goes through', async () => {
    const { fixture, pick, confirm } = render();
    const dropped = vi.fn();
    fixture.componentInstance.dropped.subscribe(dropped);
    pick('OBSOLETE');
    confirm().click();
    await settle();
    http.expectOne(`/projects/api/work/${ENTRY.qualifiedId}/status`).flush({ status: 'DROPPED' });
    await settle();
    expect(dropped).toHaveBeenCalledTimes(1);
  });

  it('says a refusal plainly, and keeps the form open with what was typed', async () => {
    const { fixture, element, pick, type, confirm } = render();
    const dropped = vi.fn();
    fixture.componentInstance.dropped.subscribe(dropped);
    pick('DUPLICATE');
    type('qits-378');
    confirm().click();
    await settle();
    http
      .expectOne(`/projects/api/work/${ENTRY.qualifiedId}/status`)
      .flush(
        { message: 'qits-245 cannot drop as DUPLICATE: qits-378 is not a ticket in this project' },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'qits-245 cannot drop as DUPLICATE: qits-378 is not a ticket in this project',
    );
    expect(dropped).not.toHaveBeenCalled();
  });

  it('cancels without sending anything', () => {
    const { fixture, pick, cancel } = render();
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    pick('OBSOLETE');
    cancel().click();
    expect(cancelled).toHaveBeenCalledTimes(1);
    http.expectNone(`/projects/api/work/${ENTRY.qualifiedId}/status`);
  });
});
