import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { COPIED_MS, CopyText } from './copy-text';

const settle = () => new Promise((resolve) => setTimeout(resolve));

@Component({
  imports: [CopyText],
  template: `<app-copy-text text="docker run --rm -it claude" label="Copy login" />`,
})
class Host {}

describe('CopyText', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  });

  afterEach(() => {
    delete (navigator as { clipboard?: unknown }).clipboard;
    vi.useRealTimers();
  });

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, button: () => element.querySelector('button')! };
  }

  it('shows the text, and copies it, saying so for two seconds', async () => {
    const { fixture, element, button } = render();
    expect(element.querySelector('code')?.textContent).toBe('docker run --rm -it claude');
    expect(button().textContent?.trim()).toBe('Copy login');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    button().click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith('docker run --rm -it claude');
    expect(button().textContent?.trim()).toBe('Copied');
    vi.advanceTimersByTime(COPIED_MS);
    fixture.detectChanges();
    expect(button().textContent?.trim()).toBe('Copy login');
  });

  it('does nothing when the clipboard refuses: the text is there to select', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const { fixture, button } = render();
    button().click();
    await settle();
    fixture.detectChanges();
    expect(button().textContent?.trim()).toBe('Copy login');
  });

  it('does nothing without a clipboard', async () => {
    delete (navigator as { clipboard?: unknown }).clipboard;
    const { fixture, button } = render();
    button().click();
    await settle();
    fixture.detectChanges();
    expect(button().textContent?.trim()).toBe('Copy login');
  });
});
