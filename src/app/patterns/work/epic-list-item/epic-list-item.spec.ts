import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import type { WorkEntry } from '$core/work/work.consumes';
import { WorkStore } from '$core/work/work.store';
import type { WorkNode } from '$core/work/work-tree';
import type { WorkListView } from '$patterns/work/work-list/work-list-view';
import { EpicListItem } from './epic-list-item';

/** A list node for `entry`, as `WorkGraph` builds one: inline, the tree is not under test. */
const node = (entry: Partial<WorkEntry>, context = false): WorkNode => ({
  entry: { id: 'e-1', qualifiedId: 'qits-1', title: 'An item', archetype: 'EPIC', ...entry },
  children: [],
  context,
  campaigns: [],
});

/** The item in a list (by default Acceptance), as the work list draws it. */
@Component({
  imports: [EpicListItem],
  template: `<app-epic-list-item
    [node]="node()"
    base="/projects/qits/work/detail"
    [view]="view()"
  />`,
})
class InAcceptance {
  readonly node = input.required<WorkNode>();
  readonly view = input<WorkListView>('acceptance');
}

describe('EpicListItem', () => {
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
    ['EPIC', 'VERIFIED', false, true],
    ['EPIC', 'VERIFYING', false, false],
    ['EPIC', 'DONE', false, false],
    ['EPIC', 'VERIFIED', true, false],
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

  it('sums up a VERIFIED epic’s tasks as all done, and starts expanded', () => {
    const task = (id: string) => node({ id, qualifiedId: id, archetype: 'TASK' });
    const feature = { ...node({ id: 'f', qualifiedId: 'qits-2', archetype: 'FEATURE' }) };
    const epic = {
      ...node({ status: 'VERIFIED' }),
      children: [{ ...feature, children: [task('qits-3'), task('qits-4')] }],
    };
    const element = render(epic);
    expect(element.querySelector('[lane-summary]')?.textContent).toBe('2 / 2 ✅');
    expect(element.querySelector('ui-expand-button button')?.getAttribute('aria-expanded')).toBe(
      'true',
    );
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

  it('in a campaign, sums up a DONE epic’s tasks as all done, and starts collapsed', () => {
    const task = (id: string) => node({ id, qualifiedId: id, archetype: 'TASK' });
    const epic = { ...node({ status: 'DONE' }), children: [task('qits-3')] };
    const element = render(epic, 'campaign');
    expect(element.querySelector('[lane-summary]')?.textContent).toBe('1 / 1 ✅');
    expect(element.querySelector('ui-expand-button button')?.getAttribute('aria-expanded')).toBe(
      'false',
    );
  });
});
