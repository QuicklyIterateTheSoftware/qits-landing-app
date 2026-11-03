import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QITS_SIGN_IN, QitsBearerFetch } from '@qits/angular';
import { Markdown } from './markdown';

@Component({
  imports: [Markdown],
  template: `<ui-markdown [text]="text()" [resolveUrl]="resolve" />`,
})
class Host {
  readonly text = signal('');
  readonly resolve = (url: string) => (url.startsWith('/') ? `https://example.test${url}` : url);
}

/** Renders `text` and waits for the parser. */
async function rendered(text: string) {
  return (await renderedFixture(text)).nativeElement as HTMLElement;
}

async function renderedFixture(text: string) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.text.set(text);
  fixture.detectChanges();
  await fixture.whenStable();
  // The parser loads on first use; let the import settle.
  await new Promise((resolve) => setTimeout(resolve, 50));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('Markdown', () => {
  it('renders headings, lists, emphasis, code and tables', async () => {
    const element = await rendered(
      '## Why\n- **one**\n- two\n\n```\ncode\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n',
    );
    expect(element.querySelector('h2')?.textContent).toBe('Why');
    expect([...element.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['one', 'two']);
    expect(element.querySelector('strong')?.textContent).toBe('one');
    expect(element.querySelector('pre code')?.textContent).toContain('code');
    expect(element.querySelectorAll('td')).toHaveLength(2);
  });

  it('rewrites image addresses with resolveUrl', async () => {
    const element = await rendered('![Flow](/epics/e/dossier-assets/a/content)');
    const img = element.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.test/epics/e/dossier-assets/a/content');
    expect(img?.getAttribute('alt')).toBe('Flow');
  });

  it('strips scripts, event handlers and javascript: links', async () => {
    const element = await rendered(
      'Hi <script>alert(1)</script><img src="x" onerror="alert(2)"> [link](javascript:alert(3))',
    );
    expect(element.querySelector('script')).toBeNull();
    expect(element.querySelector('img')?.getAttribute('onerror')).toBeNull();
    // Angular's sanitiser prefixes an unsafe URL, so the browser never runs it.
    expect(element.querySelector('a')?.getAttribute('href')).toMatch(/^unsafe:/);
  });

  it('renders nothing for empty text', async () => {
    const element = await rendered('');
    expect(element.textContent?.trim()).toBe('');
  });

  describe('with the bearer sign-in', () => {
    const fetchObjectUrl = vi.fn(async (url: string) => `blob:${url}`);
    const revoke = vi.fn();
    const original = URL.revokeObjectURL;

    beforeEach(() => {
      fetchObjectUrl.mockClear();
      revoke.mockClear();
      URL.revokeObjectURL = revoke;
      TestBed.configureTestingModule({
        providers: [
          { provide: QitsBearerFetch, useValue: { fetchObjectUrl } },
          {
            provide: QITS_SIGN_IN,
            useValue: { clientId: 'c', platformDomain: 'example.test', idpOrigin: '' },
          },
        ],
      });
    });

    afterEach(() => (URL.revokeObjectURL = original));

    it('fetches a platform image with the bearer, shows its object URL and revokes it at the end', async () => {
      const fixture = await renderedFixture(
        '![Flow](/epics/e/dossier-assets/a/content) ![Again](/epics/e/dossier-assets/a/content)',
      );
      await fixture.whenStable();
      fixture.detectChanges();
      const url = 'https://example.test/epics/e/dossier-assets/a/content';
      expect(fetchObjectUrl.mock.calls).toEqual([[url]]);
      const images = [...(fixture.nativeElement as HTMLElement).querySelectorAll('img')];
      expect(images.map((img) => img.getAttribute('src'))).toEqual([`blob:${url}`, `blob:${url}`]);
      fixture.destroy();
      expect(revoke).toHaveBeenCalledWith(`blob:${url}`);
    });

    it('leaves an image elsewhere as it is', async () => {
      const element = await rendered('![Elsewhere](https://images.example.org/a.png)');
      expect(fetchObjectUrl).not.toHaveBeenCalled();
      expect(element.querySelector('img')?.getAttribute('src')).toBe(
        'https://images.example.org/a.png',
      );
    });
  });
});
