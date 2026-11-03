import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  draftOf,
  groupSpecs,
  newGroup,
  type GroupDraft,
} from '$core/milestones/milestone-criteria';
import { pendingGoldenMaster } from '../../../../testing/pending-golden-masters';
import { MilestoneEditor } from './milestone-editor';

@Component({
  imports: [MilestoneEditor],
  template: `<app-milestone-editor [(groups)]="groups" />`,
})
class Host {
  readonly groups = signal<readonly GroupDraft[]>([newGroup()]);
}

/** The criteria editor (epic qits-615): groups OR'd, criteria AND'd. */
describe('MilestoneEditor', () => {
  function render(groups?: readonly GroupDraft[]) {
    const fixture = TestBed.createComponent(Host);
    if (groups) fixture.componentInstance.groups.set(groups);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...element.querySelectorAll('button')].filter((b) => b.textContent?.trim() === label);
    const field = <T extends HTMLElement>(label: string) =>
      element.querySelector<T>(`[aria-label="${label}"]`)!;
    return { fixture, element, button, field, groups: () => fixture.componentInstance.groups() };
  }

  it('draws a recorded condition: an approval, or a work item done', () => {
    const { milestone } = pendingGoldenMaster(
      'a ticket waiting on an unmet milestone',
      'setMilestoneGroups',
    );
    const { element, field } = render(draftOf(milestone));
    expect(element.querySelectorAll('[data-milestone-group]')).toHaveLength(2);
    expect(element.textContent).toContain('or');
    expect(field<HTMLSelectElement>('Group 2, criterion 1: kind').value).toBe('ENTITY_STATUS');
    expect(field<HTMLInputElement>('Group 2, criterion 1: Work item').value).toBe(
      milestone.groups[1].criteria[0].predicate.entityId,
    );
    expect(field<HTMLSelectElement>('Group 2, criterion 1: Status').value).toBe('DONE');
  });

  it('adds a criterion (and) and a group (or), changes a kind, and fills its fields', () => {
    const { fixture, button, field, groups } = render();
    button('And another criterion')[0].click();
    button('Or another group')[0].click();
    fixture.detectChanges();
    const kind = field<HTMLSelectElement>('Group 2, criterion 1: kind');
    kind.value = 'SCM_RELEASE';
    kind.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const repository = field<HTMLInputElement>('Group 2, criterion 1: Repository');
    repository.value = 'qits-qits';
    repository.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(groupSpecs(groups())).toEqual([
      {
        criteria: [
          { kind: 'APPROVAL', predicate: {} },
          { kind: 'APPROVAL', predicate: {} },
        ],
      },
      {
        criteria: [
          { kind: 'SCM_RELEASE', predicate: { repositoryName: 'qits-qits', minimumVersion: null } },
        ],
      },
    ]);
  });

  it('removes a criterion and a group, never the last group', () => {
    const { fixture, button, groups } = render([newGroup(), newGroup()]);
    button('Remove group')[1].click();
    fixture.detectChanges();
    expect(groups()).toHaveLength(1);
    expect(button('Remove group')[0].disabled).toBe(true);
    button('Remove')[0].click();
    fixture.detectChanges();
    expect(groups()[0].criteria).toHaveLength(0);
  });
});
