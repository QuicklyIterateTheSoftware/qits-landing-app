import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
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
  // The recorded fixture predates `editable`/`authorAgentOf` (qits-1452): the installed
  // `@qits/projects-golden-masters` is bumped only on qits-projects-service's release, which has
  // not happened for this field yet. Its thread is the caller's own, so `editable: true` is what
  // the provider now records for it (its own golden-masters/a-ticket-with-a-comment already does);
  // make that explicit here until the devDependency catches up.
  const thread = (): CommentEntry[] =>
    goldenMaster(COMMENTED, 'listWorkComments').entries.map((e: { comment: CommentEntry }) => ({
      ...e.comment,
      editable: true,
    }));

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

  it("names a person's comment by its author", () => {
    const first = thread()[0];
    const { element } = render([{ ...first, authorAgentOf: undefined }]);
    const byline = element.querySelector('li p')!;
    expect(byline.textContent).toContain(first.author);
  });

  it("names an agent's comment by the work item whose agent wrote it", () => {
    const first = thread()[0];
    const { element } = render([{ ...first, authorAgentOf: 'qits-1402' }]);
    const byline = element.querySelector('li p')!;
    expect(byline.textContent).toContain("qits-1402's agent");
    expect(byline.textContent).not.toContain(first.author!);
  });

  it('shows Edit only on a comment the caller may edit', () => {
    const first = thread()[0];
    const editable = render([{ ...first, editable: true }]);
    expect(
      [...editable.element.querySelectorAll('button')].some(
        (b) => b.textContent?.trim() === 'Edit',
      ),
    ).toBe(true);
    const notEditable = render([{ ...first, editable: false }]);
    expect(
      [...notEditable.element.querySelectorAll('button')].some(
        (b) => b.textContent?.trim() === 'Edit',
      ),
    ).toBe(false);
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

describe('WorkComments, opened at a comment (qits-1660)', () => {
  const thread = (): CommentEntry[] =>
    goldenMaster(COMMENTED, 'listWorkComments').entries.map(
      (e: { comment: CommentEntry }) => e.comment,
    );
  const ref = projectsGoldenMasters.operation(COMMENTED, 'listWorkComments').params['qualifiedId'];
  let scrolled: Element[];

  beforeEach(() => {
    scrolled = [];
    // jsdom draws nothing, so it has no scrollIntoView: record which element was asked to scroll.
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
  });

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  function render(fragment: string | null, comments: readonly CommentEntry[] = thread()) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideTestPlatformOrigins(),
        { provide: ActivatedRoute, useValue: { fragment: of(fragment) } },
      ],
    });
    const fixture = TestBed.createComponent(WorkComments);
    fixture.componentRef.setInput('comments', comments);
    fixture.componentRef.setInput('entry', { qualifiedId: ref, archetype: 'TICKET' });
    fixture.detectChanges();
    TestBed.tick();
    return fixture.nativeElement as HTMLElement;
  }

  it('gives each comment a stable anchor', () => {
    const element = render(null);
    const first = thread()[0];
    expect(element.querySelector('li')?.id).toBe(`comment-${first.id}`);
    expect(scrolled).toHaveLength(0);
  });

  it('scrolls to the comment the fragment names, and outlines it', () => {
    const first = thread()[0];
    const second: CommentEntry = { ...first, id: 'second-comment', body: 'the second' };
    const element = render('comment-second-comment', [first, second]);
    const target = element.querySelector('#comment-second-comment')!;
    expect(scrolled).toEqual([target]);
    expect(target.classList.contains('ring-2')).toBe(true);
    expect(element.querySelector(`#comment-${first.id}`)?.classList.contains('ring-2')).toBe(false);
  });
});
