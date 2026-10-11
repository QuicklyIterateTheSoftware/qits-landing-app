import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Chip, chipClass } from './chip';

@Component({
  imports: [Chip],
  template: `<ui-chip label="ready" tone="ok" /><ui-chip label="other" />`,
})
class Host {}

describe('Chip', () => {
  it('shows its label in its tone’s colours, neutral by default', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const [ok, neutral] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('ui-chip'),
    );
    expect(ok.textContent).toBe('ready');
    expect(ok.classList).toContain('bg-mint-leaf-100');
    expect(neutral.classList).toContain('bg-charcoal-brown-100');
  });

  it('gives each tone its own colours', () => {
    const tones = ['ok', 'waiting', 'failed', 'neutral'] as const;
    expect(new Set(tones.map(chipClass)).size).toBe(4);
  });
});
