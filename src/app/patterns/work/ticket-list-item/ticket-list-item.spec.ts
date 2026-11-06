import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import type { WorkEntry } from '$core/work/work.consumes';
import { WorkStore } from '$core/work/work.store';
import type { WorkNode } from '$core/work/work-tree';
import type { WorkListView } from '$patterns/work/work-list/work-list-view';
import { ReorderList } from '$ui/components/reorder/reorder';
import { TicketListItem } from './ticket-list-item';

/** A list node for `entry`, as `WorkGraph` builds one: inline, the tree is not under test. */
const node = (entry: Partial<WorkEntry>, context = false): WorkNode => ({
  entry: { id: 'e-1', qualifiedId: 'qits-1', title: 'An item', archetype: 'TICKET', ...entry },
  children: [],
  context,
  tasks: { verified: 0, total: 0 },
});

/** The item in a list (by default Acceptance), as the work list draws it. */
@Component({
  imports: [TicketListItem],
  // The list the work list draws the item in (qits-753).
  hostDirectives: [ReorderList],
  template: `<app-ticket-list-item
    [node]="node()"
    base="/projects/qits/work/detail"
    [view]="view()"
  />`,
})
class InAcceptance {
  readonly node = input.required<WorkNode>();
  readonly view = input<WorkListView>('acceptance');
}

describe('TicketListItem', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WorkStore, useValue: { finishing: signal({}) } },
        {
          provide: SelectedProject,
          useValue: { project: signal({ id: 'p-1' }), slug: signal('qits') },
        },
      ],
    });
  });

  function render(item: WorkNode, view: WorkListView = 'acceptance') {
    const fixture = TestBed.createComponent(InAcceptance);
    fixture.componentRef.setInput('node', item);
    fixture.componentRef.setInput('view', view);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const hint = (element: HTMLElement) =>
    [...element.querySelectorAll('span')].some(
      (s) => s.textContent?.trim() === 'Closes once its release lands',
    );

  // qits-150: qits-projects-service refuses every caller's move of a TICKET to DONE, so a ticket
  // never carries a finish button; the platform closes it on its own. Acceptance shows a quiet
  // hint instead, not context and not in a mixed list (finishing, there, is not the page's job).
  it.each([
    ['TICKET', 'VERIFIED', false, true],
    ['TICKET', 'VERIFYING', false, false],
    ['TICKET', 'DONE', false, false],
    ['TICKET', 'VERIFIED', true, false],
    ['TASK', 'VERIFIED', false, false],
  ] as const)(
    'shows no finish button on a %s in %s (context: %s), and the hint: %s',
    (archetype, status, context, shownHint) => {
      const element = render(node({ archetype, status }, context));
      expect(element.querySelector('button[aria-label="Mark qits-1 done"]')).toBeNull();
      expect(hint(element)).toBe(shownHint);
    },
  );

  it('in a mixed list, shows its own status, no finish button and no hint', () => {
    const element = render(node({ status: 'VERIFIED' }), 'mixed');
    expect(element.querySelector('button[aria-label="Mark qits-1 done"]')).toBeNull();
    expect(hint(element)).toBe(false);
    expect([...element.querySelectorAll('ui-tag')].map((t) => t.textContent?.trim())).toEqual([
      'verified',
    ]);
  });

  // The board stacked below md (qits-1861): its own status, as the board's column would say.
  it.each([
    ['IMPLEMENTING', false, true],
    ['VERIFYING', false, true],
    ['IMPLEMENTING', true, false],
  ] as const)(
    'on the board, a ticket in %s (context: %s) shows its status and drag handle: %s',
    (status, context, shown) => {
      const element = render(node({ status }, context), 'board');
      expect(element.querySelector('button[aria-label="Mark qits-1 done"]')).toBeNull();
      expect(hint(element)).toBe(false);
      expect([...element.querySelectorAll('ui-tag')].map((t) => t.textContent?.trim())).toEqual(
        shown ? [status.toLowerCase()] : [],
      );
      const handle = element.querySelector('button[aria-label="Move qits-1"]')!;
      expect(handle.classList.contains('hidden')).toBe(!shown);
    },
  );

  it('shows no status in Acceptance', () => {
    const element = render(node({ status: 'VERIFIED' }));
    expect([...element.querySelectorAll('ui-tag')].map((t) => t.textContent?.trim())).toEqual([]);
  });
});
