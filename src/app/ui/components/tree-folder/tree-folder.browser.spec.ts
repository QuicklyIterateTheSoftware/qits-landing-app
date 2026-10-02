import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { TreeFolder } from './tree-folder';

/** Screenshots of the tree folder: nested directories with leaf content. */
@Component({
  imports: [TreeFolder],
  host: { class: 'block w-[24rem] p-4' },
  template: `
    <ui-tree-folder name="components">
      <ui-tree-folder name="billing" [level]="3">
        <p class="m-0 py-1 text-sm">billing-daemon</p>
        <p class="m-0 py-1 text-sm">billing-javalib</p>
      </ui-tree-folder>
      <ui-tree-folder name="a-much-longer-component-name" [level]="3">
        <p class="m-0 py-1 text-sm">contract-service</p>
      </ui-tree-folder>
    </ui-tree-folder>
  `,
})
class Variants {}

describe('TreeFolder (screenshots)', () => {
  it('draws nested directories', async () => {
    const fixture = TestBed.createComponent(Variants);
    fixture.detectChanges();
    await expect.element(page.elementLocator(fixture.nativeElement)).toMatchScreenshot('nested');
  });
});
