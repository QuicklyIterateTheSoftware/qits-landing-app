import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';

/** Turns Markdown into HTML; `resolveUrl` rewrites each image's address first. */
type Render = (text: string, resolveUrl: (url: string) => string) => string;

/**
 * The Markdown parser (`marked`, GitHub-flavoured: tables, fenced code), loaded on first use and
 * shared: it stays out of the initial bundle.
 */
let parser: Promise<Render> | undefined;
function loadParser(): Promise<Render> {
  parser ??= import('marked').then(({ Marked }) => (text, resolveUrl) => {
    const marked = new Marked({
      gfm: true,
      async: false,
      walkTokens: (token) => {
        if (token.type === 'image') token.href = resolveUrl(token.href);
      },
    });
    return marked.parse(text) as string;
  });
  return parser;
}

/** The parser once it is loaded; undefined before. Every instance reads the same signal. */
const loaded = signal<Render | undefined>(undefined);

/**
 * Markdown text, rendered: headings, lists, emphasis, code, tables, links and images.
 *
 * - Safe: the HTML goes through Angular's `[innerHTML]` binding, which sanitises it (no scripts,
 *   no event handlers, no `javascript:` links), whatever the text holds.
 * - The parser loads on first use (`import('marked')`); until it is in, the text shows as it is,
 *   with its line breaks. The server never waits for it, so the server render and the first
 *   browser render match.
 * - `resolveUrl` rewrites an image's address before it renders (an epic's dossier names its
 *   figures by an address relative to its service).
 *
 * Styling is Tailwind on the container (`[&_h2]:…`); the parts follow the app's text sizes.
 */
@Component({
  selector: 'ui-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <p
      class="m-0 text-sm whitespace-pre-line text-charcoal-brown-800"
      [class.hidden]="!!html() || !text()"
    >
      {{ text() }}
    </p>
    <div
      class="text-sm leading-relaxed text-charcoal-brown-800 [&_a]:text-ocean-deep-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-charcoal-brown-200 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-charcoal-brown-50 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.8125rem] [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded [&_img]:border [&_img]:border-charcoal-brown-200 [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-charcoal-brown-50 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-2 [&_table]:border-collapse [&_td]:border [&_td]:border-charcoal-brown-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-charcoal-brown-200 [&_th]:bg-charcoal-brown-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&>:first-child]:mt-0 [&>:last-child]:mb-0"
      [class.hidden]="!html()"
      [innerHTML]="html()"
    ></div>
  `,
})
export class Markdown {
  /** The Markdown text. Empty renders nothing. */
  readonly text = input('');
  /** Rewrites an image's address (default: as written). */
  readonly resolveUrl = input<(url: string) => string>((url) => url);

  /** The rendered HTML, once the parser is in; empty before, and for empty text. */
  protected readonly html = computed(() => {
    const render = loaded();
    const text = this.text();
    return render && text ? render(text, this.resolveUrl()) : '';
  });

  constructor() {
    // The first text to render loads the parser.
    effect(() => {
      if (this.text() && !untracked(loaded)) void loadParser().then((r) => loaded.set(r));
    });
  }
}
