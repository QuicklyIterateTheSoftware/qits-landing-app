import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { JsonBlock } from './json-block';

/** A screenshot of a short JSON block. */
@Component({
  imports: [JsonBlock],
  host: { class: 'block w-[24rem] p-4' },
  template: `<ui-json-block [json]="json" />`,
})
class Short {
  json = JSON.stringify({ id: 'r-1', status: 'RUNNING', steps: [{ name: 'build' }] }, null, 2);
}

describe('JsonBlock (screenshots)', () => {
  it('draws the heading, the copy button and the JSON', async () => {
    const fixture = TestBed.createComponent(Short);
    fixture.detectChanges();
    await expect
      .element(page.elementLocator(fixture.nativeElement))
      .toMatchScreenshot('short', { kind: 'DATA' });
  });
});
