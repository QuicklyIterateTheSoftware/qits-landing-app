import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  PREVIEW_LIMIT,
  type FilterPreview,
  type FilterRule,
} from '$core/workspaces/file-filter-rules';
import { FileFilterDialog, type GeneratedSet } from './file-filter-dialog';

const RULES: readonly FilterRule[] = [
  { id: 'a', kind: 'includes', query: '.ts', mode: 'hide', enabled: true },
  { id: 'b', kind: 'exact', query: 'main.ts', mode: 'show', enabled: true },
];

const PREVIEW: FilterPreview = { paths: ['webui/src/main.ts'], total: 1, truncated: false };

const IGNORE_SETS: readonly GeneratedSet[] = [
  {
    id: '.gitignore',
    name: '.gitignore',
    on: true,
    note: '2 files in the tree',
    rules: ['hide · *.log', 'show · webui/ · !keep.log'],
  },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FileFilterDialog],
  template: `
    <app-file-filter-dialog
      [rules]="rules()"
      [ignoreSets]="ignoreSets()"
      [preview]="preview()"
      (rulesChange)="rules.set($event)"
      (toggleIgnore)="toggled.set($event)"
      (closed)="closed.set(true)"
    />
  `,
})
class DialogHost {
  readonly rules = signal<readonly FilterRule[]>(RULES);
  readonly ignoreSets = signal<readonly GeneratedSet[]>(IGNORE_SETS);
  readonly preview = signal<FilterPreview>(PREVIEW);
  readonly toggled = signal<string | null>(null);
  readonly closed = signal(false);
}

/**
 * An editor for an ordered list, whose order is the meaning: moving a row moves only that row,
 * removing one leaves the rest where they were, and disabling one keeps its place.
 */
describe('FileFilterDialog', () => {
  let fixture: ComponentFixture<DialogHost>;
  let host: DialogHost;

  beforeEach(async () => {
    fixture = TestBed.createComponent(DialogHost);
    host = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const element = () => fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const labelled = <T extends HTMLElement>(label: string) =>
    element().querySelector<T>(`[aria-label="${label}"]`)!;
  const button = (text: string) =>
    [...element().querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
  const queries = () =>
    [...element().querySelectorAll<HTMLInputElement>('input[type="text"]')].map((box) => box.value);

  it('says out loud that the last match wins and that the generated sets run first', () => {
    const text = element().textContent ?? '';
    expect(text).toContain('last one that matches wins');
    expect(text).toContain('framework, then ignore list');
  });

  it('moves one row and leaves the rest where they were', async () => {
    labelled<HTMLButtonElement>('Move rule 1 later').click();
    await settle();
    expect(queries()).toEqual(['main.ts', '.ts']);
  });

  it('disables the arrows that would walk off the ends', () => {
    expect(labelled<HTMLButtonElement>('Move rule 1 earlier').disabled).toBe(true);
    expect(labelled<HTMLButtonElement>('Move rule 2 later').disabled).toBe(true);
    expect(labelled<HTMLButtonElement>('Move rule 1 later').disabled).toBe(false);
  });

  it('adds a rule at the end, where a new rule has the last word', async () => {
    button('Add a rule').click();
    await settle();
    expect(host.rules().length).toBe(3);
    expect(host.rules()[2]).toMatchObject({ query: '', mode: 'hide', enabled: true });
  });

  it('removes a rule without touching its neighbours', async () => {
    labelled<HTMLButtonElement>('Remove rule 1').click();
    await settle();
    expect(queries()).toEqual(['main.ts']);
  });

  it('keeps a disabled rule in its place', async () => {
    labelled<HTMLInputElement>('Enable rule 1').click();
    await settle();
    expect(host.rules()[0].enabled).toBe(false);
    expect(queries()).toEqual(['.ts', 'main.ts']);
  });

  it('edits a rule’s query in place', async () => {
    const box = labelled<HTMLInputElement>('Rule 2 query');
    box.value = 'app.ts';
    box.dispatchEvent(new Event('input'));
    await settle();
    expect(host.rules()[1]).toMatchObject({ id: 'b', query: 'app.ts' });
  });

  it('shows a generated set read-only, and emits its toggle rather than deciding', async () => {
    const lines = [...element().querySelectorAll('details li')].map((li) => li.textContent?.trim());
    expect(lines).toEqual(['hide · *.log', 'show · webui/ · !keep.log']);
    labelled<HTMLInputElement>('Apply .gitignore').click();
    await settle();
    expect(host.toggled()).toBe('.gitignore');
  });

  it('counts everything and says when it is only printing some of it', async () => {
    host.preview.set({
      paths: Array.from({ length: PREVIEW_LIMIT }, (_, at) => `file-${at}.ts`),
      total: PREVIEW_LIMIT + 12,
      truncated: true,
    });
    await settle();
    const count = element().querySelector('[role="status"]')?.textContent ?? '';
    expect(count).toContain(`${PREVIEW_LIMIT + 12} files visible`);
    expect(count).toContain(`Showing the first ${PREVIEW_LIMIT}`);
  });

  it('says nothing matches rather than drawing an empty box, and closes on Done', async () => {
    host.preview.set({ paths: [], total: 0, truncated: false });
    await settle();
    expect(element().textContent).toContain('Nothing matches these rules.');
    button('Done').click();
    expect(host.closed()).toBe(true);
  });
});
