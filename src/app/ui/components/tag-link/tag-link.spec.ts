import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { tagColour } from '$ui/components/tag/tag-colour';
import { uiSpecExits } from '../../../../testing/ui-exits';
import { TagLink, type TagLinkVariant } from './tag-link';

@Component({
  imports: [TagLink],
  template: `
    <ui-tag-link
      label="Workspace"
      [exit]="to.agent"
      [exitParams]="{ slug: 'qits', id: 'qits-111' }"
      [variant]="variant()"
      [shown]="shown()"
      describedBy="preview"
    />
  `,
})
class Host {
  protected readonly to = uiSpecExits();
  readonly variant = signal<TagLinkVariant>('tag');
  readonly shown = signal(true);
}

describe('TagLink', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const host = element.querySelector<HTMLElement>('ui-tag-link')!;
    const link = element.querySelector<HTMLAnchorElement>('a')!;
    return { fixture, host, link };
  }

  it('links its label to the given exit, marked with it, and names its description', () => {
    const { link } = render();
    expect(link.textContent?.trim()).toBe('Workspace');
    expect(link.getAttribute('href')).toBe('/projects/qits/work/detail/qits-111/agent');
    expect(link.dataset['qitsOutcome']).toBe('ui-spec:agent');
    expect(link.getAttribute('aria-describedby')).toBe('preview');
  });

  it('as a tag, is coloured from its label', () => {
    const { host, link } = render();
    expect(host.classList).toContain('inline-block');
    // jsdom normalises the colour, so compare through an element of its own.
    const probe = document.createElement('span');
    probe.style.backgroundColor = tagColour('Workspace');
    expect(link.style.backgroundColor).toBe(probe.style.backgroundColor);
  });

  it('as a corner bubble, rounds only its top-left corner and sits at the right', () => {
    const { fixture, host, link } = render();
    fixture.componentInstance.variant.set('corner');
    fixture.detectChanges();
    expect(host.classList).toContain('ml-auto');
    expect(link.classList).toContain('rounded-tl-md');
    expect(link.style.backgroundColor).toBe('');
  });

  it('hides by class, so the server render hydrates as is', () => {
    const { fixture, host, link } = render();
    fixture.componentInstance.shown.set(false);
    fixture.detectChanges();
    expect(host.classList).toContain('hidden');
    expect(link.isConnected).toBe(true);
  });
});
