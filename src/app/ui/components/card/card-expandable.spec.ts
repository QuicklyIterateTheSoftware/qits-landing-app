import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Highlighter } from '$ui/components/highlight/highlight';
import { CARD } from './base-card';

@Component({
  imports: [CARD],
  template: `
    <ui-base-card>
      <card-body>Body</card-body>
      <card-expandable><p>More</p></card-expandable>
    </ui-base-card>
  `,
})
class Host {}

describe('CardExpandable', () => {
  it('starts closed and opens and closes with its button', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('card-expandable button') as HTMLButtonElement;
    const content = element.querySelector(`#${button.getAttribute('aria-controls')}`)!;
    expect(content.textContent).toContain('More');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Show more');
    expect(content.getAttribute('hidden')).toBe('until-found');

    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Show less');
    expect(content.hasAttribute('hidden')).toBe(false);

    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens and highlights its card when find-in-page finds text in it', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('card-expandable button') as HTMLButtonElement;
    const content = element.querySelector(`#${button.getAttribute('aria-controls')}`)!;
    content.dispatchEvent(new Event('beforematch'));
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(content.hasAttribute('hidden')).toBe(false);
    expect(TestBed.inject(Highlighter).highlighted?.tagName).toBe('UI-BASE-CARD');
    TestBed.inject(Highlighter).clear();
  });
});
