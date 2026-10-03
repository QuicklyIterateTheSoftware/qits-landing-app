import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page, userEvent } from 'vitest/browser';
import { Popover } from './popover';

/** Screenshots of the popover: closed, open on hover, open on focus, and lined up at the end. */
@Component({
  imports: [Popover],
  host: { class: 'flex h-48 w-[30rem] items-start justify-between p-4' },
  template: `
    <ui-popover #start>
      <button
        type="button"
        class="rounded-md border border-charcoal-brown-300 px-3 py-1 text-sm"
        [attr.aria-describedby]="start.panelId()"
      >
        Start
      </button>
      <p popover-content class="m-0">Lines up with the left edge of its trigger.</p>
    </ui-popover>
    <ui-popover #end align="end">
      <button
        type="button"
        class="rounded-md border border-charcoal-brown-300 px-3 py-1 text-sm"
        [attr.aria-describedby]="end.panelId()"
      >
        End
      </button>
      <p popover-content class="m-0">Lines up with the right edge, so it stays in the window.</p>
    </ui-popover>
  `,
})
class Example {}

describe('Popover (screenshots)', () => {
  function shown() {
    const fixture = TestBed.createComponent(Example);
    fixture.detectChanges();
    return { fixture, element: page.elementLocator(fixture.nativeElement) };
  }

  it('draws closed', async () => {
    const { element } = shown();
    await expect.element(element.getByText(/left edge/)).not.toBeVisible();
    await expect.element(element).toMatchScreenshot('closed');
  });

  it('opens on hover, at either edge', async () => {
    const { element } = shown();
    await userEvent.hover(element.getByRole('button', { name: 'Start' }));
    await expect.element(element.getByText(/left edge/)).toBeVisible();
    await expect.element(element).toMatchScreenshot('hover-start');
    await userEvent.hover(element.getByRole('button', { name: 'End' }));
    await expect.element(element.getByText(/left edge/)).not.toBeVisible();
    await expect.element(element.getByText(/right edge/)).toBeVisible();
    await expect.element(element).toMatchScreenshot('hover-end');
  });

  it('opens on keyboard focus, and Escape closes it', async () => {
    const { fixture, element } = shown();
    await userEvent.tab();
    await expect.element(element.getByRole('button', { name: 'Start' })).toHaveFocus();
    await expect
      .element(element.getByRole('button', { name: 'Start' }))
      .toHaveAccessibleDescription('Lines up with the left edge of its trigger.');
    await expect.element(element.getByText(/left edge/)).toBeVisible();
    await expect.element(element).toMatchScreenshot('focus');
    await userEvent.keyboard('{Escape}');
    fixture.detectChanges();
    await expect.element(element.getByText(/left edge/)).not.toBeVisible();
  });
});
