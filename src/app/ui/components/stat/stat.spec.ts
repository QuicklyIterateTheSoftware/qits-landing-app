import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Stat } from './stat';

@Component({
  imports: [Stat],
  template: `<ui-stat label="Components">52</ui-stat>`,
})
class Host {}

describe('Stat', () => {
  it('pairs the label and the value', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('dt')?.textContent?.trim()).toBe('Components');
    expect(element.querySelector('dd')?.textContent?.trim()).toBe('52');
  });
});
