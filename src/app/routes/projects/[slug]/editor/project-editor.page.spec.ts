import { editorUrl } from './project-editor.page';

describe('editorUrl', () => {
  it("opens qits-workspaces' editor door scoped to the project", () => {
    expect(editorUrl('https://workspaces.qits.example', 'qits')).toBe(
      'https://workspaces.qits.example/qits/editor',
    );
  });

  it('opens the unscoped door without a project', () => {
    expect(editorUrl('https://workspaces.qits.example', undefined)).toBe(
      'https://workspaces.qits.example/editor',
    );
  });

  it('encodes the slug', () => {
    expect(editorUrl('https://workspaces.qits.example', 'a/b')).toBe(
      'https://workspaces.qits.example/a%2Fb/editor',
    );
  });

  it('shows a blank frame while the workspaces origin is not known', () => {
    expect(editorUrl('', 'qits')).toBe('about:blank');
  });
});
