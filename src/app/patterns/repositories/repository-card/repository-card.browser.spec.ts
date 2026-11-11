import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { commands, page, userEvent } from 'vitest/browser';
import type { RepositoryEntry } from '$core/repositories/repositories.consumes';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { RepositoryCard } from './repository-card';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const REPOSITORIES = 'a project with repositories in components';

/** The recorded repositories whose cards link pages: a frontend's UI builder, a service's lists. */
const LINKED = ['contract-frontend', 'contract-service'];

/**
 * Screenshots of the repository cards that link pages, 40rem wide, from qits-projects' "a project
 * with repositories in components" (`listProjectRepositories`): `contract-frontend` (FRONTEND), whose
 * card links its UI builder, and `contract-service` (SERVICE), whose card links its contracts and
 * entities. The slug is the recorded project's ("a project exists").
 *
 * Each link is a declared exit (`open-repository-pages`, epic qits-2000), shown by `linked` and
 * followed once, to a stub of the page it opens.
 */
@Component({
  imports: [RepositoryCard],
  host: { class: 'grid w-[40rem] grid-cols-2 gap-4 p-4' },
  template: `
    @for (entry of entries(); track entry.repository?.id) {
      <app-repository-card [entry]="entry" [slug]="slug()" />
    }
  `,
})
class Cards {
  readonly entries = input.required<readonly RepositoryEntry[]>();
  readonly slug = input.required<string>();
}

describe('RepositoryCard (screenshots)', () => {
  let slug: string;

  beforeEach(async () => {
    slug = (await goldenMaster('a project exists', 'getProject')).project.slug;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/repositories/:repo/ui-builder', children: [] },
          { path: 'projects/:slug/repositories/:repo/contracts', children: [] },
          { path: 'projects/:slug/repositories/:repo/entities', children: [] },
        ]),
      ],
    });
  });

  /** The cards of the recorded frontend and service. */
  async function shown() {
    const listed = await goldenMaster(REPOSITORIES, 'listProjectRepositories');
    const fixture = TestBed.createComponent(Cards);
    fixture.componentRef.setInput(
      'entries',
      listed.entries.filter((e: RepositoryEntry) => LINKED.includes(e.repository?.name ?? '')),
    );
    fixture.componentRef.setInput('slug', slug);
    fixture.detectChanges();
    await fixture.whenStable();
    return page.elementLocator(fixture.nativeElement as HTMLElement);
  }

  /** The outcomes recorded so far, as `interaction:outcome`. */
  const fired = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('linked', async () => {
    const locator = await shown();
    await expect.element(locator.getByRole('link', { name: 'UI builder →' })).toBeVisible();
    await expect.element(locator.getByRole('link', { name: 'Contracts →' })).toBeVisible();
    await expect.element(locator.getByRole('link', { name: 'Entities →' })).toBeVisible();
    await commands.parkPointer();
    await expect.element(locator).toMatchScreenshot('linked', { kind: 'DATA' });
  });

  it('open-repository-pages uiBuilder: a frontend’s card opens its UI builder', async () => {
    const locator = await shown();
    await userEvent.click(locator.getByRole('link', { name: 'UI builder →' }));
    await settle();
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${slug}/repositories/contract-frontend/ui-builder`,
    );
    expect(fired()).toEqual(['open-repository-pages:uiBuilder']);
  });

  it('open-repository-pages contracts: a service’s card opens its contracts', async () => {
    const locator = await shown();
    await userEvent.click(locator.getByRole('link', { name: 'Contracts →' }));
    await settle();
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${slug}/repositories/contract-service/contracts`,
    );
    expect(fired()).toEqual(['open-repository-pages:contracts']);
  });

  it('open-repository-pages entities: a service’s card opens its entity map', async () => {
    const locator = await shown();
    await userEvent.click(locator.getByRole('link', { name: 'Entities →' }));
    await settle();
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${slug}/repositories/contract-service/entities`,
    );
    expect(fired()).toEqual(['open-repository-pages:entities']);
  });
});
