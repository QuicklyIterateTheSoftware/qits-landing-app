import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
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
    await expect.element(element).toMatchScreenshot('closed');
    await page.getByRole('button', { name: 'Things' }).click();
    fixture.detectChanges();
    await expect.element(element).toMatchScreenshot('open');
  });
});
