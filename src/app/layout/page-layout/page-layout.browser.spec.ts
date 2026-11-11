import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { Action, ActionGroup } from '$ui/components/action-button/action';
import { PageLayoutComponent } from './page-layout';

const noop = () => undefined;

const ACTIONS: readonly (Action | ActionGroup)[] = [
  { label: 'Archive', variant: 'muted', callback: noop },
  {
    title: 'Release',
    actions: [
      { label: 'Approve', variant: 'success', callback: noop },
      { label: 'Hold', variant: 'muted', callback: noop },
      { label: 'Reject', variant: 'danger', callback: noop },
    ],
  },
];

/** Paragraphs enough to scroll: a page's long content. */
const ROWS = Array.from({ length: 24 }, (_, i) => `Row ${i + 1} of the page's long content.`);

@Component({
  imports: [PageLayoutComponent],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <app-page-layout title="Work" [actions]="actions">
      <p class="m-0 rounded-md bg-ocean-deep-100 p-4">The page's content.</p>
    </app-page-layout>
  `,
})
class WithInputs {
  readonly actions = ACTIONS;
}

@Component({
  imports: [PageLayoutComponent],
  host: { class: 'block w-[48rem] p-4' },
  template: `
    <app-page-layout title="Ignored" [actions]="actions">
      <div slot="header">
        <h1 class="m-0 text-2xl font-bold">qits</h1>
        <p class="m-0 text-sm text-charcoal-brown-600">A custom header with a subtitle</p>
      </div>
      <a slot="actions" class="text-sm text-charcoal-brown-600" href="/archive">Archive</a>
      <p class="m-0 rounded-md bg-ocean-deep-100 p-4">The page's content.</p>
    </app-page-layout>
  `,
})
class WithSlots {
  readonly actions = ACTIONS;
}

/** The page in a 20rem tall scroller, as the shell's document scrolls a long page. */
@Component({
  imports: [PageLayoutComponent],
  host: { class: 'block h-80 w-[48rem] overflow-y-auto px-4' },
  template: `
    <app-page-layout title="A long page" [actions]="actions">
      @for (row of rows; track row) {
        <p class="m-0 border-b border-charcoal-brown-200 py-3">{{ row }}</p>
      }
    </app-page-layout>
  `,
})
class Scrolled {
  readonly actions = ACTIONS;
  readonly rows = ROWS;
}

/**
 * The long page in its scroller under a 2.5rem pinned bar, as the shell's top bar where the document
 * scrolls (`--app-pin-top`, below 768px).
 */
@Component({
  imports: [PageLayoutComponent],
  host: {
    class: 'block h-80 w-[48rem] overflow-y-auto px-4',
    style: '--app-pin-top: 2.5rem',
  },
  template: `
    <div class="sticky top-0 z-50 -mx-4 h-10 bg-charcoal-brown-800"></div>
    <app-page-layout title="A long page" [actions]="actions">
      @for (row of rows; track row) {
        <p class="m-0 border-b border-charcoal-brown-200 py-3">{{ row }}</p>
      }
    </app-page-layout>
  `,
})
class ScrolledUnderBar {
  readonly actions = ACTIONS;
  readonly rows = ROWS;
}

/**
 * The long page as the shell draws it from 768px up: a 2.5rem bar outside the scroller, and the
 * page in a 20rem `<main>` that scrolls on its own, which sets `--app-pin-top` back to 0 over the
 * shell's bar height.
 */
@Component({
  imports: [PageLayoutComponent],
  host: {
    class: 'block w-[48rem]',
    style: '--app-header-h: 2.5rem; --app-pin-top: var(--app-header-h)',
  },
  template: `
    <div class="h-10 bg-charcoal-brown-800"></div>
    <main class="block h-80 overflow-y-auto px-4" style="--app-pin-top: 0px">
      <app-page-layout title="A long page" [actions]="actions">
        @for (row of rows; track row) {
          <p class="m-0 border-b border-charcoal-brown-200 py-3">{{ row }}</p>
        }
      </app-page-layout>
    </main>
  `,
})
class ScrolledInMain {
  readonly actions = ACTIONS;
  readonly rows = ROWS;
}

@Component({
  imports: [PageLayoutComponent],
  host: { class: 'block w-[22rem] p-4' },
  template: `
    <app-page-layout title="Repositories of the project" [actions]="actions">
      <p class="m-0 rounded-md bg-ocean-deep-100 p-4">The page's content.</p>
    </app-page-layout>
  `,
})
class Narrow {
  readonly actions = ACTIONS;
}

@Component({
  imports: [PageLayoutComponent],
  host: { class: 'block w-[34rem] p-4' },
  template: `
    <app-page-layout title="Repositories of the project" [actions]="actions">
      <p class="m-0 rounded-md bg-ocean-deep-100 p-4">The page's content.</p>
    </app-page-layout>
  `,
})
class Wrapping {
  readonly actions = ACTIONS;
}

/** qits-1913: one group whose four buttons are wider than a phone-sized bar. */
const WIDE_GROUP_ACTIONS: readonly (Action | ActionGroup)[] = [
  {
    title: 'Status',
    actions: [
      { label: 'Mark verified', variant: 'success', callback: noop },
      { label: 'Back to implemented', variant: 'muted', callback: noop },
      { label: 'Drop', variant: 'danger', callback: noop },
      { label: 'Block', variant: 'danger', callback: noop },
    ],
  },
];

@Component({
  imports: [PageLayoutComponent],
  host: { class: 'block w-full p-4' },
  template: `
    <app-page-layout title="qits-1913" [actions]="actions">
      <p class="m-0 rounded-md bg-ocean-deep-100 p-4">The page's content.</p>
    </app-page-layout>
  `,
})
class WideGroup {
  readonly actions = WIDE_GROUP_ACTIONS;
}

function shown<T>(type: new () => T) {
  const fixture = TestBed.createComponent(type);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('PageLayoutComponent (screenshots)', () => {
  afterEach(() => window.scrollTo(0, 0));

  it('draws a title, a single action and a group on one row', async () => {
    const { element } = shown(WithInputs);
    const locator = page.elementLocator(element);
    await expect.element(locator.getByRole('group', { name: 'Release' })).toBeVisible();
    await expect.element(locator).toMatchScreenshot('inputs');
  });

  it('draws a projected header and projected actions', async () => {
    const { element } = shown(WithSlots);
    await expect.element(page.elementLocator(element)).toMatchScreenshot('slots');
  });

  it('keeps the actions pinned while the content scrolls under them', async () => {
    const { element } = shown(Scrolled);
    element.scrollTop = 400;
    const actions = element.querySelector<HTMLElement>('[data-page-actions]')!;
    // Pinned to the scroller's top edge, though the header has scrolled away.
    expect(Math.round(actions.getBoundingClientRect().top)).toBe(
      Math.round(element.getBoundingClientRect().top),
    );
    expect(element.querySelector('h1')!.getBoundingClientRect().bottom).toBeLessThan(
      element.getBoundingClientRect().top,
    );
    await expect.element(page.elementLocator(element)).toMatchScreenshot('pinned');
  });

  it('pins the actions below the top bar, and tells their height to the content', async () => {
    const { fixture, element } = shown(ScrolledUnderBar);
    await fixture.whenStable();
    element.scrollTop = 400;
    const actions = element.querySelector<HTMLElement>('[data-page-actions]')!;
    // 2.5rem below the scroller's top edge: under the bar, not behind it.
    expect(Math.round(actions.getBoundingClientRect().top)).toBe(
      Math.round(element.getBoundingClientRect().top) + 40,
    );
    // The measured height, for what pins below the actions (the board's headings).
    await expect
      .poll(() =>
        element
          .querySelector<HTMLElement>('app-page-layout')!
          .style.getPropertyValue('--page-actions-h'),
      )
      .toBe(`${actions.offsetHeight}px`);
    expect(actions.offsetHeight).toBeGreaterThan(0);
    await expect.element(page.elementLocator(element)).toMatchScreenshot('pinned-under-bar');
  });

  it('pins the actions at the top of a scrolling main, not the bar’s height below it', async () => {
    const { fixture, element } = shown(ScrolledInMain);
    await fixture.whenStable();
    const main = element.querySelector('main')!;
    main.scrollTop = 400;
    const actions = element.querySelector<HTMLElement>('[data-page-actions]')!;
    // The bar is outside the scroller, so the actions pin at its top edge, not 2.5rem below it.
    expect(Math.round(actions.getBoundingClientRect().top)).toBe(
      Math.round(main.getBoundingClientRect().top),
    );
    expect(element.querySelector('h1')!.getBoundingClientRect().bottom).toBeLessThan(
      main.getBoundingClientRect().top,
    );
    // The scroller scrolled, not the document.
    expect(document.scrollingElement!.scrollTop).toBe(0);
  });

  it('pins the actions while the document scrolls', async () => {
    // Below 768px the shell lets the document scroll, not an element of its own. Same check there.
    await page.viewport(800, 300);
    try {
      const { element } = shown(Scrolled);
      element.classList.remove('h-80', 'overflow-y-auto');
      window.scrollTo(0, 500);
      const actions = element.querySelector<HTMLElement>('[data-page-actions]')!;
      expect(Math.round(actions.getBoundingClientRect().top)).toBe(0);
    } finally {
      await page.viewport(800, 600);
    }
  });

  it('wraps a long title beside the actions before it moves', async () => {
    const { element } = shown(Wrapping);
    const title = element.querySelector('h1')!.getBoundingClientRect();
    const actions = element.querySelector('[data-page-actions]')!.getBoundingClientRect();
    // Beside the actions, on more than one line.
    expect(title.right).toBeLessThanOrEqual(actions.left + 1);
    expect(title.top).toBeLessThan(actions.bottom);
    expect(title.height).toBeGreaterThan(40);
    await expect.element(page.elementLocator(element)).toMatchScreenshot('wrapping');
  });

  it('puts the actions on the first line and the title below them when no room is left', async () => {
    const { element } = shown(Narrow);
    const title = element.querySelector('h1')!.getBoundingClientRect();
    const actions = element.querySelector('[data-page-actions]')!.getBoundingClientRect();
    expect(title.top).toBeGreaterThanOrEqual(actions.bottom - 1);
    await expect.element(page.elementLocator(element)).toMatchScreenshot('narrow');
  });

  it('keeps a group wider than the bar on one row at desktop width', () => {
    const { element } = shown(WideGroup);
    const buttons = [...element.querySelectorAll('ui-action-button button')].map((b) =>
      b.getBoundingClientRect(),
    );
    expect(buttons).toHaveLength(4);
    const tops = buttons.map((b) => Math.round(b.top));
    expect(new Set(tops).size).toBe(1);
  });

  it('wraps a group wider than the bar inside the bar on a phone-sized viewport', async () => {
    await page.viewport(390, 844);
    try {
      const { element } = shown(WideGroup);
      const buttons = [...element.querySelectorAll('ui-action-button')];
      expect(buttons).toHaveLength(4);
      for (const button of buttons) {
        const rect = button.getBoundingClientRect();
        expect(rect.left).toBeGreaterThanOrEqual(0);
        expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
      }
      await expect.element(page.elementLocator(element)).toMatchScreenshot('phone-wide-group');
    } finally {
      await page.viewport(800, 600);
    }
  });
});
