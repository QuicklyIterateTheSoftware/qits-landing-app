import { workspacesGoldenMaster, workspacesGoldenMasters } from '../../../testing/golden-masters';
import { draftContent, draftPicked, draftText, promptDraftOf } from './prompt-drafts';

const SAVED = 'an agent with a saved prompt draft';

describe('draftContent and draftText', () => {
  it('write the prompt as the composition qits-workspaces records, and read it back', () => {
    const { content } = workspacesGoldenMasters.operation(SAVED, 'saveAgentPromptDraft').body as {
      content: string;
    };
    expect(draftContent(draftText(content))).toBe(content);
  });

  it('read a blob they cannot as an empty prompt', () => {
    expect(draftText('not json')).toBe('');
    expect(draftText('{"text":3}')).toBe('');
    expect(draftText(undefined)).toBe('');
  });

  it('carry the picked line ranges, and read none from a blob without them', () => {
    const picked = [{ path: 'pom.xml', startLine: 2, endLine: 4, excerpt: '<project>' }];
    const content = draftContent('Look here.', picked);
    expect(draftText(content)).toBe('Look here.');
    expect(draftPicked(content)).toEqual(picked);
    expect(draftPicked('not json')).toEqual([]);
    expect(draftPicked(undefined)).toEqual([]);
  });
});

describe('promptDraftOf', () => {
  it('restores the saved draft, and none from an answer without one', () => {
    const recorded = workspacesGoldenMaster(SAVED, 'getAgentPromptDraft');
    expect(promptDraftOf(recorded)).toEqual({
      text: draftText(recorded.draft.content),
      picked: draftPicked(recorded.draft.content),
      updatedAt: recorded.draft.updatedAt,
    });
    expect(promptDraftOf({})).toBeNull();
    expect(promptDraftOf(undefined)).toBeNull();
  });
});
