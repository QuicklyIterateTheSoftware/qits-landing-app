import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import type { CommentEntry } from '$core/work/work-detail.consumes';
import { goldenMaster, projectsGoldenMasters } from '../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../testing/platform-origins';
import { WorkComments } from './work-comments';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const COMMENTED = 'a ticket with a comment';

describe('WorkComments', () => {
  let http: HttpTestingController;
  const ref = projectsGoldenMasters.operation(COMMENTED, 'listWorkComments').params['qualifiedId'];
  const thread = (): CommentEntry[] =>
    goldenMaster(COMMENTED, 'listWorkComments').entries.map(
      (e: { comment: CommentEntry }) => e.comment,
    );

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideTestPlatformOrigins(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(comments: readonly CommentEntry[] = thread()) {
    const fixture = TestBed.createComponent(WorkComments);
    fixture.componentRef.setInput('comments', comments);
    fixture.componentRef.setInput('entry', { qualifiedId: ref, archetype: 'TICKET' });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const box = element.querySelector<HTMLTextAreaElement>('textarea[aria-label="Add a comment"]')!;
    const button = () =>
      [...element.querySelectorAll('button')].find((b) =>
        b.textContent?.trim().startsWith('Comment'),
      )!;
    const type = (text: string) => {
      box.value = text;
      box.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, element, box, button, type };
  }

  it('draws the thread, and a box that names the archetype', () => {
    const { element, box } = render();
    expect(element.querySelectorAll('li').length).toBe(thread().length);
    expect(box.placeholder).toBe('Say something about this ticket.');
  });

  it('keeps Comment disabled while the box is blank', () => {
    const { button, type } = render();
    expect(button().disabled).toBe(true);
    type('   ');
    expect(button().disabled).toBe(true);
    type('Seen it too.');
    expect(button().disabled).toBe(false);
  });

  it('posts the body only, and empties the box once it went through', async () => {
    const { fixture, box, button, type } = render();
    type('Seen it too.');
    button().click();
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
    await settle();
    const request = http.expectOne(`/projects/api/work/${ref}/comments`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ body: 'Seen it too.' });
    request.flush(goldenMaster(COMMENTED, 'addWorkComment'));
    await settle();
    fixture.detectChanges();
    expect(box.value).toBe('');
  });

  it('says a refusal plainly and keeps the typed text', async () => {
    const { fixture, element, box, button, type } = render();
    type('Not mine to say.');
    button().click();
    await settle();
    http
      .expectOne(`/projects/api/work/${ref}/comments`)
      .flush(null, { status: 403, statusText: 'Forbidden' });
    await settle();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Could not add the comment — 403.',
    );
    expect(box.value).toBe('Not mine to say.');
  });

  it('opens a comment for editing and saves its new text', async () => {
    const { fixture, element } = render();
    const first = thread()[0];
    const edit = [...element.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Edit',
    )!;
    edit.click();
    fixture.detectChanges();
    const draft = element.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Edit the comment"]',
    )!;
    expect(draft.value).toBe(first.body);
    draft.value = 'Better words.';
    draft.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Save')!.click();
    await settle();
    const request = http.expectOne(`/projects/api/work/${ref}/comments/${first.id}`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ body: 'Better words.' });
    request.flush(goldenMaster(COMMENTED, 'editWorkComment'));
    await settle();
    fixture.detectChanges();
    expect(element.querySelector('textarea[aria-label="Edit the comment"]')).toBeNull();
  });
});
