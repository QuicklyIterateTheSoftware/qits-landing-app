import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { Stat } from './stat';

/** Screenshots of the stat tile: label lengths, value sizes and a loading text. */
@Component({
  imports: [Stat],
  host: { class: 'grid w-[40rem] grid-cols-3 gap-4 p-4' },
  template: `
    <ui-stat label="Components">52</ui-stat>
    <ui-stat label="Repositories with open release requests">3</ui-stat>
    <ui-stat label="Lines">1,319,512</ui-stat>
    <ui-stat label="Components"
      ><span class="text-base font-normal text-gray-500">Loading…</span></ui-stat
    >
  `,
})
class Variants {}

describe('Stat (screenshots)', () => {
  it('draws the variants', async () => {
    const fixture = TestBed.createComponent(Variants);
    fixture.detectChanges();
    await expect.element(page.elementLocator(fixture.nativeElement)).toMatchScreenshot('variants');
  });
});
