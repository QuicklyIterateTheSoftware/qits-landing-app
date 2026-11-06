import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideQitsWorkBriefs, type QitsWorkBrief } from '@qits/ui-components';
import { layoutGraph } from '$core/release-requests/commit-graph';
import { goldenMaster } from '../../../../testing/golden-masters';
import { CommitGraphView, type GraphEntry } from './commit-graph';

/** The briefs qits-projects recorded: a ticket and an epic of the project `contract-00000001`. */
const BRIEFS: readonly QitsWorkBrief[] = goldenMaster(
  'a project with work to brief',
  'listProjectWorkBriefs',
).briefs;
const [TICKET] = BRIEFS;
const SLUG = TICKET.qualifiedId.replace(/-\d+$/, '');
const SUBJECT = `feat(${TICKET.qualifiedId}): show the status beside the link`;

const entry = (hash: string, subject: string): GraphEntry => ({
  hash,
  shortHash: hash.padEnd(7, '0'),
  subject,
  author: 'dana.weber',
  when: '3h ago',
  title: '9 Oct 2026 12:00:00Z',
});

@Component({
  imports: [CommitGraphView],
  template: `<ui-commit-graph
    [graph]="graph"
    [entries]="entries"
    [project]="project()"
    (toggle)="toggled.push($event)"
  />`,
})
class Host {
  readonly graph = layoutGraph([
    { hash: 'b', parents: ['a'] },
    { hash: 'a', parents: [] },
  ]);
  readonly entries = [entry('b', SUBJECT), entry('a', 'chore: start')];
  readonly project = signal<string | undefined>(SLUG);
  readonly toggled: string[] = [];
}

describe('CommitGraphView', () => {
  let asked: (readonly string[])[];

  beforeEach(() => {
    asked = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideQitsWorkBriefs(async (_project, ids) => {
          asked.push(ids);
          return BRIEFS.filter((brief) => ids.includes(brief.qualifiedId));
        }),
      ],
    });
  });

  /** Renders, and lets the briefs' batch go out and its answer land. */
  async function render(project = SLUG) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.project.set(project);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const subject = element.querySelector<HTMLElement>('li span.truncate')!;
    return { fixture, element, subject };
  }

  it('draws a subject’s work ids as references, truncated, with the subject as its title', async () => {
    const { subject } = await render();
    expect(asked).toEqual([[TICKET.qualifiedId]]);
    expect(subject.getAttribute('title')).toBe(SUBJECT);
    expect(subject.classList).toContain('truncate');
    const ref = subject.querySelector('qits-commit-message qits-work-ref .qits-work-ref')!;
    expect(ref.textContent).toBe(TICKET.qualifiedId);
    const panel = subject.querySelector('[role="tooltip"]')!;
    expect(panel.textContent).toContain(TICKET.title);
  });

  it('draws the subject as plain text without a project', async () => {
    const { subject } = await render('');
    expect(asked).toEqual([]);
    expect(subject.querySelector('qits-work-ref')).toBeNull();
    expect(subject.textContent).toBe(SUBJECT);
  });

  it('leaves a mouse click on a reference to the row, and a tap opens the brief instead', async () => {
    const { fixture, subject } = await render();
    const ref = subject.querySelector<HTMLElement>('.qits-work-ref')!;

    ref.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    ref.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(fixture.componentInstance.toggled).toEqual(['b']);

    ref.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    const tap = new MouseEvent('click', { bubbles: true, cancelable: true });
    ref.dispatchEvent(tap);
    fixture.detectChanges();
    expect(tap.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.toggled).toEqual(['b']);
    expect(subject.querySelector('.qits-work-ref-panel-open')).not.toBeNull();
  });
});
