import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { AutomationCog } from './automation-cog';

/** Screenshots of the automation cog in each state, small and large. */
@Component({
  imports: [AutomationCog],
  host: { class: 'flex w-80 flex-col gap-3 p-4' },
  template: `
    @for (size of ['size-4', 'size-8']; track size) {
      <div class="flex items-center gap-4">
        <ui-automation-cog state="passed" label="Automations: all fresh" [size]="size" />
        <ui-automation-cog state="running" label="Automations: running" count="2/3" [size]="size" />
        <ui-automation-cog state="failed" label="Automations: one failed" [size]="size" />
        <ui-automation-cog state="pending" label="Automations: not started" [size]="size" />
      </div>
    }
  `,
})
class Cogs {}

describe('AutomationCog (screenshots)', () => {
  it('draws passed, running with its count, failed (ringed) and pending', async () => {
    const fixture = TestBed.createComponent(Cogs);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    expect(view.getByRole('img').elements()).toHaveLength(8);
    await expect.element(view).toMatchTextContent('2/3');
    await expect.element(view).toMatchScreenshot('states');
  });
});
