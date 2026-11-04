import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Breadcrumbs, Crumb } from './breadcrumbs';

const trail: readonly Crumb[] = [
  { label: 'Projects', path: '/projects' },
  { label: 'qits', path: '/projects/qits' },
  { label: 'Work', path: '/projects/qits/work' },
  { label: 'qits-112', path: '/projects/qits/work/detail/qits-112' },
];

@Component({
  imports: [Breadcrumbs],
  template: `<ui-breadcrumbs [crumbs]="crumbs()" />`,
})
class Host {
  readonly crumbs = signal<readonly Crumb[]>(trail);
}

/** A class list, sorted, as one string. */
const classes = (element: Element | null | undefined) =>
  (element?.className ?? '').split(' ').filter(Boolean).sort().join(' ');

function render(crumbs: readonly Crumb[]) {
  TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.crumbs.set(crumbs);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const ellipsis = element.querySelector<HTMLElement>('[data-crumbs-ellipsis]')!;
  const button = ellipsis.querySelector<HTMLButtonElement>('button')!;
  const panel = ellipsis.querySelector<HTMLElement>('[role="region"]')!;
  const list = element.querySelector<HTMLElement>('nav > ol')!;
  const [brand, ...items] = [...list.querySelectorAll<HTMLElement>(':scope > li')];
  return { fixture, element, ellipsis, button, panel, list, brand, items };
}

describe('Breadcrumbs', () => {
  it('keeps the whole trail in the DOM and marks the last crumb as the current page', () => {
    const { brand, items } = render(trail);
    expect(brand.querySelector('a')?.getAttribute('href')).toBe('/');
    expect(brand.querySelector('a')?.textContent?.trim()).toBe('qits');
    expect(classes(brand.querySelector('a'))).toContain('font-bold');
    expect(items.map((item) => item.textContent?.replaceAll('›', '').trim())).toEqual([
      'Projects',
      'qits',
      'Work',
      'qits-112',
    ]);
    expect(items[3].querySelector('a')?.getAttribute('aria-current')).toBe('page');
    expect(items.slice(0, 3).some((item) => item.querySelector('[aria-current]'))).toBe(false);
  });

  it('shows only the parent and the current page on a narrow screen', () => {
    const { brand, items } = render(trail);
    expect(classes(brand)).toContain('hidden');
    expect(classes(brand)).toContain('md:block');
    expect(items.map((item) => classes(item))).toEqual([
      'hidden items-center md:flex min-w-0 overflow-hidden shrink-[1000]',
      'hidden items-center md:flex min-w-0 overflow-hidden shrink-[1000]',
      'flex items-center min-w-0 overflow-hidden shrink-[1000]',
      // The current page shrinks last.
      'flex items-center min-w-0 overflow-hidden',
    ]);
  });

  it('puts no separator after the "…" on a narrow screen, and the parent’s inside the parent', () => {
    const { ellipsis, items } = render(trail);
    expect(ellipsis.textContent).not.toContain('›');
    const separators = items.map((item) =>
      [...item.querySelectorAll('span[aria-hidden="true"]')].map((separator) => classes(separator)),
    );
    expect(separators).toEqual([
      ['px-2 shrink-0 text-gray-400'],
      ['px-2 shrink-0 text-gray-400'],
      // The parent: its leading separator only from md up, its trailing one only below.
      [
        'hidden md:inline px-2 shrink-0 text-gray-400',
        "after:content-['›'] md:hidden px-2 shrink-0 text-gray-400",
      ],
      ['hidden md:inline px-2 shrink-0 text-gray-400'],
    ]);
    // The parent's trailing separator comes after its label, so it clips with the parent; it is
    // generated content, so the trail's text has one "›" between the parent and the current page.
    expect(items[2].lastElementChild?.matches('span[aria-hidden="true"]')).toBe(true);
    expect(items[2].lastElementChild?.textContent).toBe('');
  });

  it('makes the "…" a menu button, below md only, named by the path before the current page', () => {
    const { element, ellipsis, button, panel } = render(trail);
    expect(element.querySelectorAll('[data-crumbs-ellipsis]')).toHaveLength(1);
    expect(classes(ellipsis)).toContain('md:hidden');
    expect(classes(ellipsis)).not.toMatch(/(^| )hidden/);
    // Outside the trail's list, which clips.
    expect(ellipsis.closest('ol')).toBeNull();
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-haspopup')).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe(
      'Show the full path: qits › Projects › qits › Work',
    );
    expect(panel.getAttribute('aria-label')).toBe('Full path');
    expect(classes(panel)).toContain('left-0');
  });

  it('lists the whole path in the panel: the brand and the ancestors as links, then the current page', () => {
    const { panel } = render(trail);
    const rows = [...panel.querySelectorAll('li')];
    expect(rows.map((row) => row.textContent?.trim())).toEqual([
      'qits',
      'Projects',
      'qits',
      'Work',
      'qits-112',
    ]);
    expect(rows.slice(0, -1).map((row) => row.querySelector('a')?.getAttribute('href'))).toEqual([
      '/',
      '/projects',
      '/projects/qits',
      '/projects/qits/work',
    ]);
    const current = rows.at(-1)!;
    expect(current.querySelector('a')).toBeNull();
    const span = current.querySelector('span')!;
    expect(span.getAttribute('aria-current')).toBe('page');
    expect(classes(span)).toContain('break-words');
    expect(classes(span)).not.toContain('truncate');
  });

  it('opens the panel from the "…" and closes it when a link in it is followed', async () => {
    const { fixture, button, panel } = render(trail);
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.classList).not.toContain('hidden');
    panel.querySelector<HTMLAnchorElement>('a[href="/projects"]')!.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.classList).toContain('hidden');
    await fixture.whenStable();
  });

  it('shows the single crumb after the "…" on a narrow screen, with the brand in the panel', () => {
    const { brand, button, panel, items } = render(trail.slice(0, 1));
    expect(classes(brand)).toContain('hidden');
    expect(items).toHaveLength(1);
    expect(classes(items[0])).toBe('flex items-center min-w-0 overflow-hidden');
    expect(classes(items[0].querySelector('span[aria-hidden="true"]'))).toBe(
      'hidden md:inline px-2 shrink-0 text-gray-400',
    );
    expect(items[0].querySelectorAll('span[aria-hidden="true"]')).toHaveLength(1);
    expect(button.getAttribute('aria-label')).toBe('Show the full path: qits');
    expect([...panel.querySelectorAll('li')].map((row) => row.textContent?.trim())).toEqual([
      'qits',
      'Projects',
    ]);
  });
});
