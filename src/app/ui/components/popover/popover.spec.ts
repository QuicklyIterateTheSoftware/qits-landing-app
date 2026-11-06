import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Popover, PopoverAlign } from './popover';

/** A popover whose trigger is a link inside a clickable row, as a work reference sits in a list. */
@Component({
  imports: [Popover],
  template: `
    <div id="row" (click)="rowClicks = rowClicks + 1">
      <ui-popover #popover panelId="preview" tapToOpen>
        <a id="trigger" href="#item" (click)="triggerClicks = triggerClicks + 1">qits-1</a>
        <p popover-content>
          <a id="inside" href="#item-page">Open qits-1</a>
          <span id="text">Its title</span>
        </p>
      </ui-popover>
    </div>
    <button id="outside" type="button">Elsewhere</button>
  `,
})
class TapHost {
  rowClicks = 0;
  triggerClicks = 0;
}

@Component({
  imports: [Popover],
  template: `
    <ui-popover #popover panelId="explained" [align]="align()">
      <button type="button" [attr.aria-describedby]="popover.panelId()">Go</button>
      <p popover-content>What going does</p>
    </ui-popover>
  `,
})
class Host {
  readonly align = signal<PopoverAlign>('start');
}

describe('Popover', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const host = element.querySelector<HTMLElement>('ui-popover')!;
    const button = element.querySelector<HTMLButtonElement>('button')!;
    const wrapper = element.querySelector<HTMLElement>('[data-popover-panel]')!;
    const panel = element.querySelector<HTMLElement>('#explained')!;
    return { fixture, host, button, wrapper, panel };
  }

  it('projects the trigger and the content, and names the panel as a tooltip', () => {
    const { button, panel } = render();
    expect(button.textContent?.trim()).toBe('Go');
    expect(panel.getAttribute('role')).toBe('tooltip');
    expect(panel.textContent?.trim()).toBe('What going does');
    expect(button.getAttribute('aria-describedby')).toBe('explained');
  });

  it('is hidden until the host is hovered or holds the focus', () => {
    const { wrapper } = render();
    expect(wrapper.classList).toContain('hidden');
    expect(wrapper.classList).toContain('group-hover/popover:block');
    expect(wrapper.classList).toContain('group-focus-within/popover:block');
  });

  it('lines up with the start edge, or the end edge', () => {
    const { fixture, wrapper } = render();
    expect(wrapper.classList).toContain('left-0');
    fixture.componentInstance.align.set('end');
    fixture.detectChanges();
    expect(wrapper.classList).toContain('right-0');
    expect(wrapper.classList).not.toContain('left-0');
  });

  it('closes on Escape until the pointer or the focus comes back', () => {
    const { fixture, host, wrapper } = render();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(wrapper.classList).toContain('hidden');
    expect(wrapper.classList).not.toContain('group-hover/popover:block');

    host.dispatchEvent(new Event('pointerenter'));
    fixture.detectChanges();
    expect(wrapper.classList).toContain('group-hover/popover:block');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    host.dispatchEvent(new FocusEvent('focusin'));
    fixture.detectChanges();
    expect(wrapper.classList).toContain('group-focus-within/popover:block');
  });

  it('gives every panel its own id', () => {
    const a = TestBed.createComponent(Popover);
    const b = TestBed.createComponent(Popover);
    expect(a.componentInstance.panelId()).not.toBe(b.componentInstance.panelId());
  });
});

