import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import { goldenMaster } from '../../../../testing/golden-masters';
import { MilestoneNeeds } from './milestone-needs';

/** The "needs" marks (epic qits-615), on the recorded work items' milestones. */
describe('MilestoneNeeds', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SelectedProject, useValue: { slug: signal('contract') } },
      ],
    });
  });

  function render(milestones: unknown) {
    const fixture = TestBed.createComponent(MilestoneNeeds);
    fixture.componentRef.setInput('milestones', milestones);
    fixture.detectChanges();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('a[data-milestone-needs]')];
  }

  it('marks an unmet milestone "needs: <name>", linked to its page and named in full', () => {
    const work = goldenMaster('a ticket waiting on an unmet milestone', 'listProjectWork');
    const [mark, ...rest] = render(work.entities[0].milestones);
    expect(rest).toHaveLength(0);
    expect(mark.textContent?.replace('⚑', '').trim()).toBe('needs: bootstrap test node');
    expect(mark.getAttribute('aria-label')).toBe(
      'Needs milestone bootstrap test node, not met yet',
    );
    expect(mark.getAttribute('href')).toBe(
      `/projects/contract/work/milestones/${work.entities[0].milestones[0].id}`,
    );
    expect(mark.textContent).not.toMatch(/waiting/i);
  });

  it('draws nothing for a met milestone, or for none', () => {
    const work = goldenMaster('a ticket waiting on a met milestone', 'listProjectWork');
    expect(render(work.entities[0].milestones)).toHaveLength(0);
    expect(render(undefined)).toHaveLength(0);
  });
});
