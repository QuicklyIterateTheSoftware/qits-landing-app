import { Component, input, type Type } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { commands, page, userEvent } from 'vitest/browser';
import type { ContractsSite } from '$core/ui-builder/contracts-catalog';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import type { FreezeRecord } from '$core/ui-builder/routes-manifest';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { expectUnclipped } from '../../../../testing/browser/unclipped';
import { GITHOST, INDEX, PROJECTION } from '../../../../testing/browser/contracts-bundles';
import { provideHeyApiClient } from '../../../api/artifacts/client/client.gen';
import { client as artifactsClient } from '../../../api/artifacts/client.gen';
import { CallDetails, type CallEntity } from './call-details';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/**
 * Screenshots of a call's popover in the UI builder (qits-1999), against qits-2041's recordings of
 * qits-githost's contracts (`contracts-bundles.ts`): the site and its index from "a published
 * contracts bundle with a golden-master index" (`@contracts/qits-githost` 2100.1.0, naming
 * qits-githost-service), the call that index records in `a git project with a repository`
 * (`getGitRepository`), and the entity its map ("a published contracts bundle with a projection
 * entity") says the operation hands out, GitRepository. No recording holds the recorded response
 * itself, so its read is refused and the popover says so. The slug is the recorded project's ("a
 * project exists").
 *
 * The `column` cases put the call in what the UI builder's Calls panel is at 1280px: a 20rem column
 * at the window's right edge that scrolls (`overflow-y: auto`), out of which the 28rem popover
 * sticks (qits-2081). It is drawn whole, below the call or, the call scrolled to the column's
 * bottom, above it.
 *
 * The popover's links are declared exits (`open-call-contract`, epic qits-2000), shown by `open`
 * and followed once each, to stubs of the pages: the provider state's (`state`) and the entity's
 * (`entity`).
 */
@Component({
  imports: [CallDetails],
  host: { class: 'block h-[36rem] w-[32rem] p-4' },
  template: `<app-call-details
    [call]="call()"
    [site]="site()"
    [entities]="entities()"
    [project]="project()"
  />`,
})
class Popover {
  readonly call = input.required<FreezeRecord>();
  readonly site = input.required<ContractsSite>();
  readonly entities = input.required<readonly CallEntity[]>();
  readonly project = input.required<string>();
}

/** The call in a 20rem column at the window's right edge that scrolls, room above and below it. */
@Component({
  imports: [CallDetails],
  host: { class: 'fixed inset-y-0 right-0 block w-80 overflow-y-auto border-l' },
  template: `<div class="h-[60rem]"></div>
    <app-call-details
      [call]="call()"
      [site]="site()"
      [entities]="entities()"
      [project]="project()"
    />
    <div class="h-[60rem]"></div>`,
})
class Column {
  readonly call = input.required<FreezeRecord>();
  readonly site = input.required<ContractsSite>();
  readonly entities = input.required<readonly CallEntity[]>();
  readonly project = input.required<string>();
}

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