describe('Popover with tapToOpen', () => {
  function render() {
    const fixture = TestBed.createComponent(TapHost);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    document.body.appendChild(element);
    const popover = fixture.debugElement.children[0].children[0].componentInstance as Popover;
    const byId = (id: string) => element.querySelector<HTMLElement>(`#${id}`)!;
    const wrapper = element.querySelector<HTMLElement>('[data-popover-panel]')!;
    return { fixture, element, popover, byId, wrapper };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  /** A press of `pointerType` on `target`, then its click, as a browser sends them. */
  function press(target: HTMLElement, pointerType: string): MouseEvent {
    target.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType }),
    );
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    target.dispatchEvent(click);
    return click;
  }

  it('opens on a tap without following the trigger link or the row around it', () => {
    const { fixture, popover, byId, wrapper } = render();
    const click = press(byId('trigger'), 'touch');
    fixture.detectChanges();
    expect(click.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.triggerClicks).toBe(0);
    expect(fixture.componentInstance.rowClicks).toBe(0);
    expect(popover.openedByTap()).toBe(true);
    expect(wrapper.classList).toContain('block');
    expect(wrapper.classList).not.toContain('hidden');
  });

  it('opens on a pen the same way', () => {
    const { fixture, popover, byId } = render();
    expect(press(byId('trigger'), 'pen').defaultPrevented).toBe(true);
    fixture.detectChanges();
    expect(popover.openedByTap()).toBe(true);
  });

  it('closes on a second tap on the trigger, which follows nothing either', () => {
    const { fixture, popover, byId, wrapper } = render();
    press(byId('trigger'), 'touch');
    fixture.detectChanges();
    const second = press(byId('trigger'), 'touch');
    fixture.detectChanges();
    expect(second.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.triggerClicks).toBe(0);
    expect(popover.openedByTap()).toBe(false);
    expect(wrapper.classList).toContain('hidden');
    // After a tap, a leftover touch-screen hover does not reopen it either.
    expect(wrapper.classList).not.toContain('group-hover/popover:block');
  });

  it('closes on a press anywhere outside it', () => {
    const { fixture, popover, byId, wrapper } = render();
    press(byId('trigger'), 'touch');
    fixture.detectChanges();
    byId('outside').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }),
    );
    fixture.detectChanges();
    expect(popover.openedByTap()).toBe(false);
    expect(wrapper.classList).toContain('hidden');
  });

  it('stays open on a press inside its panel, whose link navigates and closes it', () => {
    const { fixture, popover, byId } = render();
    press(byId('trigger'), 'touch');
    fixture.detectChanges();

    const onText = press(byId('text'), 'touch');
    fixture.detectChanges();
    expect(popover.openedByTap()).toBe(true);
    expect(onText.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.rowClicks).toBe(0);

    const onLink = press(byId('inside'), 'touch');
    fixture.detectChanges();
    expect(onLink.defaultPrevented).toBe(false);
    expect(fixture.componentInstance.rowClicks).toBe(0);
    expect(popover.openedByTap()).toBe(false);
  });

  it('closes on Escape', () => {
    const { fixture, popover, byId, wrapper } = render();
    press(byId('trigger'), 'touch');
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(popover.openedByTap()).toBe(false);
    expect(wrapper.classList).toContain('hidden');
  });

  it('leaves a mouse click to the trigger link, and opens on hover as before', () => {
    const { fixture, popover, byId, wrapper } = render();
    const click = press(byId('trigger'), 'mouse');
    fixture.detectChanges();
    expect(click.defaultPrevented).toBe(false);
    expect(fixture.componentInstance.triggerClicks).toBe(1);
    expect(fixture.componentInstance.rowClicks).toBe(1);
    expect(popover.openedByTap()).toBe(false);
    expect(wrapper.classList).toContain('group-hover/popover:block');
  });

  it('takes a click without a press (the keyboard) as the device says', () => {
    const { fixture, popover, byId } = render();
    const keyboardClick = () => {
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      byId('trigger').dispatchEvent(click);
      fixture.detectChanges();
      return click;
    };
    // A fine-pointer device (jsdom has no matchMedia: none): the link is followed.
    expect(keyboardClick().defaultPrevented).toBe(false);
    expect(fixture.componentInstance.triggerClicks).toBe(1);

    // A coarse-pointer device: the click opens the preview, like a tap.
    const coarse = vi.fn(() => ({ matches: true }) as MediaQueryList);
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: coarse });
    try {
      expect(keyboardClick().defaultPrevented).toBe(true);
      expect(coarse).toHaveBeenCalledWith('(pointer: coarse)');
      expect(popover.openedByTap()).toBe(true);
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });
});

describe('Popover without tapToOpen', () => {
  it('leaves a tap to the trigger', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(clicked).toHaveBeenCalledOnce();
  });
});
