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

  it('pins the actions while the document scrolls', async () => {
    // The shell does not scroll an element of its own: the document scrolls. Same check there.
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
});