describe('CallDetails (screenshots)', () => {
  let http: HttpTestingController;
  let slug: string;

  beforeEach(async () => {
    slug = (await goldenMaster('a project exists', 'getProject')).project.slug;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/repositories/:repo/contracts/:state', children: [] },
          { path: 'projects/:slug/repositories/:repo/entities/:entity', children: [] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(artifactsClient),
        provideTestPlatformOrigins({}, { docs: 'https://docs.example' }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /**
   * The popover of githost's recorded call in `host`, opened, its index answered; `beforeOpen` has
   * the host's element first.
   */
  async function opened(
    host: Type<Popover | Column> = Popover,
    beforeOpen?: (element: HTMLElement) => void,
  ) {
    const versions = await goldenMaster(INDEX, 'listDocsVersions', 'qits-artifacts');
    const index = await goldenMaster(INDEX, 'getDocsFile', 'qits-artifacts');
    const map = await goldenMaster(PROJECTION, 'getDocsFile', 'qits-artifacts');
    const state = index.states.find((s: { operations: unknown[] }) =>
      s.operations.some((op) => (op as { operationId: string }).operationId === 'getGitRepository'),
    );
    const entity = map.entities.find(
      (e: { marking: string; operations: { operationId: string }[] }) =>
        e.marking === 'domain' && e.operations.some((op) => op.operationId === 'getGitRepository'),
    );
    const fixture = TestBed.createComponent(host);
    fixture.componentRef.setInput('call', {
      provider: GITHOST,
      state: state.name,
      operationId: 'getGitRepository',
    });
    fixture.componentRef.setInput('site', {
      site: versions.name,
      version: versions.versions[0].version,
      repository: versions.versions[0].metadata['git.repository.name'],
    });
    fixture.componentRef.setInput('entities', [
      {
        key: `${GITHOST}#${entity.entity}`,
        name: entity.entity.split('.').pop(),
        repository: GITHOST,
        entity: entity.entity,
      },
    ]);
    fixture.componentRef.setInput('project', slug);
    fixture.detectChanges();
    const locator = page.elementLocator(fixture.nativeElement as HTMLElement);
    beforeOpen?.(fixture.nativeElement as HTMLElement);
    await locator.getByRole('button', { name: /getGitRepository/ }).click();
    await settle();
    http.expectOne((req) => req.url.endsWith('/golden-masters/index.json')).flush(index);
    // The popover's effect starts the recorded response's read once the index is drawn (qits-2146:
    // a `qitsResource`, open until answered, so `whenStable()` waits for it): run it first.
    for (let i = 0; i < 3; i++) {
      await settle();
      fixture.detectChanges();
    }
    // The recorded response: no recording holds it.
    for (const request of http.match((req) => req.url.endsWith('/getGitRepository.json'))) {
      request.flush(null, { status: 404, statusText: 'Not Found' });
    }
    await settle();
    fixture.detectChanges();
    await fixture.whenStable();
    return { locator, state, entity };
  }

  /** The outcomes recorded so far, as `interaction:outcome`. */
  const fired = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('open', async () => {
    const { locator, state } = await opened();
    await expect.element(locator.getByRole('link', { name: state.name })).toBeVisible();
    await expect
      .element(locator.getByRole('link', { name: 'Open GitRepository entity page' }))
      .toBeVisible();
    await expect.element(locator).toMatchTextContent('Could not read the recorded response.');
    await commands.parkPointer();
    await expect.element(locator).toMatchScreenshot('open', { kind: 'DATA' });
  });

  it('column: the popover sticks out of the scrolling column whole, below the call', async () => {
    await page.viewport(1280, 800);
    const { locator } = await opened(Column, (column) => {
      const call = column.querySelector('app-call-details')!;
      column.scrollTop = (call as HTMLElement).offsetTop - 200;
    });
    const dialog = locator.getByRole('dialog').element();
    await expect.element(locator.getByRole('dialog')).toBeVisible();
    await expect.poll(() => dialog.dataset['floatingSide']).toBe('below');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expectUnclipped(dialog);
    const trigger = locator.getByRole('button', { name: /getGitRepository/ }).element();
    expect(dialog.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      trigger.getBoundingClientRect().bottom,
    );
    // Wider than the column: it reaches out of it, to the left.
    const column = (locator.element() as HTMLElement).getBoundingClientRect();
    expect(dialog.getBoundingClientRect().left).toBeLessThan(column.left);
  });

  it('column: with the call at the column’s bottom, the popover opens above it, whole', async () => {
    await page.viewport(1280, 800);
    const { locator } = await opened(Column, (column) => {
      const call = column.querySelector<HTMLElement>('app-call-details')!;
      column.scrollTop = call.offsetTop + call.offsetHeight - column.clientHeight;
    });
    const dialog = locator.getByRole('dialog').element();
    await expect.element(locator.getByRole('dialog')).toBeVisible();
    await expect.poll(() => dialog.dataset['floatingSide']).toBe('above');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expectUnclipped(dialog);
    const trigger = locator.getByRole('button', { name: /getGitRepository/ }).element();
    expect(dialog.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      trigger.getBoundingClientRect().top,
    );
  });

  it('closes on Escape, its call focused again, and on a click outside', async () => {
    const { locator } = await opened();
    await expect.element(locator.getByRole('dialog')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect
      .element(locator.getByText('Could not read the recorded response.'))
      .not.toBeInTheDocument();
    const call = locator.getByRole('button', { name: /getGitRepository/ });
    await expect.element(call).toHaveFocus();

    // Opened again, it reads nothing again; a click beside it closes it.
    await call.click();
    await expect.element(locator.getByRole('dialog')).toBeVisible();
    document.body.click();
    await expect
      .element(locator.getByText('Could not read the recorded response.'))
      .not.toBeInTheDocument();
  });

  it('open-call-contract state: the state’s name opens its page', async () => {
    const { locator, state } = await opened();
    await userEvent.click(locator.getByRole('link', { name: state.name }));
    await settle();
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${slug}/repositories/${GITHOST}/contracts/${state.slug}`,
    );
    expect(fired()).toEqual(['open-call-contract:state']);
  });

  it('open-call-contract entity: an entity’s ↗ opens its page', async () => {
    const { locator, entity } = await opened();
    await userEvent.click(locator.getByRole('link', { name: 'Open GitRepository entity page' }));
    await settle();
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${slug}/repositories/${GITHOST}/entities/${entity.entity}`,
    );
    expect(fired()).toEqual(['open-call-contract:entity']);
  });
});
