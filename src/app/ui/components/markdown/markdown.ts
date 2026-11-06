import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformUrl, QITS_SIGN_IN, QitsBearerFetch } from '@qits/angular';
import { QitsWorkRefs } from '@qits/ui-components';

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
 * - Nothing a body holds may make it wider than its column: inline code wraps anywhere, and a
 *   code block or a table scrolls inside its own box instead of pushing the page sideways.
 * - An image on a platform host (`isPlatformUrl`: a dossier figure, whose route is role-guarded) is
 *   fetched with the bearer (`QitsBearerFetch`, epic qits-543), since an `<img>` cannot send a
 *   header, and shown from an object URL; it has no `src` until its bytes are in. Each object URL
 *   is revoked when the component goes. Without the bearer sign-in, and on the server, an image
 *   keeps its address.
 *
 * - `workProject` (a project's slug) draws every work id of that project in the rendered text as a
 *   work reference with its brief (`QitsWorkRefs`, `@qits/ui-components`, qits-1898), an id in a
 *   code span included, a link's text not. Unset, the HTML is left exactly as rendered. The raw
 *   text shown before the parser is in stays plain.
 *
 * Styling is Tailwind on the container (`[&_h2]:…`); the parts follow the app's text sizes.
 */
@Component({
  selector: 'ui-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsWorkRefs],
  host: { class: 'block min-w-0' },
  template: `
    <p
      class="m-0 text-sm whitespace-pre-line wrap-anywhere text-charcoal-brown-800"
      [class.hidden]="!!html() || !text()"
    >
      {{ text() }}
    </p>
    <div
      class="text-sm leading-relaxed text-charcoal-brown-800 [&_a]:text-ocean-deep-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-charcoal-brown-200 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-charcoal-brown-50 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.8125rem] [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded [&_img]:border [&_img]:border-charcoal-brown-200 [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-charcoal-brown-50 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:border-charcoal-brown-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-charcoal-brown-200 [&_th]:bg-charcoal-brown-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_:not(pre)>code]:wrap-anywhere [&>:first-child]:mt-0 [&>:last-child]:mb-0"
      [class.hidden]="!html()"
      [innerHTML]="html()"
      [qitsWorkRefs]="workProject()"
      [qitsWorkRefsHtml]="html()"
    ></div>
  `,
})
export class Markdown {
  /** The Markdown text. Empty renders nothing. */
  readonly text = input('');
  /** Rewrites an image's address (default: as written). */
  readonly resolveUrl = input<(url: string) => string>((url) => url);
  /** The slug of the project whose work ids the text names, drawn as references; none leaves them text. */
  readonly workProject = input<string | undefined>(undefined);

  private readonly bearer = inject(QitsBearerFetch, { optional: true });
  private readonly signIn = inject(QITS_SIGN_IN, { optional: true });
  private readonly page = inject(DOCUMENT).location;
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Each image fetched with the bearer: its object URL by its address, once its bytes are in. */
  private readonly objectUrls = signal<ReadonlyMap<string, string>>(new Map());
  /** The addresses already asked for, so each is fetched once. */
  private readonly asked = new Set<string>();
  private destroyed = false;

  /** The rendered HTML, once the parser is in; empty before, and for empty text. */
  private readonly rendered = computed(() => {
    const render = loaded();
    const text = this.text();
    const wanted: string[] = [];
    if (!render || !text) return { html: '', wanted };
    const resolve = this.resolveUrl();
    const objectUrls = this.objectUrls();
    const html = render(text, (url) => {
      const resolved = resolve(url);
      if (!this.withBearer(resolved)) return resolved;
      wanted.push(resolved);
      return objectUrls.get(resolved) ?? '';
    });
    return { html, wanted };
  });

  protected readonly html = computed(() => this.rendered().html);

  constructor() {
    // The first text to render loads the parser.
    effect(() => {
      if (this.text() && !untracked(loaded)) void loadParser().then((r) => loaded.set(r));
    });
    // Each platform image the text names is fetched with the bearer, once.
    effect(() => {
      for (const url of this.rendered().wanted) this.fetch(url);
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      for (const objectUrl of this.objectUrls().values()) URL.revokeObjectURL(objectUrl);
    });
  }

  /** True for an image to fetch with the bearer: on a platform host, in the browser. */
  private withBearer(url: string): boolean {
    if (!this.browser || !this.bearer || !this.signIn) return false;
    return isPlatformUrl(url, this.page.href, this.signIn.platformDomain);
  }

  private fetch(url: string): void {
    if (this.asked.has(url) || !this.bearer) return;
    this.asked.add(url);
    this.bearer.fetchObjectUrl(url).then(
      (objectUrl) => {
        if (this.destroyed) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        this.objectUrls.update((urls) => new Map(urls).set(url, objectUrl));
      },
      // The image stays without a `src`, showing its alt text; nothing retries it.
      (error: unknown) => console.warn(`Could not load the image ${url}.`, error),
    );
  }
}
