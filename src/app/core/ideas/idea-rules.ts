/**
 * qits-projects' idea rules (epic qits-888, `IdeaService`), counted in the browser so the form can
 * show where a title or description stands while it is typed. The service decides: the form sends
 * whatever is typed and shows its 400 `message` when it refuses. Nothing here blocks a send.
 *
 * - title: required, one line, at most one '.', fewer than 20 whitespace characters;
 * - description: optional; trimmed, at most {@link MAX_PARAGRAPHS} paragraphs (blocks separated by
 *   one or more blank lines) and at most {@link MAX_DESCRIPTION} characters (code points).
 */

/** At most this many paragraphs in a description. */
export const MAX_PARAGRAPHS = 3;

/** At most this many characters in a description, after trimming. */
export const MAX_DESCRIPTION = 600;

/** Fewer whitespace characters than this in a title. */
export const MAX_TITLE_WHITESPACE = 20;

/** One or more blank lines: what separates two paragraphs (the service's `PARAGRAPH_BREAK`). */
const PARAGRAPH_BREAK = /(?:\r\n|\r|\n)[ \t]*(?:\r\n|\r|\n)(?:[ \t]*(?:\r\n|\r|\n))*/;

/** The description's characters, as the service counts them: code points of the trimmed text. */
export function descriptionLength(description: string): number {
  return [...description.trim()].length;
}

/** The description's paragraphs: its trimmed text's blocks between blank lines; 0 when blank. */
export function paragraphCount(description: string): number {
  const trimmed = description.trim();
  if (!trimmed) return 0;
  return trimmed.split(PARAGRAPH_BREAK).filter((block) => block.trim().length > 0).length;
}

/** What is wrong with a title by the service's rule, for a hint; empty when nothing is. */
export function titleProblems(title: string): readonly string[] {
  const problems: string[] = [];
  if (!title.trim()) return ['A title is required.'];
  if (/[\r\n]/.test(title)) problems.push('One line only.');
  const dots = title.split('.').length - 1;
  if (dots > 1) problems.push(`${dots} '.' characters; at most one.`);
  const spaces = (title.match(/\s/g) ?? []).length;
  if (spaces >= MAX_TITLE_WHITESPACE) {
    problems.push(`${spaces} whitespace characters; fewer than ${MAX_TITLE_WHITESPACE}.`);
  }
  return problems;
}
