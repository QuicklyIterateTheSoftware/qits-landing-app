import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page, userEvent } from 'vitest/browser';
import { expectUnclipped } from '../../../../testing/browser/unclipped';
import { Dropdown } from './dropdown';

/** Screenshots of the dropdown: closed, and open with a short list in its panel. */
@Component({
  imports: [Dropdown],
  host: { class: 'flex h-72 w-[30rem] justify-end p-4' },
  template: `
    <ui-dropdown label="Things" panelLabel="Recent things">
      <svg
        dropdown-trigger
        viewBox="0 0 24 24"
        aria-hidden="true"
        class="size-5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
      >
        <circle cx="12" cy="12" r="8" />
      </svg>
      <ul dropdown-panel class="m-0 list-none p-0">
        <li class="border-b border-gray-100 px-3 py-2 text-sm">First thing</li>
        <li class="border-b border-gray-100 px-3 py-2 text-sm">Second thing</li>
        <li class="px-3 py-2 text-sm">Third thing</li>
      </ul>
    </ui-dropdown>
  `,
})
class Example {}

describe('Dropdown (screenshots)', () => {
  it('draws closed and open', async () => {
    const fixture = TestBed.createComponent(Example);
    fixture.detectChanges();
    const element = page.elementLocator(fixture.nativeElement);
    await expect.element(element).toMatchScreenshot('closed', { kind: 'DATA' });
    await page.getByRole('button', { name: 'Things' }).click();
    fixture.detectChanges();
    await expect.element(element).toMatchScreenshot('open', { kind: 'DATA' });
  });
});

/**
 * A dropdown in a short scroll container at the window's bottom right, as a menu in a scrolling
 * column (qits-2081): its 320px panel sticks out of the 10rem box on the left, and has no room
 * below it.
 */
@Component({
  imports: [Dropdown],
  template: `
    <div
      id="box"
      class="fixed right-2 bottom-2 flex h-24 w-40 items-end justify-end overflow-y-auto border border-gray-300"
    >
      <ui-dropdown label="Things" panelLabel="Recent things" panelId="things">
        <span dropdown-trigger>T</span>
        <ul dropdown-panel class="m-0 list-none p-0">
          <li class="px-3 py-2 text-sm">First thing</li>
          <li class="px-3 py-2 text-sm">Second thing</li>
          <li class="px-3 py-2 text-sm">Third thing</li>
        </ul>
      </ui-dropdown>
    </div>
    <button id="outside" type="button" class="m-4">Elsewhere</button>
  `,
})
class Scrolling {}

/**
 * A dropdown just under a sticky top bar, as the shell's (`z-50`), without room below its button:
 * its panel goes above it, into the bar's height.
 */
@Component({
  imports: [Dropdown],
  template: `
    <div class="fixed inset-x-0 top-0 z-50 h-14 bg-gray-800"></div>
    <div class="mt-[150px] ml-2 h-12 w-40 overflow-y-auto">
      <ui-dropdown align="start" label="Many" panelLabel="Many things" panelId="many">
        <span dropdown-trigger>M</span>
        <ul dropdown-panel class="m-0 list-none p-0">
          @for (n of things; track n) {
            <li class="px-3 py-2 text-sm">Thing {{ n }}</li>
          }
        </ul>
      </ui-dropdown>
    </div>
  `,
})
class UnderTopBar {
  protected readonly things = Array.from({ length: 3 }, (_, n) => n + 1);
}

describe('Dropdown in a scroll container (browser)', () => {
  afterEach(() => page.viewport(800, 600));

  function shown() {
    const fixture = TestBed.createComponent(Scrolling);
    fixture.detectChanges();
    const panel = document.querySelector<HTMLElement>('#things')!;
    return { fixture, panel, button: page.getByRole('button', { name: 'Things' }) };
  }

  it('opens whole and inside the window, above its button where there is no room below', async () => {
    await page.viewport(1280, 800);
    const { panel, button } = shown();
    await button.click();
    await expect.element(page.getByRole('region', { name: 'Recent things' })).toBeVisible();
    await expect.poll(() => panel.dataset['floatingSide']).toBe('above');
    expectUnclipped(panel);
    // Its right edge on its button's, its bottom above it.
    const trigger = button.element().getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    expect(box.right).toBeCloseTo(trigger.right, 0);
    expect(box.bottom).toBeLessThanOrEqual(trigger.top);
    await expect.element(page.getByRole('region', { name: 'Recent things' })).toHaveFocus();
  });

  it('stacks over a sticky top bar when it reaches the window’s top', async () => {
    await page.viewport(1280, 300);
    const fixture = TestBed.createComponent(UnderTopBar);
    fixture.detectChanges();
    const panel = document.querySelector<HTMLElement>('#many')!;
    await page.getByRole('button', { name: 'Many' }).click();
    await expect.poll(() => panel.dataset['floatingSide']).toBe('above');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    // Its top inside the bar's 56px.
    expect(panel.getBoundingClientRect().top).toBeLessThan(56);
    expectUnclipped(panel);
  });

  it('still closes on Escape, the focus back on its button, and on a click outside', async () => {
    await page.viewport(1280, 800);
    const { panel, button } = shown();
    await button.click();
    await expect.poll(() => panel.dataset['floatingSide']).toBe('above');
    await userEvent.keyboard('{Escape}');
    await expect.element(panel).not.toBeVisible();
    await expect.element(button).toHaveFocus();
    // Closed, it floats no more: the classes place it again.
    expect(panel.getAttribute('style')).toBeNull();

    await button.click();
    await expect.element(panel).toBeVisible();
    await page.getByRole('button', { name: 'Elsewhere' }).click();
    await expect.element(panel).not.toBeVisible();
  });

  it('is still the window-wide sheet below 768px', async () => {
    await page.viewport(600, 800);
    const { panel, button } = shown();
    await button.click();
    await expect.element(panel).toBeVisible();
    // A frame for the directive to have had its turn.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(panel.getAttribute('style')).toBeNull();
    const box = panel.getBoundingClientRect();
    expect(box.left).toBe(0);
    expect(box.top).toBe(0);
    expect(box.width).toBe(document.documentElement.clientWidth);
  });
});
