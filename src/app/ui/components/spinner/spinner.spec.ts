import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Spinner } from './spinner';

@Component({
  imports: [Spinner],
  template: `<ui-spinner /><ui-spinner label="Loading projects" />`,
})
class Host {}

describe('Spinner', () => {
  it('is an image named "Loading" unless told otherwise', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const images = [...(fixture.nativeElement as HTMLElement).querySelectorAll('svg')];
    expect(images.map((svg) => svg.getAttribute('role'))).toEqual(['img', 'img']);
    expect(images.map((svg) => svg.getAttribute('aria-label'))).toEqual([
      'Loading',
      'Loading projects',
    ]);
    expect(images[0].querySelectorAll('animateTransform').length).toBe(5);
  });
});
