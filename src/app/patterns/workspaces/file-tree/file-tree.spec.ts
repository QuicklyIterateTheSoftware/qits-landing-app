import { TestBed } from '@angular/core/testing';
import { buildTree, flatten, OPEN_NOTHING, type TreeRow } from '$core/workspaces/file-tree-model';
import { workspaceDaemonGoldenMaster } from '../../../../testing/golden-masters';
import { FileTree } from './file-tree';

const FILES = 'a workspace daemon with an agent whose worktree holds files';

/** The recorded tree, as the model flattens it with nothing opened. */
const ROWS = flatten(buildTree(workspaceDaemonGoldenMaster(FILES, 'listFiles')), OPEN_NOTHING);

function render(rows: readonly TreeRow[], selected: string | null = null) {
  const fixture = TestBed.createComponent(FileTree);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('selected', selected);
  fixture.componentRef.setInput('loading', new Set(['node_modules']));
  const opened: string[] = [];
  const toggled: TreeRow[] = [];
  fixture.componentInstance.openFile.subscribe((path) => opened.push(path));
  fixture.componentInstance.toggleDir.subscribe((row) => toggled.push(row));
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const entry = (path: string) =>
    element.querySelector<HTMLButtonElement>(`button[data-path="${path}"]`)!;
  return { element, entry, opened, toggled };
}

describe('FileTree', () => {
  it('draws directories first, then files (by name, as `localeCompare` sorts), with a gitignored stub dimmed and counted', () => {
    const { element, entry } = render(ROWS);
    const paths = [...element.querySelectorAll('button')].map((b) => b.getAttribute('data-path'));
    expect(paths).toEqual([
      'libs/child',
      'node_modules',
      'src',
      '.gitignore',
      '.gitmodules',
      'pom.xml',
      'README.md',
    ]);
    expect(entry('node_modules').textContent).toContain('(2)');
    expect(entry('node_modules').textContent).toContain('Loading…');
    expect(entry('node_modules').classList).toContain('text-charcoal-brown-400');
    expect(entry('node_modules').title).toBe('node_modules — git ignores this');
  });

  it('folds a single-child chain into one row, its ancestors dimmed', () => {
    const { entry } = render(ROWS);
    expect(entry('libs/child').textContent?.replace(/\s+/g, '')).toBe('libs/child');
  });

  it('opens a file and hands a directory to the page, never moving the selection', () => {
    const { entry, opened, toggled, element } = render(ROWS, 'pom.xml');
    entry('README.md').click();
    entry('src').click();
    expect(opened).toEqual(['README.md']);
    expect(toggled.map((row) => row.node.path)).toEqual(['src']);
    const selected = element.querySelector('[aria-selected="true"]');
    expect(selected?.querySelector('button')?.getAttribute('data-path')).toBe('pom.xml');
  });
});
