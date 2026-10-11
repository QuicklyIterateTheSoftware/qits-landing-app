import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { GateShield } from './gate-shield';

/** Screenshots of the gate shield in each state, small and large. */
@Component({
  imports: [GateShield],
  host: { class: 'flex w-80 flex-col gap-3 p-4' },
  template: `
    @for (size of ['size-4', 'size-8']; track size) {
      <div class="flex items-center gap-4">
        <ui-gate-shield state="passed" label="Quality gates: passed" [size]="size" />
        <ui-gate-shield state="failed" label="Quality gates: CI failed" [size]="size" />
        <ui-gate-shield state="waiting" label="Quality gates: approval waiting" [size]="size" />
        <ui-gate-shield state="pending" label="Quality gates: pending" [size]="size" />
      </div>
    }
  `,
})
class Shields {}

describe('GateShield (screenshots)', () => {
  it('draws passed, failed, waiting and pending, the two needing a person ringed', async () => {
    const fixture = TestBed.createComponent(Shields);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    expect(view.getByRole('img').elements()).toHaveLength(8);
    await expect
      .element(view.getByRole('img', { name: 'Quality gates: CI failed' }).first())
      .toHaveAttribute('data-shield', 'failed');
    await expect.element(view).toMatchScreenshot('states');
  });
});
