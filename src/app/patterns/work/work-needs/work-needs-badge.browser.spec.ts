import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { commands, page, userEvent } from 'vitest/browser';
import type { NeedView } from '$core/work/work-needs';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { WorkNeedsBadge } from './work-needs-badge';

/**
 * Screenshots of the "needs" badge (epic qits-1899), on qits-projects' "a ticket that needs
 * another" (recorded from 2026.1106.140436 on): its READY_FOR_DEV ticket needs another ticket at
 * VERIFIED, now REFINED, not met. The badge is `display: contents`, so a host gives it a box.
 */
@Component({
  imports: [WorkNeedsBadge],
  host: { class: 'flex w-[24rem] items-start gap-1 p-4 pb-16' },
  template: `<app-work-needs [needs]="needs()" [unmet]="unmet()" />`,
})
class Host {
  readonly needs = input<readonly NeedView[]>([]);
  readonly unmet = input<number | undefined>(undefined);
}

const NEEDS = 'a ticket that needs another';

describe('WorkNeedsBadge (screenshots)', () => {
  async function render() {
    const work = await goldenMaster(NEEDS, 'listProjectWork');
    const ticket = work.entities.find(
      (e: { title: string }) => e.title === 'Render work ids in the list',
    );
    const fixture = TestBed.createComponent(Host);
    fixture.componentRef.setInput('needs', ticket.needs);
    fixture.componentRef.setInput('unmet', ticket.unmetNeeds);
    fixture.detectChanges();
    await fixture.whenStable();
    return page.elementLocator(fixture.nativeElement as HTMLElement);
  }

  it('one need not met', async () => {
    const host = await render();
    await expect.element(host.getByText('needs 1')).toBeVisible();
    await commands.parkPointer();
    await expect.element(host).toMatchScreenshot('badge', { kind: 'DATA' });
  });

  it('its tooltip, on hover', async () => {
    const host = await render();
    await userEvent.hover(host.getByText('needs 1'));
    const tooltip = host.getByRole('tooltip');
    await expect.element(tooltip).toBeVisible();
    await expect
      .element(tooltip)
      .toMatchTextContent('contract-00000001-1 at VERIFIED (now REFINED)');
    await expect.element(host).toMatchScreenshot('badge-tooltip', { kind: 'DATA' });
  });
});
