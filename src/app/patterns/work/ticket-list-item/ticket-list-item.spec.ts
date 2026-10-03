import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import type { WorkEntry } from '$core/work/work.consumes';
import { WorkStore } from '$core/work/work.store';
import type { WorkNode } from '$core/work/work-tree';
import type { WorkListView } from '$patterns/work/work-list/work-list-view';
import { TicketListItem } from './ticket-list-item';

/** A list node for `entry`, as `WorkGraph` builds one: inline, the tree is not under test. */
const node = (entry: Partial<WorkEntry>, context = false): WorkNode => ({
  entry: { id: 'e-1', qualifiedId: 'qits-1', title: 'An item', archetype: 'TICKET', ...entry },
  children: [],
  context,
  campaigns: [],
  tasks: { verified: 0, total: 0 },
});

/** The item in a list (by default Acceptance), as the work list draws it. */
@Component({
  imports: [TicketListItem],
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
  const finishLater = vi.fn();

  beforeEach(() => {
    finishLater.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WorkStore, useValue: { finishing: signal({}), finishLater } },
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

  const button = (element: HTMLElement) =>
    element.querySelector('button[aria-label="Mark qits-1 done"]') as HTMLButtonElement;

  it.each([
    ['TICKET', 'VERIFIED', false, true],
    ['TICKET', 'VERIFYING', false, false],
    ['TICKET', 'DONE', false, false],
    ['TICKET', 'VERIFIED', true, false],
    ['TASK', 'VERIFIED', false, false],
  ] as const)(
    'shows the finish button on a %s in %s (context: %s): %s',
    (archetype, status, context, shown) => {
      const element = render(node({ archetype, status }, context));
      // Always rendered, switched by class.
      expect(button(element).classList.contains('hidden')).toBe(!shown);
    },
  );

  it('asks for a finish with Undo in the open project on a click', () => {
    const element = render(node({ status: 'VERIFIED' }));
    button(element).click();
    expect(finishLater).toHaveBeenCalledWith('p-1', expect.objectContaining({ id: 'e-1' }));
  });
  it('in a campaign, shows its own status and no finish button', () => {
    const element = render(node({ status: 'VERIFIED' }), 'campaign');
    expect(button(element).classList.contains('hidden')).toBe(true);
    expect([...element.querySelectorAll('ui-tag')].map((t) => t.textContent?.trim())).toEqual([
      'verified',
    ]);
  });

  it('shows no status in Acceptance', () => {
    const element = render(node({ status: 'VERIFIED' }));
    expect([...element.querySelectorAll('ui-tag')].map((t) => t.textContent?.trim())).toEqual([]);
  });
});
