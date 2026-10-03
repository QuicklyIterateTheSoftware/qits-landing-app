import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Breadcrumbs, Crumb } from './breadcrumbs';

const trail: readonly Crumb[] = [
  { label: 'Projects', path: '/projects' },
  { label: 'qits', path: '/projects/qits' },
  { label: 'Work', path: '/projects/qits/work' },
  { label: 'qits-112', path: '/projects/qits/work/qits-112' },
];

@Component({
  imports: [Breadcrumbs],
  template: `<ui-breadcrumbs [crumbs]="crumbs()"><a href="/">qits</a></ui-breadcrumbs>`,
})
class Host {
  readonly crumbs = signal<readonly Crumb[]>(trail);
}

function render(crumbs: readonly Crumb[]) {
  TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.crumbs.set(crumbs);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const ellipsis = element.querySelector<HTMLElement>('[data-crumbs-ellipsis]')!;
  const items = [...element.querySelectorAll<HTMLElement>('li')].filter((item) =>
    item.querySelector('a[href^="/projects"]'),
  );
  return { fixture, element, ellipsis, items };
}

describe('Breadcrumbs', () => {
  it('keeps the whole trail in the DOM and marks the last crumb as the current page', () => {
    const { element, items } = render(trail);
    expect(items.map((item) => item.textContent?.replace('›', '').trim())).toEqual([
      'Projects',
      'qits',
      'Work',
      'qits-112',
    ]);
    expect(element.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(items[3].querySelector('a')?.getAttribute('aria-current')).toBe('page');
  });

  it('hides the crumbs between the first and the last two on a narrow screen only', () => {
    const { items } = render(trail);
    expect(items.map((item) => item.className.split(' ').sort().join(' '))).toEqual([
      'flex gap-2 items-center',
      'gap-2 group-focus-within:flex hidden items-center md:flex',
      'flex gap-2 items-center',
      'flex gap-2 items-center',
    ]);
  });

  it('puts one ellipsis after the first crumb, on a narrow screen only, labelled with the hidden ones', () => {
    const { element, ellipsis } = render(trail);
    expect(ellipsis.previousElementSibling?.textContent).toContain('Projects');
    expect(element.querySelectorAll('[data-crumbs-ellipsis]')).toHaveLength(1);
    expect(ellipsis.classList).toContain('flex');
    expect(ellipsis.classList).toContain('md:hidden');
    expect(ellipsis.classList).not.toContain('hidden');
    expect(ellipsis.classList).toContain('group-focus-within:sr-only');
    const button = ellipsis.querySelector('button')!;
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Show the full path: qits');
    expect(button.getAttribute('title')).toBe('Show the full path: qits');
  });

  it('replaces the separators around the ellipsis on a narrow screen only', () => {
    const { ellipsis, items } = render(trail);
    expect(ellipsis.textContent).not.toContain('›');
    const separators = items.map((item) => item.querySelector('span[aria-hidden="true"]')!);
    expect(separators.map((separator) => separator.className.split(' ').sort().join(' '))).toEqual([
      'text-gray-400',
      'text-gray-400',
      'group-focus-within:inline hidden md:inline text-gray-400',
      'text-gray-400',
    ]);
  });

  it('opens the whole trail while focus is inside it', () => {
    const { element } = render(trail);
    expect(element.querySelector('ol')?.classList).toContain('group');
  });

  it('keeps the focus on a press on a link and lets it go after the click', async () => {
    const { fixture, element, ellipsis } = render(trail);
    const button = ellipsis.querySelector('button')!;
    button.click();
    expect(document.activeElement).toBe(button);
    const link = element.querySelector<HTMLAnchorElement>('a[href="/projects/qits"]')!;
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    link.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.activeElement).not.toBe(button);
    await fixture.whenStable();
  });

  it('collapses on Escape', () => {
    const { element, ellipsis } = render(trail);
    const button = ellipsis.querySelector('button')!;
    button.click();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(element.contains(document.activeElement)).toBe(false);
  });

  it('names every hidden crumb in the ellipsis label', () => {
    const deeper = [...trail, { label: 'Notes', path: '/projects/qits/work/qits-112/notes' }];
    const { ellipsis, items } = render(deeper);
    expect(ellipsis.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Show the full path: qits › Work',
    );
    expect(items.map((item) => item.classList.contains('hidden'))).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
  });

  it('has no ellipsis and hides nothing with three crumbs or fewer', () => {
    for (const crumbs of [trail.slice(0, 1), trail.slice(0, 2), trail.slice(0, 3)]) {
      TestBed.resetTestingModule();
      const { ellipsis, items } = render(crumbs);
      expect(items).toHaveLength(crumbs.length);
      expect(ellipsis.classList).toContain('hidden');
      expect(ellipsis.classList).not.toContain('flex');
      expect(ellipsis.querySelector('button')?.hasAttribute('aria-label')).toBe(false);
      expect(items.every((item) => item.classList.contains('flex'))).toBe(true);
      expect(items.some((item) => item.classList.contains('hidden'))).toBe(false);
      expect(items.some((item) => item.querySelector('span.hidden'))).toBe(false);
    }
  });
});
