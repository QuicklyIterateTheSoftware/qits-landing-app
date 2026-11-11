import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { BundleLookup } from '$core/contracts/contracts-view';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { ContractsFrame } from './contracts-frame';

@Component({
  imports: [ContractsFrame],
  template: `
    <app-contracts-frame heading="Entities" slug="qits" repo="r" [lookup]="lookup()">
      <p class="content">content</p>
    </app-contracts-frame>
  `,
})
class Host {
  readonly lookup = signal<BundleLookup>({ status: 'loading' });
}

const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('ContractsFrame', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/repositories/:repo/contracts', children: [] },
          { path: 'projects/:slug/repositories/:repo/entities', children: [] },
        ]),
        provideTestPlatformOrigins({}, { docs: 'https://docs.example' }),
      ],
    });
  });

  function render(lookup: BundleLookup) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.lookup.set(lookup);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the bundle, its docs link, the two lists and the content once found', async () => {
    // The open list's tab is marked current by its exit, from the router's URL.
    await TestBed.inject(Router).navigateByUrl('/projects/qits/repositories/r/entities');
    const element = render({
      status: 'loaded',
      site: { site: '@contracts/qits-r', version: '1.0', repository: 'r' },
    });
    expect(text(element.querySelector('h1'))).toBe('Entities');
    expect(text(element.querySelector('.site'))).toBe('@contracts/qits-r 1.0');
    expect(element.querySelector<HTMLAnchorElement>('a.docs')?.href).toBe(
      'https://docs.example/read/@contracts/qits-r/-/1.0',
    );
    const sections = [...element.querySelectorAll<HTMLAnchorElement>('a.section')];
    expect(
      sections.map((a) => [text(a), a.getAttribute('href'), a.getAttribute('aria-current')]),
    ).toEqual([
      ['Contracts', '/projects/qits/repositories/r/contracts', null],
      ['Entities', '/projects/qits/repositories/r/entities', 'page'],
    ]);
    expect(element.querySelector('.content')).not.toBeNull();
  });

  it('says why there is nothing to show, and hides the content', () => {
    let element = render({ status: 'none' });
    expect(text(element.querySelector('.none'))).toBe('No contracts bundle is published for r.');
    expect(element.querySelector('.content')).toBeNull();
    element = render({ status: 'unreadable', sites: ['@contracts/a', '@contracts/b'] });
    expect(text(element.querySelector('.unreadable'))).toBe(
      'Could not read @contracts/a, @contracts/b, so whether r publishes a contracts bundle is not known.',
    );
    element = render({ status: 'error' });
    expect(element.querySelector('[aria-label="Failed to load"]')).not.toBeNull();
  });
});
