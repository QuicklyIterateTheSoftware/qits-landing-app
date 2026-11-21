import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { client as artifactsClient } from '../../../../../../api/artifacts/client.gen';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

const EVERY_KIND = 'a docs catalog of every kind';

if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

/**
 * Screenshots of the docs reader's old address (qits-2486) inside the shell: it reads
 * qits-artifacts' "a docs catalog of every kind" and replaces itself with the reader under the
 * site's publisher (`follow-moved-docs-site` `reader`, `version`): `@contracts/qits-ci` is
 * `qits-ci-service`'s. `qits-storybook`, whose newest version names no repository, says so and
 * links the Repositories (`repositories`).
 */
describe('DocsReadRedirectPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  async function render(rest: string): Promise<OpenedRoute> {
    await page.viewport(1140, 800);
    const opened = await openRoute((project) => `/projects/${project.slug}/docs/read/${rest}`);
    http
      .expectOne('/artifacts/docs/docs')
      .flush(await goldenMaster(EVERY_KIND, 'listDocsSites', 'qits-artifacts'));
    await opened.settled();
    return opened;
  }

  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const pending = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of pending) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = pending.length ? 0 : quiet + 1;
    }
  }

  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('follow-moved-docs-site reader: moves to the reader under the site’s publisher', async () => {
    const opened = await render('@contracts%2Fqits-ci');
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/qits-ci-service/docs/@contracts%2Fqits-ci`,
    );
    expect(reached()).toEqual(['follow-moved-docs-site:reader']);
  });

  it('follow-moved-docs-site version: keeps the version and the query', async () => {
    const opened = await render('@contracts/qits-ci/-/1?category=a');
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/repositories/qits-ci-service/docs/@contracts%2Fqits-ci/-/1?category=a`,
    );
    expect(reached()).toEqual(['follow-moved-docs-site:version']);
  });

  it('says a site no repository published has no page, and links the Repositories', async () => {
    const opened = await render('qits-storybook');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view)
      .toMatchTextContent('No repository is named as the publisher of qits-storybook');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('orphan', { kind: 'NO_DATA' });
    await shootShellMenus(opened, 'orphan');
    await view.getByRole('link', { name: 'Repositories' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/repositories`);
    expect(reached()).toEqual(['follow-moved-docs-site:repositories']);
  });
});
