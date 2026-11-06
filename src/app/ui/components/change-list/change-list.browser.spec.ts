import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { ChangeList, type ChangeEntry } from './change-list';

/**
 * Screenshots of the change list, on synthetic entries (`src/app/ui/`, no backend): a root file,
 * an expanded submodule pin with its files nested one level under it — relative labels, a rename
 * shown as `old → new` — and another pin followed by one more root file.
 */
const ENTRIES: readonly ChangeEntry[] = [
  { path: 'README.md', changeType: 'MODIFIED' },
  {
    path: 'components/qits-artifacts/qits-artifacts-service',
    changeType: 'MODIFIED',
  },
  {
    path: 'components/qits-artifacts/qits-artifacts-service/src/main/resources/application.yml',
    label: 'src/main/resources/application.yml',
    changeType: 'ADDED',
    depth: 1,
  },
  {
    path: 'components/qits-artifacts/qits-artifacts-service/src/main/java/Service.java',
    label: 'src/main/java/Service.java',
    changeType: 'MODIFIED',
    depth: 1,
  },
  {
    path: 'components/qits-artifacts/qits-artifacts-service/src/main/java/ServiceImpl.java',
    oldPath: 'components/qits-artifacts/qits-artifacts-service/src/main/java/Service2Impl.java',
    label: 'src/main/java/ServiceImpl.java',
    oldLabel: 'src/main/java/Service2Impl.java',
    changeType: 'RENAMED',
    depth: 1,
  },
  { path: 'components/qits-ci/qits-ci-service', changeType: 'MODIFIED' },
  { path: 'docs/architecture.md', changeType: 'ADDED' },
];

@Component({
  imports: [ChangeList],
  host: { class: 'block w-[22rem] p-4' },
  template: `
    <ui-change-list [entries]="entries" [selected]="selected" (select)="selected = $event" />
  `,
})
class List {
  readonly entries = ENTRIES;
  selected = 'components/qits-artifacts/qits-artifacts-service/src/main/java/Service.java';
}

describe('ChangeList (screenshots)', () => {
  it('nests an expanded pin’s files one level under it, with one selected', async () => {
    const fixture = TestBed.createComponent(List);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view).toMatchTextContent('src/main/java/ServiceImpl.java');
    await expect.element(view).toMatchScreenshot('pin-expanded');
  });
});
