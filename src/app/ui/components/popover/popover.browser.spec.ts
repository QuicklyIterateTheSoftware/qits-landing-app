import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { commands, page, userEvent } from 'vitest/browser';
import { Popover } from './popover';

/** Screenshots of the popover: closed, open on hover, open on focus, and lined up at the end. */
@Component({
  imports: [Popover],
  host: { class: 'flex h-48 w-[30rem] items-start justify-between p-4' },
  template: `
    <ui-popover #start>
      <button
        type="button"
        class="rounded-md border border-charcoal-brown-300 px-3 py-1 text-sm"
        [attr.aria-describedby]="start.panelId()"
      >
        Start
      </button>
      <p popover-content class="m-0">Lines up with the left edge of its trigger.</p>
    </ui-popover>
    <ui-popover #end align="end">
      <button
        type="button"
        class="rounded-md border border-charcoal-brown-300 px-3 py-1 text-sm"
        [attr.aria-describedby]="end.panelId()"
      >
        End
      </button>
      <p popover-content class="m-0">Lines up with the right edge, so it stays in the window.</p>
    </ui-popover>
  `,
})
class Example {}

describe('Popover (screenshots)', () => {
  function shown() {
    const fixture = TestBed.createComponent(Example);
    fixture.detectChanges();
    return { fixture, element: page.elementLocator(fixture.nativeElement) };
  }

  it('draws closed', async () => {
    const { element } = shown();
    await expect.element(element.getByText(/left edge/)).not.toBeVisible();
    await expect.element(element).toMatchScreenshot('closed', { kind: 'DATA' });
  });

  it('opens on hover, at either edge', async () => {
    const { element } = shown();
    await userEvent.hover(element.getByRole('button', { name: 'Start' }));
    await expect.element(element.getByText(/left edge/)).toBeVisible();
    await expect.element(element).toMatchScreenshot('hover-start', { kind: 'DATA' });
    await userEvent.hover(element.getByRole('button', { name: 'End' }));
    await expect.element(element.getByText(/left edge/)).not.toBeVisible();
    await expect.element(element.getByText(/right edge/)).toBeVisible();
    await expect.element(element).toMatchScreenshot('hover-end', { kind: 'DATA' });
  });

  it('opens on keyboard focus, and Escape closes it', async () => {
    const { fixture, element } = shown();
    await userEvent.tab();
    await expect.element(element.getByRole('button', { name: 'Start' })).toHaveFocus();
    await expect
      .element(element.getByRole('button', { name: 'Start' }))
      .toHaveAccessibleDescription('Lines up with the left edge of its trigger.');
    await expect.element(element.getByText(/left edge/)).toBeVisible();
    await expect.element(element).toMatchScreenshot('focus', { kind: 'DATA' });
    await userEvent.keyboard('{Escape}');
    fixture.detectChanges();
    await expect.element(element.getByText(/left edge/)).not.toBeVisible();
  });
});

/** A popover over a link that previews where it leads, as a work reference (`tapToOpen`). */
@Component({
  imports: [Popover],
  host: { class: 'block h-48 w-[30rem] p-4' },
  template: `
    <ui-popover #preview tapToOpen>
      <a id="trigger" href="#followed" [attr.aria-describedby]="preview.panelId()">qits-622</a>
      <p popover-content class="m-0">
        <a id="inside" href="#inside">Open qits-622</a>
      </p>
    </ui-popover>
    <p id="outside" class="m-0 mt-24 text-sm">Somewhere else</p>
  `,
})
class TapExample {}

describe('Popover with tapToOpen (browser)', () => {
  const tap = async (element: Element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    await commands.touch('down', x, y);
    await commands.touch('up', x, y);
  };

  beforeEach(() => history.replaceState(null, '', location.pathname + location.search));
  afterEach(async () => {
    await commands.touch('cancel', 0, 0);
    await commands.parkPointer();
    history.replaceState(null, '', location.pathname + location.search);
  });

  it('opens on a tap without following the link, closes on a second tap or a tap outside', async () => {
    const fixture = TestBed.createComponent(TapExample);
    fixture.detectChanges();
    const element = page.elementLocator(fixture.nativeElement);
    const panel = element.getByText('Open qits-622');
    const trigger = document.querySelector('#trigger')!;

    await tap(trigger);
    await expect.element(panel).toBeVisible();
    expect(location.hash).toBe('');
    await tap(trigger);
    await expect.element(panel).not.toBeVisible();
    expect(location.hash).toBe('');

    await tap(trigger);
    await expect.element(panel).toBeVisible();
    await tap(document.querySelector('#outside')!);
    await expect.element(panel).not.toBeVisible();
    expect(location.hash).toBe('');
  });

  it('follows the link inside the panel', async () => {
    const fixture = TestBed.createComponent(TapExample);
    fixture.detectChanges();
    const element = page.elementLocator(fixture.nativeElement);
    await tap(document.querySelector('#trigger')!);
    await expect.element(element.getByText('Open qits-622')).toBeVisible();
    await tap(document.querySelector('#inside')!);
    await expect.poll(() => location.hash).toBe('#inside');
    await expect.element(element.getByText('Open qits-622')).not.toBeVisible();
  });

  it('opens on hover with a mouse, and a click follows the link', async () => {
    const fixture = TestBed.createComponent(TapExample);
    fixture.detectChanges();
    const element = page.elementLocator(fixture.nativeElement);
    await userEvent.hover(element.getByText('qits-622', { exact: true }));
    await expect.element(element.getByText('Open qits-622')).toBeVisible();
    await element.getByText('qits-622', { exact: true }).click();
    await expect.poll(() => location.hash).toBe('#followed');
  });
});
