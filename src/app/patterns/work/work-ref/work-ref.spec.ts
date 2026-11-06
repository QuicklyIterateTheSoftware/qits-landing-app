import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import type { WorkEntry } from '$core/work/work.consumes';
import { WorkRef } from './work-ref';

const EPIC: WorkEntry = {
  id: 'e-1',
  qualifiedId: 'qits-622',
  title: 'An epic with a long title',
  archetype: 'EPIC',
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
        { provide: SelectedWork, useValue: { entries: signal([EPIC, TICKET]) } },
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

  it('names an item by its archetype and id, and links to its page', () => {
    const { link, panel } = render('qits-622');
    expect(link.textContent?.trim()).toBe('Epic: qits-622');
    expect(link.getAttribute('href')).toBe('/projects/qits/work/detail/qits-622');
    expect(link.getAttribute('aria-describedby')).toBe(panel.id);
  });

  it('previews the id, the archetype, the status and the title', () => {
    const { panel } = render('qits-622');
    expect(panel.textContent).toContain('qits-622');
    expect(panel.textContent).toContain('Epic');
    expect(panel.textContent).toContain('refined');
    expect(panel.textContent).toContain('An epic with a long title');
  });

  it('names a ticket the same way', () => {
    const { link } = render('qits-111');
    expect(link.textContent?.trim()).toBe('Ticket: qits-111');
  });

  it('shows the bare id for an item the work does not hold', () => {
    const { link } = render('qits-999');
    expect(link.textContent?.trim()).toBe('qits-999');
  });

  it('on a finger, opens the preview on a tap instead of following the tag, and links the item in it', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentRef.setInput('qualifiedId', 'qits-622');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl');
    const tag = element.querySelector('a')!;
    const wrapper = element.querySelector<HTMLElement>('[data-popover-panel]')!;

    tag.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    const tap = new MouseEvent('click', { bubbles: true, cancelable: true });
    tag.dispatchEvent(tap);
    fixture.detectChanges();
    expect(tap.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(wrapper.classList).toContain('block');

    const inside = wrapper.querySelector('a')!;
    expect(inside.textContent?.trim()).toBe('qits-622');
    expect(inside.getAttribute('href')).toBe('/projects/qits/work/detail/qits-622');
  });
});
