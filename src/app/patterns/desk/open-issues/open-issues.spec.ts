import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideQitsWorkBriefs } from '@qits/ui-components';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { OpenIssues, openIssues } from './open-issues';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const issue = {
  id: 'i-1',
  qualifiedId: 'qits-7',
  archetype: 'ISSUE',
  status: 'OPEN',
  title: 'CI retry refused',
} as const;

describe('openIssues', () => {
  it('keeps the open issues and nothing else', () => {
    expect(
      openIssues([
        issue,
        { ...issue, id: 'i-2', status: 'RESOLVED' },
        { ...issue, id: 'i-3', status: 'OBSOLETE' },
        { ...issue, id: 't-1', archetype: 'TICKET', status: 'REPORTED' },
      ]).map((entry) => entry.id),
    ).toEqual(['i-1']);
  });
});

describe('OpenIssues', () => {
  /** The briefs the descriptions' work ids ask for, by project. */
  let asked: [string, readonly string[]][];

  async function render(description = 'A person must lift the lease.') {
    asked = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideQitsWorkBriefs(async (project, ids) => {
          asked.push([project, ids]);
          return [];
        }),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(OpenIssues);
    fixture.componentRef.setInput('projectId', 'p-1');
    fixture.componentRef.setInput('slug', 'qits');
    fixture.detectChanges();
    await settle();
    http.expectOne('/projects/api/projects/p-1/work').flush({ entities: [issue] });
    await settle();
    fixture.detectChanges();
    await settle();
    http.expectOne('/projects/api/work/qits-7').flush({
      ...issue,
      description,
    });
    http.expectOne('/projects/api/work/qits-7/comments').flush({ entries: [] });
    await settle();
    fixture.detectChanges();
    return { fixture, http, element: fixture.nativeElement as HTMLElement };
  }

  it("draws the project's work ids in the description as references (qits-1898)", async () => {
    const { element } = await render('Retry once qits-5 is released.');
    await settle();
    const ref = element.querySelector('li p qits-work-ref');
    expect(ref?.textContent?.trim()).toBe('qits-5');
    expect(element.querySelector('li p')?.textContent?.trim()).toBe(
      'Retry once qits-5 is released.',
    );
    expect(asked).toEqual([['qits', ['qits-5']]]);
  });

  const button = (element: HTMLElement, text: string) =>
    Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;

  function type(element: HTMLElement, value: string) {
    const area = element.querySelector('textarea')!;
    area.value = value;
    area.dispatchEvent(new Event('input'));
  }

  it('shows an open issue with its short text', async () => {
    const { element } = await render();
    expect(element.textContent).toContain('qits-7');
    expect(element.textContent).toContain('A person must lift the lease.');
  });

  it('writes the answer on the thread, then resolves', async () => {
    const { fixture, http, element } = await render();
    type(element, 'Lease lifted.');
    fixture.detectChanges();
    button(element, 'Resolve').click();
    await settle();

    const comment = http.expectOne('/projects/api/work/qits-7/comments');
    expect(comment.request.body).toEqual({ body: 'Lease lifted.' });
    comment.flush({ comment: { id: 'c-1', body: 'Lease lifted.' } });
    await settle();
    await settle();

    const move = http.expectOne('/projects/api/work/qits-7/status');
    expect(move.request.body).toEqual({ target: 'RESOLVED' });
    move.flush({ id: 'i-1', status: 'RESOLVED' });
  });

  it('shows the refusal when a comment is refused', async () => {
    const { fixture, http, element } = await render();
    type(element, 'No.');
    fixture.detectChanges();
    button(element, 'Comment').click();
    await settle();
    http
      .expectOne('/projects/api/work/qits-7/comments')
      .flush({ message: 'nope' }, { status: 403, statusText: 'Forbidden' });
    await settle();
    fixture.detectChanges();
    expect(element.querySelector('[role=alert]')?.textContent).toContain('403');
  });
});
