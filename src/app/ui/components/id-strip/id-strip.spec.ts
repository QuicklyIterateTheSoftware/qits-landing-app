import { TestBed } from '@angular/core/testing';
import { IdStrip } from './id-strip';

describe('IdStrip', () => {
  it('writes the id vertically in the heading colours', () => {
    const fixture = TestBed.createComponent(IdStrip);
    fixture.componentRef.setInput('id', 'qits-112');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent?.trim()).toBe('qits-112');
    expect(element.classList).toContain('bg-charcoal-brown-100');
    expect(element.querySelector('span')?.className).toContain('[writing-mode:vertical-rl]');
  });
});
