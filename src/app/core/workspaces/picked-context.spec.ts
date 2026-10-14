import {
  draftReferences,
  PickedContext,
  referenceLabel,
  referenceText,
  serializePrompt,
  type CodeReference,
} from './picked-context';

const LOGIN: CodeReference = {
  path: 'src/main/java/app/Login.java',
  startLine: 4,
  endLine: 6,
  excerpt: '  String user(String name) {\n    return name.strip();\n  }',
};
const ONE: CodeReference = { path: 'pom.xml', startLine: 2, endLine: 2, excerpt: '<project>' };

describe('picked references', () => {
  it('are labelled path:line, or path:start-end', () => {
    expect(referenceLabel(ONE)).toBe('pom.xml:2');
    expect(referenceLabel(LOGIN)).toBe('src/main/java/app/Login.java:4-6');
  });

  it('insert their label and their lines, fenced', () => {
    expect(referenceText(ONE)).toBe('pom.xml:2\n```\n<project>\n```');
  });

  it('append the ones never pressed into the box to the prompt', () => {
    expect(serializePrompt({ text: 'Trim it.', picked: [] })).toBe('Trim it.');
    expect(
      serializePrompt({ text: `Trim it.\n\n${referenceText(LOGIN)}`, picked: [LOGIN, ONE] }),
    ).toBe(
      `Trim it.\n\n${referenceText(LOGIN)}\n\nContext picked in the worktree:\n\n${referenceText(ONE)}`,
    );
  });

  it('are read from a draft’s picked, or the microfrontend’s references, and nothing else', () => {
    expect(draftReferences({ text: '', picked: [LOGIN] })).toEqual([LOGIN]);
    expect(draftReferences({ text: '', references: [ONE] })).toEqual([ONE]);
    expect(draftReferences({ text: '', picked: [{ path: 3 }, ONE] })).toEqual([ONE]);
    expect(draftReferences('nonsense')).toEqual([]);
    expect(draftReferences(null)).toEqual([]);
  });
});

describe('PickedContext', () => {
  it('keeps a range once, and empties when the agent changes', () => {
    const context = new PickedContext();
    context.use('a1');
    context.add(LOGIN);
    context.add({ ...LOGIN });
    expect(context.references()).toEqual([LOGIN]);
    context.use('a1');
    expect(context.any()).toBe(true);
    context.use('a2');
    expect(context.any()).toBe(false);
  });

  it('drops a pick by its label', () => {
    const context = new PickedContext();
    context.add(LOGIN);
    context.add(ONE);
    context.remove(referenceLabel(LOGIN));
    expect(context.references()).toEqual([ONE]);
  });

  it('restores a draft’s picks and keeps what was picked here since, saying so', () => {
    const context = new PickedContext();
    context.add(ONE);
    expect(context.restore([LOGIN])).toBe(true);
    expect(context.references()).toEqual([LOGIN, ONE]);
    expect(context.restore([LOGIN, ONE])).toBe(false);
    context.replace([]);
    expect(context.any()).toBe(false);
  });
});
