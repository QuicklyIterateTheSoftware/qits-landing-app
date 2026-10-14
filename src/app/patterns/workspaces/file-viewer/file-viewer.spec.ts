import { TestBed } from '@angular/core/testing';
import type { LineRange, PickedRange } from '$core/workspaces/file-range';
import { workspaceDaemonGoldenMaster } from '../../../../testing/golden-masters';
import { FileViewer, type FileView } from './file-viewer';

/** The recorded source file: seven lines, ending in a newline. */
const LOGIN = workspaceDaemonGoldenMaster(
  'a workspace daemon with an agent whose worktree holds files',
  'readFile',
);
const LOADED: FileView = { status: 'loaded', binary: false, content: LOGIN.content };

function render(
  file: FileView | null,
  options: { picking?: boolean; anchor?: LineRange | null; picks?: readonly LineRange[] } = {},
) {
  const fixture = TestBed.createComponent(FileViewer);
  fixture.componentRef.setInput('path', LOGIN.path);
  fixture.componentRef.setInput('file', file);
  fixture.componentRef.setInput('picking', options.picking ?? false);
  fixture.componentRef.setInput('anchor', options.anchor ?? null);
  fixture.componentRef.setInput('picks', options.picks ?? []);
  const picked: PickedRange[] = [];
  let retried = 0;
  fixture.componentInstance.pick.subscribe((range) => picked.push(range));
  fixture.componentInstance.retry.subscribe(() => (retried += 1));
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const line = (n: number) => element.querySelector<HTMLElement>(`[data-line="${n}"]`)!;
  return { fixture, element, picked, line, retried: () => retried };
}

describe('FileViewer', () => {
  it('numbers every line and invents none for the trailing newline', () => {
    const { element } = render(LOADED);
    const numbers = [...element.querySelectorAll('[data-line]')].map((li) =>
      li.getAttribute('data-line'),
    );
    expect(numbers).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(element.textContent).toContain('class Login {');
  });

  it('says what to do before a file is open', () => {
    const fixture = TestBed.createComponent(FileViewer);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Select a file to view its contents.');
  });

  it('says a file is too large or binary, because the daemon sends both the same way', () => {
    const { element } = render({ status: 'loaded', binary: true, content: null });
    expect(element.textContent).toContain('too large or binary');
    expect(element.textContent).toContain('2 MB');
    expect(element.querySelector('[data-line]')).toBeNull();
  });

  it('tells an empty file from an unrenderable one', () => {
    const { element } = render({ status: 'loaded', binary: false, content: '' });
    expect(element.textContent).toContain('This file is empty.');
  });

  it('says a path that names nothing is not in the worktree, and offers a retry on a failure', () => {
    expect(
      render({ status: 'missing', binary: false, content: null }).element.textContent,
    ).toContain('is not in the worktree');
    const failed = render({ status: 'error', binary: false, content: null });
    expect(failed.element.textContent).toContain('Could not read');
    failed.element.querySelector('button')!.click();
    expect(failed.retried()).toBe(1);
  });

  it('offers no gutter buttons while pick mode is off', () => {
    const { element } = render(LOADED);
    expect(element.querySelector('[data-line] button')).toBeNull();
  });

  it('makes a range of two presses, with the lines’ text captured at pick time', () => {
    const { line, picked, fixture } = render(LOADED, { picking: true });
    line(6).querySelector('button')!.click();
    fixture.detectChanges();
    line(4).querySelector('button')!.click();
    expect(picked).toEqual([
      {
        startLine: 4,
        endLine: 6,
        excerpt: '  String user(String name) {\n    return name.strip();\n  }',
      },
    ]);
  });

  it('takes one shift-press as a range of one line', () => {
    const { line, picked } = render(LOADED, { picking: true });
    line(3)
      .querySelector('button')!
      .dispatchEvent(new MouseEvent('click', { shiftKey: true }));
    expect(picked).toEqual([{ startLine: 3, endLine: 3, excerpt: 'class Login {' }]);
  });

  it('paints the anchored range and the picked ones', () => {
    const { line } = render(LOADED, {
      anchor: { startLine: 4, endLine: 5 },
      picks: [{ startLine: 1, endLine: 1 }],
    });
    expect(line(4).classList).toContain('bg-sunflower-gold-100');
    expect(line(5).classList).toContain('bg-sunflower-gold-100');
    expect(line(6).classList).not.toContain('bg-sunflower-gold-100');
    expect(line(1).classList).toContain('bg-ocean-deep-50');
  });
});
