import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { REORDER } from '$ui/components/reorder/reorder';
import { DragHandle } from './drag-handle';

/** One item of a reorder list with its handle: inline data, it is UI. */
@Component({
  imports: [DragHandle, REORDER],
  template: `
    <div uiReorderList>
      <div uiReorderItem class="relative">
        An item
        <ui-drag-handle label="Move qits-12" [shown]="shown()" />
      </div>
    </div>
  `,
})
class Item {
  readonly shown = input(true);
}

describe('DragHandle', () => {
  function render(shown = true) {
    const fixture = TestBed.createComponent(Item);
    fixture.componentRef.setInput('shown', shown);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('ui-drag-handle button')!;
  }

  it('is a labelled button that is its item’s reorder handle', () => {
    const button = render();
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Move qits-12');
    expect(button.getAttribute('aria-roledescription')).toBe('drag handle');
    expect(button.classList).toContain('flex');
  });

  it('is hidden by class, not removed, when not shown', () => {
    const button = render(false);
    expect(button.classList).toContain('hidden');
    expect(button.classList).not.toContain('flex');
  });
});
