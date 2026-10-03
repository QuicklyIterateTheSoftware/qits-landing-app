import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import type { WorkEntry } from '$core/work/work.consumes';
import { WorkRef } from './work-ref';

const CAMPAIGN: WorkEntry = {
  id: 'c-1',
  qualifiedId: 'qits-622',
  title: 'A campaign with a long title',
  archetype: 'CAMPAIGN',
  status: 'REFINED',
};
const TICKET: WorkEntry = {
  id: 't-1',
  qualifiedId: 'qits-111',
  title: 'A ticket',
  archetype: 'TICKET',
};

@Component({
  imports: [WorkRef],
  template: `<app-work-ref [qualifiedId]="qualifiedId()" />`,
})
class Host {
  readonly qualifiedId = input.required<string>();
}

describe('WorkRef', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SelectedWork,
          useValue: {
            entries: signal([CAMPAIGN, TICKET]),
            campaignDescriptions: signal({ 'c-1': 'Why the campaign exists.' }),
          },
        },
        { provide: SelectedProject, useValue: { slug: signal('qits') } },
      ],
    });
  });

  function render(qualifiedId: string) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentRef.setInput('qualifiedId', qualifiedId);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const link = element.querySelector('a')!;
    const panel = element.querySelector<HTMLElement>('[role="tooltip"]')!;
    return { link, panel };
  }

  it('names a campaign by its archetype and id, and links to its page', () => {
    const { link, panel } = render('qits-622');
    expect(link.textContent?.trim()).toBe('Campaign: qits-622');
    expect(link.getAttribute('href')).toBe('/projects/qits/work/detail/qits-622');
    expect(link.getAttribute('aria-describedby')).toBe(panel.id);
  });

  it('previews the header and the campaign’s description', () => {
    const { panel } = render('qits-622');
    expect(panel.textContent).toContain('qits-622');
    expect(panel.textContent).toContain('Campaign');
    expect(panel.textContent).toContain('refined');
    expect(panel.textContent).toContain('A campaign with a long title');
    expect(panel.textContent).toContain('Why the campaign exists.');
  });

  it('previews the header alone for an item without a loaded description', () => {
    const { link, panel } = render('qits-111');
    expect(link.textContent?.trim()).toBe('Ticket: qits-111');
    const boxes = panel.querySelectorAll('p');
    expect(boxes[boxes.length - 1].classList).toContain('hidden');
  });

  it('shows the bare id for an item the work does not hold', () => {
    const { link } = render('qits-999');
    expect(link.textContent?.trim()).toBe('qits-999');
  });
});
