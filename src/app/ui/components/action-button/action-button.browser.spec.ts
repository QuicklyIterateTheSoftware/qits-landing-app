import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page, userEvent } from 'vitest/browser';
import { Action } from './action';
import { ActionButton } from './action-button';

const noop = () => undefined;

/** Screenshots of the action button: each variant alone and joined, then hovered and focused. */
@Component({
  imports: [ActionButton],
  host: { class: 'flex w-[30rem] flex-col items-start gap-4 p-4' },
  template: `
    <div class="flex gap-2">
      @for (action of actions; track action.label) {
        <ui-action-button [action]="action" />
      }
    </div>
    <div class="flex">
      <ui-action-button [action]="actions[0]" join="start" />
      <ui-action-button [action]="actions[2]" join="middle" />
      <ui-action-button [action]="actions[1]" join="end" />
    </div>
  `,
})
class Variants {
  readonly actions: Action[] = [
    { label: 'Approve', variant: 'success', callback: noop },
    { label: 'Delete', variant: 'danger', callback: noop },
    { label: 'Archive', variant: 'muted', callback: noop },
  ];
}

/** An action with details, joined to one without, at the right like a page's actions. */
@Component({
  imports: [ActionButton],
  host: { class: 'flex h-56 w-[30rem] items-start justify-end p-4' },
  template: `
    <ui-action-button [action]="dispatch" join="start" />
    <ui-action-button [action]="archive" join="end" />
  `,
})
class WithDetails {
  readonly dispatch: Action = {
    label: 'Dispatch',
    variant: 'success',
    callback: noop,
    details: {
      title: 'Moves through',
      items: ['Refining', 'Ready', 'Implementing', 'Reviewing'],
    },
  };
  readonly archive: Action = { label: 'Archive', variant: 'muted', callback: noop };
}

describe('ActionButton (screenshots)', () => {
  function shown() {
    const fixture = TestBed.createComponent(Variants);
    fixture.detectChanges();
    return page.elementLocator(fixture.nativeElement);
  }

  it('draws the variants, alone and joined', async () => {
    await expect.element(shown()).toMatchScreenshot('variants');
  });

  it('draws a hovered button', async () => {
    const element = shown();
    for (const name of ['Approve', 'Delete', 'Archive']) {
      await userEvent.hover(element.getByRole('button', { name }).first());
      await expect.element(element).toMatchScreenshot(`hover-${name.toLowerCase()}`);
    }
  });

  it('draws the keyboard focus ring above its joined neighbours', async () => {
    const element = shown();
    // Tab to the joined row's middle button (the fifth button).
    for (let i = 0; i < 5; i++) await userEvent.tab();
    await expect.element(element.getByRole('button', { name: 'Archive' }).last()).toHaveFocus();
    await expect.element(element).toMatchScreenshot('focus');
  });

  describe('with details', () => {
    function detailed() {
      const fixture = TestBed.createComponent(WithDetails);
      fixture.detectChanges();
      return page.elementLocator(fixture.nativeElement);
    }

    it('draws closed', async () => {
      await expect.element(detailed()).toMatchScreenshot('details-closed');
    });

    it('opens on hover, below the button and lined up with its right edge', async () => {
      const element = detailed();
      await userEvent.hover(element.getByRole('button', { name: 'Dispatch' }));
      await expect.element(element.getByRole('tooltip')).toBeVisible();
      await expect.element(element).toMatchScreenshot('details-hover');
    });

    it('opens on keyboard focus, above the joined neighbour', async () => {
      const element = detailed();
      await userEvent.tab();
      await expect.element(element.getByRole('button', { name: 'Dispatch' })).toHaveFocus();
      await expect.element(element.getByRole('tooltip')).toBeVisible();
      await expect.element(element).toMatchScreenshot('details-focus');
    });
  });
});
