import { Component, input } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { provideRouter, Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { commands, page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { DomainEvents, EVENT_SOURCE } from '$core/events/domain-events';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { WorkInspiration } from './work-inspiration';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const IDEAS = 'a project with ideas';

/**
 * Screenshots of a work item's inspiration (epic qits-888), 40rem wide, on "a project with ideas"'
 * recordings (qits-2039): the item is its `getWork`, an epic that names the idea inspiring it
 * (`inspiredBy`), and the idea's title is that idea's `getIdea`, as the work item page reads both.
 *
 * Its link is a declared exit (`open-work-inspiration` `open`, epic qits-2000), shown by
 * `inspired-by` and followed once, to a stub of the idea's page.
 */
@Component({
  imports: [WorkInspiration],
  host: { class: 'block w-[40rem] p-4' },
  template: `
    <app-work-inspiration
      slug="contract-00000001"
      [projectId]="item().projectId"
      [qualifiedId]="item().qualifiedId"
      [archetype]="item().archetype"
      [inspiredBy]="item().inspiredBy"
    />
  `,
})
class Inspired {
  readonly item = input.required<{
    projectId: string;
    qualifiedId: string;
    archetype: string;
    inspiredBy: string;
  }>();
}

describe('WorkInspiration (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/ideas/detail/:ideaId', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideTestPlatformOrigins(),
        // No live stream in a screenshot: the real DomainEvents, on a stream that never connects.
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
        // The idea's `refreshOn` (qits-2146) follows that stream.
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The recorded epic's inspiration, its idea's title read from the recording. */
  async function shown() {
    const item = await goldenMaster(IDEAS, 'getWork');
    const idea = await goldenMaster(IDEAS, 'getIdea');
    expect(item.inspiredBy).toBe(idea.id);
    const fixture = TestBed.createComponent(Inspired);
    fixture.componentRef.setInput('item', item);
    fixture.detectChanges();
    await settle();
    http.expectOne(`/projects/api/ideas/${idea.id}`).flush(idea);
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    const locator = page.elementLocator(fixture.nativeElement as HTMLElement);
    await expect.element(locator).toMatchTextContent(`Inspired by ${idea.title}`);
    return { locator, idea };
  }

  it('inspired-by', async () => {
    const { locator } = await shown();
    await commands.parkPointer();
    await expect.element(locator).toMatchScreenshot('inspired-by', { kind: 'DATA' });
  });

  it('open-work-inspiration open: the “Inspired by” link opens the idea', async () => {
    const { locator, idea } = await shown();
    await userEvent.click(locator.getByRole('link', { name: idea.title }));
    await settle();
    expect(TestBed.inject(Router).url).toBe(`/projects/contract-00000001/ideas/detail/${idea.id}`);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-work-inspiration:open',
    ]);
  });
});
