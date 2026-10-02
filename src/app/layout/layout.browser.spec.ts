import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { Layout } from './layout';

/** A page with fixed text, so the screenshots show the layout and nothing that loads. */
@Component({ selector: 'app-test-page', template: `<p>Page content</p>` })
class TestPage {}

/**
 * Screenshots of the layout in a real browser: the wide sidebar, and the narrow burger closed and
 * open. It calls no backend.
 */
describe('Layout (screenshots)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '', component: TestPage }])],
    });
  });

  afterEach(async () => {
    await page.viewport(800, 600);
  });

  async function render() {
    const fixture = TestBed.createComponent(Layout);
    await TestBed.inject(Router).navigateByUrl('/');
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, layout: page.elementLocator(fixture.nativeElement) };
  }

  it('shows the sidebar beside the page on a wide screen', async () => {
    const { layout } = await render();
    await expect.element(layout).toHaveTextContent('Page content');
    await expect.element(layout).toMatchScreenshot('wide');
  });

  it('hides the sidebar behind the burger on a narrow screen', async () => {
    await page.viewport(400, 600);
    const { layout } = await render();
    await expect.element(layout).toMatchScreenshot('narrow');
  });

  it('opens the sidebar from the burger on a narrow screen', async () => {
    await page.viewport(400, 600);
    const { fixture, layout } = await render();
    await userEvent.click(page.getByRole('button', { name: 'Navigation' }));
    fixture.detectChanges();
    await expect.element(page.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect.element(layout).toMatchScreenshot('narrow-open');
  });
});
