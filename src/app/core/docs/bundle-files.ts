/**
 * Readings over a docs bundle's file paths and Markdown (qits-2337), ported from
 * qits-docs-frontend's `bundle-files.ts` (`storyPages`, `categoriesOf`, `pagesInCategory`),
 * `markdown-bundle.ts` (`storyTitle`) and `swagger-bundle.ts` (`openapiPathOf`).
 *
 * The directory layout is the contract the userflows framework emits:
 * `<category>/<story>/user-story.md` for a categorized story, `<story>/user-story.md` for an
 * uncategorized one. A root-level file (a guides bundle's `README.md`, the one `CHANGELOG.md` of a
 * changelog bundle) falls out of the same rule as an uncategorized page named after its file. So a
 * flat bundle has no categories, and a changelog is a bundle of one page: no chips, no legend.
 */

/** One Markdown page of a bundle. */
export interface StoryPage {
  readonly path: string;
  /** The category directory, `''` for an uncategorized page. */
  readonly category: string;
  /** The page's own label: its directory's name, or the file's name for a root-level page. */
  readonly story: string;
}

/** Every `.md` file of `files` as a page, in the list's order. */
export function storyPages(files: readonly string[]): StoryPage[] {
  return files
    .filter((file) => file.endsWith('.md'))
    .map((path) => {
      const segments = path.split('/');
      if (segments.length >= 3) {
        return { path, category: segments[0], story: segments[segments.length - 2] };
      }
      if (segments.length === 2) return { path, category: '', story: segments[0] };
      return { path, category: '', story: path.replace(/\.md$/, '') };
    });
}

/** The distinct categories of a bundle, in path order; empty for a flat bundle. */
export function categoriesOf(pages: readonly StoryPage[]): string[] {
  const seen: string[] = [];
  for (const page of pages) {
    if (page.category && !seen.includes(page.category)) seen.push(page.category);
  }
  return seen;
}

/** The pages a category narrows to; `''` means the uncategorized ones. */
export function pagesInCategory(pages: readonly StoryPage[], category: string): StoryPage[] {
  return pages.filter((page) => page.category === category);
}

/** The page's own first-level heading, else `fallback`: a slug loses punctuation the title keeps. */
export function storyTitle(markdown: string, fallback: string): string {
  return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() || fallback;
}

/**
 * The OpenAPI document of an `@apidocs` bundle: a file named `openapi.json`, `.yaml` or `.yml`
 * wherever it sits, else the first spec-shaped file there is; undefined when there is none.
 */
export function openapiPathOf(files: readonly string[]): string | undefined {
  const specShaped = files.filter((file) => /\.(json|ya?ml)$/.test(file));
  return specShaped.find((file) => /(^|\/)openapi\.(json|ya?ml)$/.test(file)) ?? specShaped[0];
}

/**
 * The bundle path a page's relative reference names (`screenshot.png` beside
 * `alpha/first-story/user-story.md` is `alpha/first-story/screenshot.png`; `./` and `../` are
 * followed), or undefined for a reference that is not relative to the page (a scheme, `//`, `/`,
 * `#`) or climbs out of the bundle. A query or fragment is dropped: the docs store serves files.
 */
export function bundlePathOf(page: string, reference: string): string | undefined {
  if (!reference || /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(reference)) return undefined;
  const bare = reference.split(/[?#]/)[0];
  if (!bare) return undefined;
  const segments = page.split('/').slice(0, -1);
  for (const part of bare.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segments.length === 0) return undefined;
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  return segments.length ? segments.join('/') : undefined;
}

/** Whether `line` closes a fence opened with `fence`: the same character, at least as many. */
function closes(line: string, fence: string): boolean {
  const run = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)?.[1];
  return !!run && run[0] === fence[0] && run.length >= fence.length;
}

/** A run of a page's Markdown, or one of its diagrams. */
export type MarkdownPart =
  | { readonly kind: 'markdown'; readonly text: string }
  | { readonly kind: 'mermaid'; readonly definition: string };

/**
 * A page's Markdown split around its fenced `mermaid` blocks (```` ```mermaid ```` or
 * `~~~mermaid`, closed by the same fence), so each diagram is drawn by `<qits-mermaid-diagram>`
 * and the text between by `ui-markdown`. An unclosed fence stays text; blank runs are dropped.
 */
export function markdownParts(markdown: string): MarkdownPart[] {
  const parts: MarkdownPart[] = [];
  const lines = markdown.split('\n');
  let text: string[] = [];
  const flush = () => {
    const joined = text.join('\n');
    if (joined.trim()) parts.push({ kind: 'markdown', text: joined });
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const open = /^ {0,3}(`{3,}|~{3,})\s*mermaid\s*$/.exec(lines[i]);
    const fence = open?.[1];
    const close = fence ? lines.findIndex((line, at) => at > i && closes(line, fence)) : -1;
    if (close < 0) {
      text.push(lines[i]);
      continue;
    }
    flush();
    parts.push({ kind: 'mermaid', definition: lines.slice(i + 1, close).join('\n') });
    i = close;
  }
  flush();
  return parts;
}
