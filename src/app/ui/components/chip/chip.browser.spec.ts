import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { Chip } from './chip';

/** Screenshots of the chip in each tone. */
@Component({
  imports: [Chip],
  host: { class: 'flex w-[24rem] flex-wrap gap-2 p-4' },
  template: `
    <ui-chip label="ready" tone="ok" />
    <ui-chip label="pending" tone="waiting" />
    <ui-chip label="CI · FAILED" tone="failed" />
    <ui-chip label="medium" />
  `,
})
class Variants {}

describe('Chip (screenshots)', () => {
  it('draws each tone', async () => {
    const fixture = TestBed.createComponent(Variants);
    fixture.detectChanges();
    await expect.element(page.elementLocator(fixture.nativeElement)).toMatchScreenshot('tones');
  });
});
