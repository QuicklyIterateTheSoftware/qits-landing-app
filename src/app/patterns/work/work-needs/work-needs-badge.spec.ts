import { TestBed } from '@angular/core/testing';
import { goldenMaster, isRecorded, NEEDS_STATE } from '../../../../testing/golden-masters';
import { WorkNeedsBadge } from './work-needs-badge';

/** The "needs" badge (epic qits-1899), on the recorded work items' needs. */
describe('WorkNeedsBadge', () => {
  function render(needs: unknown, unmet?: unknown) {
    const fixture = TestBed.createComponent(WorkNeedsBadge);
    fixture.componentRef.setInput('needs', needs);
    fixture.componentRef.setInput('unmet', unmet);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return {
      badge: element.querySelector<HTMLElement>('[data-work-needs]'),
      lines: [...element.querySelectorAll('[data-work-need-line]')].map((li) =>
        li.textContent?.trim(),
      ),
      tooltip: element.querySelector('[role=tooltip]'),
    };
  }

  /** The entity of `NEEDS_STATE`'s work titled `title`. */
  const entity = (title: string) =>
    goldenMaster(NEEDS_STATE, 'listProjectWork').entities.find(
      (e: { title: string }) => e.title === title,
    );

  it.skipIf(!isRecorded(NEEDS_STATE, 'listProjectWork'))(
    'says how many needs are not met, and lists them in its tooltip',
    () => {
      const ticket = entity('Render work ids in the list');
      const { badge, lines, tooltip } = render(ticket.needs, ticket.unmetNeeds);
      expect(badge?.textContent?.trim()).toBe('needs 1');
      expect(badge?.getAttribute('aria-describedby')).toBe(tooltip?.id);
      expect(badge?.getAttribute('aria-label')).toBe('Needs 1 item not at its status yet');
      expect(lines).toEqual(['contract-00000001-1 at VERIFIED (now REFINED)']);
      expect(badge?.textContent).not.toMatch(/waiting/i);
    },
  );

  it.skipIf(!isRecorded(NEEDS_STATE, 'listWorkChildren'))(
    'draws nothing once every need is met',
    () => {
      const task = goldenMaster(NEEDS_STATE, 'listWorkChildren').children[0];
      expect(task.needs[0].met).toBe(true);
      expect(render(task.needs, task.unmetNeeds).badge).toBeNull();
    },
  );

  it('draws nothing for an item that needs nothing, or one whose read carries no needs', () => {
    expect(render([], 0).badge).toBeNull();
    expect(render(undefined).badge).toBeNull();
    const [first] = goldenMaster('a project with work in every status', 'listProjectWork').entities;
    expect(render(first.needs, first.unmetNeeds).badge).toBeNull();
  });
});
