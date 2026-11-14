import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { openRoute, provideAppRoute } from '../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';

/**
 * Screenshots of a project's Observability page inside the shell (`openRoute`), at the recorded
 * project's slug (qits-projects' "a project exists"). The page itself is blank for now and calls
 * no backend of its own, so the one screenshot holds the shell around the empty page; it changes
 * when the page is built up.
 */
describe('ProjectObservabilityPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows the blank page', async () => {
    const opened = await openRoute((project) => `/projects/${project.slug}/observability`);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('blank', { kind: 'NO_DATA' });
    await shootShellMenus(opened, 'blank', 'NO_DATA');
  });
});
