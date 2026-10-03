import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import type { WorkEntry } from '$core/work/work.consumes';
import { WorkStore } from '$core/work/work.store';
import type { WorkNode } from '$core/work/work-tree';
import { TicketListItem } from './ticket-list-item';

/** A list node for `entry`, as `WorkGraph` builds one: inline, the tree is not under test. */
const node = (entry: Partial<WorkEntry>, context = false): WorkNode => ({
  entry: { id: 'e-1', qualifiedId: 'qits-1', title: 'An item', archetype: 'TICKET', ...entry },
  children: [],
  context,
  campaigns: [],
  tasks: { columns: [0, 0, 0, 0], verified: 0, total: 0 },
});

/** The item in the Acceptance list, as the work list draws it. */
@Component({
  imports: [TicketListItem],
  template: `<app-ticket-list-item [node]="node()" base="/projects/qits/work" view="acceptance" />`,
})
class InAcceptance {
  readonly node = input.required<WorkNode>();
}

describe('TicketListItem', () => {
  const finishLater = vi.fn();

  beforeEach(() => {
    finishLater.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WorkStore, useValue: { finishing: signal({}), finishLater } },
        { provide: SelectedProject, useValue: { project: signal({ id: 'p-1' }) } },
      ],
    });
  });

  function render(item: WorkNode) {
    const fixture = TestBed.createComponent(InAcceptance);
    fixture.componentRef.setInput('node', item);
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
});
