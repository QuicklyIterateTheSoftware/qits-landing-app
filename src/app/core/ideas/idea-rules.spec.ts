import {
  descriptionLength,
  MAX_DESCRIPTION,
  MAX_PARAGRAPHS,
  paragraphCount,
  titleProblems,
} from './idea-rules';

describe('idea rules', () => {
  it('counts the paragraphs as blocks between blank lines, after trimming', () => {
    expect(paragraphCount('')).toBe(0);
    expect(paragraphCount('  \n \n')).toBe(0);
    expect(paragraphCount('One.')).toBe(1);
    expect(paragraphCount('One line\nand the next, one block.')).toBe(1);
    expect(paragraphCount('\n\nOne.\n\nTwo.\n \t\n\nThree.\n\n')).toBe(3);
    expect(paragraphCount('One.\r\n\r\nTwo.')).toBe(2);
    expect(MAX_PARAGRAPHS).toBe(3);
  });

  it('counts the characters of the trimmed text, by code point', () => {
    expect(descriptionLength('  abc  ')).toBe(3);
    expect(descriptionLength('😀')).toBe(1);
    expect(MAX_DESCRIPTION).toBe(600);
  });

  it('names what breaks the title rule', () => {
    expect(titleProblems('Faster builds')).toEqual([]);
    expect(titleProblems(' ')).toEqual(['A title is required.']);
    expect(titleProblems('Faster builds. Fewer waits. Less cost')).toEqual([
      "2 '.' characters; at most one.",
    ]);
    expect(titleProblems('a\nb')).toEqual(['One line only.']);
    expect(titleProblems(Array(21).fill('w').join(' '))).toEqual([
      '20 whitespace characters; fewer than 20.',
    ]);
  });
});
