import { editorUrl } from './project-editor';

describe('editorUrl', () => {
  it("opens qits-workspaces' editor door scoped to the project", () => {
    expect(editorUrl({ protocol: 'https:', hostname: 'landing.qits.wohlben.eu' }, 'qits')).toBe(
      'https://workspaces.qits.wohlben.eu/qits/editor',
    );
  });

  it('opens the unscoped door without a project', () => {
    expect(editorUrl({ protocol: 'http:', hostname: 'localhost' }, undefined)).toBe(
      'https://workspaces.qits.wohlben.eu/editor',
    );
  });
});
