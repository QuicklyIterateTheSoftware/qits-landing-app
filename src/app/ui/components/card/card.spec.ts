import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CARD } from './base-card';
import { CardSilent } from './card-silent';

@Component({
  imports: [CARD, CardSilent],
  template: `
    <ui-base-card id="both">
      <card-header>Title</card-header>
      <card-body>Content</card-body>
    </ui-base-card>
    <ui-card-silent id="silent">
      <card-header>Only a title</card-header>
    </ui-card-silent>
  `,
})
class Host {}

describe('cards', () => {
  function render(): HTMLElement {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('projects the header before the body', () => {
    const card = render().querySelector('#both')!;
    // The slots sit in the card's frame, the host's one child.
    const frame = card.firstElementChild!;
    expect([...frame.children].map((child) => child.tagName.toLowerCase())).toEqual([
      'card-header',
      'card-body',
    ]);
  });

  it('passes both slots through the silent variant, into a base card', () => {
    const silent = render().querySelector('#silent')!;
    const inner = silent.querySelector('ui-base-card')!;
    expect(inner.querySelector('card-header')?.textContent).toBe('Only a title');
    expect(inner.querySelector('card-body')).toBeNull();
  });
});
