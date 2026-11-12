import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page, userEvent } from 'vitest/browser';
import { Popover } from '$ui/components/popover/popover';

/**
 * Guards the per-test teardown the Angular unit-test builder registers in every spec file
 * (`destroyAfterEach`, on by default): it destroys each test's fixtures and removes their
 * `[id^=root]` elements from `<body>` once the test ends. All the browser specs share one page, so
 * if that teardown stopped, an earlier test's open floating panel (`uiFloating`) would stay in the
 * page: it is `position: fixed`, drawn over everything, but is still a child of its fixture and
 * goes when its fixture goes. Left open, it would sit over the next test's fixture and break the
 * `elementFromPoint` checks other specs make (`expectUnclipped`) — qits-2092.
 */
@Component({
  imports: [Popover],
  template: `
    <div class="h-40 overflow-y-auto p-4">
      <ui-popover #popover>
        <button type="button" class="px-2 text-sm" [attr.aria-describedby]="popover.panelId()">
          Explain
        </button>
        <p popover-content class="m-0">What the trigger does.</p>
      </ui-popover>
    </div>
  `,
})
class Scrolling {}

describe('Floating panels between tests (browser)', () => {
  it('floats over its fixture while the test runs', async () => {
    const fixture = TestBed.createComponent(Scrolling);
    fixture.detectChanges();
    await userEvent.hover(page.getByRole('button', { name: 'Explain' }));
    await expect.element(page.getByRole('tooltip')).toBeVisible();
    await expect
      .poll(() => document.querySelector<HTMLElement>('[data-popover-panel]')!.style.position)
      .toBe('fixed');
  });

  it('is gone from the page before this test creates anything', () => {
    expect(document.body.children.length, 'no leftover fixture on the body').toBe(0);
    expect(document.querySelector('[data-floating-side]'), 'no leftover floating side').toBeNull();
    expect(document.querySelector('[data-popover-panel]'), 'no leftover popover panel').toBeNull();
  });
});
