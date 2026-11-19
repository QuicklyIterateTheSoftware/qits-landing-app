/**
 * A CI step's output keeps its colour (qits-2321): qits-ci stores what the step wrote, ANSI escapes
 * and all, and the run page draws it as text in styled spans, never as HTML. Pure, so the page only
 * draws the segments: each is plain text (Angular's interpolation escapes it) with the classes of
 * the SGR state it was written in.
 *
 * Kept: bold (1, cleared by 22 and 0), the eight foreground colours (30–37) and their bright forms
 * (90–97), the default foreground (39) and reset (0, or no parameter). Every other SGR parameter
 * (dim, italic, underline, backgrounds, 256-colour and RGB forms) is read past and changes nothing.
 * Every other escape (a cursor move, an erase, an OSC title or hyperlink, a lone ESC) is dropped from
 * the text. Each colour is a theme token, chosen by its role, so it follows the light or dark scheme.
 */

/** One run of text written in one SGR state. */
export interface AnsiSegment {
  readonly text: string;
  /** The Tailwind classes of its state; `''` for the default. */
  readonly classes: string;
}

/** The foreground classes of SGR 30–37, by colour index. */
const COLOURS: readonly string[] = [
  'text-fg-soft', // black
  'text-danger', // red
  'text-success', // green
  'text-warning', // yellow
  'text-code-type', // blue
  'text-code-annotation', // magenta
  'text-accent-muted', // cyan
  'text-fg', // white
];

/** The foreground classes of SGR 90–97, the bright forms, by colour index. */
const BRIGHT_COLOURS: readonly string[] = [
  'text-fg-muted', // bright black (grey)
  'text-danger-strong', // bright red
  'text-success-strong', // bright green
  'text-warning-strong', // bright yellow
  'text-accent', // bright blue
  'text-code-keyword', // bright magenta
  'text-accent-muted', // bright cyan
  'text-fg', // bright white
];

const BOLD = 'font-semibold';

/**
 * Every escape the text can hold: a CSI sequence (`ESC [` params, intermediates, a final byte), an
 * OSC string (`ESC ]` … BEL or `ESC \`), any other escape (intermediates, then a final byte: `ESC ( B`),
 * and a lone ESC at the end.
 * Only a CSI ending in `m` is an SGR; the rest is dropped.
 */
const ESCAPE =
  /\u001b\[([0-?]*)[ -/]*([@-~])|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b[ -/]*[0-~]?/g;

interface State {
  bold: boolean;
  colour: string;
}

/** The classes of `state`, as one class string. */
function classesOf(state: State): string {
  return [state.colour, state.bold ? BOLD : ''].filter(Boolean).join(' ');
}

/** `state` after one SGR's parameters (`1;31`, `0`, ``). */
function apply(state: State, params: string): State {
  const codes = params === '' ? [0] : params.split(/[;:]/).map((code) => Number(code || 0));
  let { bold, colour } = state;
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    if (code === 0) {
      bold = false;
      colour = '';
    } else if (code === 1) bold = true;
    else if (code === 22) bold = false;
    else if (code >= 30 && code <= 37) colour = COLOURS[code - 30];
    else if (code >= 90 && code <= 97) colour = BRIGHT_COLOURS[code - 90];
    else if (code === 39) colour = '';
    // 38/48 (256-colour or RGB) carry their own parameters: read past them, unused.
    else if (code === 38 || code === 48) i += codes[i + 1] === 5 ? 2 : codes[i + 1] === 2 ? 4 : 0;
  }
  return { bold, colour };
}

/**
 * `text` cut into segments by its SGR state, every escape removed. Adjacent text in the same state
 * is one segment, and an empty one is left out.
 */
export function ansiSegments(text: string): readonly AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let state: State = { bold: false, colour: '' };
  const push = (chunk: string) => {
    if (!chunk) return;
    const classes = classesOf(state);
    const last = segments[segments.length - 1];
    if (last && last.classes === classes) {
      segments[segments.length - 1] = { text: last.text + chunk, classes };
    } else {
      segments.push({ text: chunk, classes });
    }
  };
  let at = 0;
  for (const match of text.matchAll(ESCAPE)) {
    push(text.slice(at, match.index));
    at = match.index + match[0].length;
    if (match[2] === 'm') state = apply(state, match[1] ?? '');
  }
  push(text.slice(at));
  return segments;
}

/** `text` without its escapes: what a person reads, for a title or a search. */
export function stripAnsi(text: string): string {
  return ansiSegments(text)
    .map((segment) => segment.text)
    .join('');
}
