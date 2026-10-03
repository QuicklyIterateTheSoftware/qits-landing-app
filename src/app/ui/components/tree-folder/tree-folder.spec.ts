import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TreeFolder } from './tree-folder';

@Component({
  imports: [TreeFolder],
  template: `
    <ui-tree-folder name="components">
      <ui-tree-folder name="contract" [level]="3"><p>contract-service</p></ui-tree-folder>
    </ui-tree-folder>
  `,
})
class Host {}

describe('TreeFolder', () => {
  it('names each directory in a heading at its level, and nests its content', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const headings = [...element.querySelectorAll('[role="heading"]')];
    expect(headings.map((h) => h.textContent?.trim())).toEqual(['components/', 'contract/']);
    expect(headings.map((h) => h.getAttribute('aria-level'))).toEqual(['2', '3']);
    expect(element.querySelector('ui-tree-folder ui-tree-folder p')?.textContent).toBe(
      'contract-service',
    );
  });
});
