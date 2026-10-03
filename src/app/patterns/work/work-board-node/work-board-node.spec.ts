import { Component, input, signal } from '@angular/core';
import { Board } from '../../../ui/components/board/board';
import { BOARD_COLUMNS } from '../../../core/work/work-statuses';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SelectedProject } from '../../../core/projects/selected-project';
import type { WorkEntry } from '../../../core/work/work.consumes';
import { WorkStore } from '../../../core/work/work.store';
import type { WorkNode } from '../../../core/work/work-tree';
import { WorkBoardNode } from './work-board-node';

/** A board node for `entry`, as `WorkGraph` builds one: inline, the tree is not under test. */
const node = (entry: Partial<WorkEntry>): WorkNode => ({
  entry: { id: 'e-1', qualifiedId: 'qits-1', title: 'An item', ...entry },
  children: [],
  context: false,
  column: entry.status === 'VERIFIED' ? 2 : 0,
  campaigns: [],
});

/** The node on a board, as the Work page draws it: a lane's action slot exists only there. */
@Component({
  imports: [Board, WorkBoardNode],
  template: `
    <ui-board gutter [columns]="columns">
      <app-work-board-node [node]="node()" base="/projects/qits/work" />
    </ui-board>
  `,
})
class OnBoard {
  readonly node = input.required<WorkNode>();
  readonly columns = BOARD_COLUMNS.map((c) => ({ label: c.label, body: c.body, header: c.header }));
}

describe('WorkBoardNode', () => {
  const finish = vi.fn();

  beforeEach(() => {
    finish.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WorkStore, useValue: { finishing: signal({}), finish } },
        { provide: SelectedProject, useValue: { project: signal({ id: 'p-1' }) } },
      ],
    });
  });

  function render(entry: Partial<WorkEntry>) {
    const fixture = TestBed.createComponent(OnBoard);
    fixture.componentRef.setInput('node', node(entry));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const button = (element: HTMLElement) =>
    element.querySelector('button[aria-label="Mark qits-1 done"]') as HTMLButtonElement;

  it.each([
    ['EPIC', 'VERIFIED', true],
    ['TICKET', 'VERIFIED', true],
    ['EPIC', 'IMPLEMENTED', false],
    ['TICKET', 'REFINED', false],
    ['TASK', undefined, false],
  ] as const)('shows the finish button on a %s in %s: %s', (archetype, status, shown) => {
    const element = render({ archetype, status });
    // Always rendered, switched by class.
    expect(button(element).classList.contains('hidden')).toBe(!shown);
  });

  it('finishes the item in the open project on a click', () => {
    const element = render({ archetype: 'TICKET', status: 'VERIFIED' });
    button(element).click();
    expect(finish).toHaveBeenCalledWith('p-1', expect.objectContaining({ id: 'e-1' }));
  });
});
