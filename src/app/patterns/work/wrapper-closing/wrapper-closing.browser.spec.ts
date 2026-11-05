import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { WRAPPER_CLOSINGS } from '../../../../testing/browser/recorded-work';
import { WrapperClosingLine } from './wrapper-closing';

/**
 * Screenshots of VERIFIED tickets' closing lines (qits-1873), one per ticket of qits-projects'
 * "a project with VERIFIED tickets in every wrapper verdict" (NO_REQUEST, IN_FLIGHT, CLOSING at
 * LIVE, CLOSING as the empty wrapper's withdrawal, UNPROVEN), and one for a ticket it does not
 * name, at the size the lists draw them. The open project is "a project exists"'s, the same frozen
 * id as the closings'.
 *
 * The lines are drawn on their own, not in the Acceptance list: no recorded work holds the
 * closings' tickets (their numbers are apart), and a recording is never re-keyed.
 */
const TICKETS = [
  'contract-00000001-1',
  'contract-00000001-2',
  'contract-00000001-3',
  'contract-00000001-4',
  'contract-00000001-5',
  'contract-00000001-6',
];

@Component({
  imports: [WrapperClosingLine],
  host: { class: 'flex w-[40rem] flex-col gap-2 p-4' },
  template: `
    @for (ticket of tickets; track ticket) {
      <p class="m-0 flex flex-wrap gap-1" [attr.data-ticket]="ticket">
        <app-wrapper-closing class="text-[0.6875rem]" [qualifiedId]="ticket" />
      </p>
    }
  `,
})
class EveryLine {
  readonly tickets = TICKETS;
}

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('WrapperClosingLine (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/closings', component: EveryLine }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('says how each verdict closes its ticket, linking the request', async () => {
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/closings`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    // Each line's effect asks for the closings once the project is known; one request for all.
    TestBed.tick();
    await settle();
    http
      .expectOne(`/projects/api/projects/${project.id}/wrapper-closings`)
      .flush(await goldenMaster(WRAPPER_CLOSINGS, 'listWrapperClosings'));
    await settle();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    const element = harness.routeNativeElement as HTMLElement;
    const lineOf = (ticket: string) =>
      page.elementLocator(element.querySelector(`[data-ticket="${ticket}"]`) as HTMLElement);
    const hrefOf = (ticket: string) =>
      element.querySelector(`[data-ticket="${ticket}"] a`)?.getAttribute('href');
    const requests = `/projects/${project.slug}/release-requests`;

    await expect
      .element(lineOf('contract-00000001-1'))
      .toHaveTextContent('Waits for its wrapper release request');
    await expect
      .element(lineOf('contract-00000001-2'))
      .toHaveTextContent('Closes with contract-00000001-contract-00000001-rr-1, pending');
    expect(hrefOf('contract-00000001-2')).toBe(
      `${requests}/contract-00000001-contract-00000001-rr-1`,
    );
    await expect
      .element(lineOf('contract-00000001-3'))
      .toHaveTextContent('Closes now: contract-00000001-contract-00000001-rr-2 finalized');
    expect(hrefOf('contract-00000001-3')).toBe(
      `${requests}/contract-00000001-contract-00000001-rr-2`,
    );
    await expect
      .element(lineOf('contract-00000001-4'))
      .toHaveTextContent('Closes now: nothing left to release');
    await expect
      .element(lineOf('contract-00000001-5'))
      .toHaveTextContent(
        'Its wrapper request contract-00000001-contract-00000001-rr-4 ended without proof, so it cannot close by itself',
      );
    expect(hrefOf('contract-00000001-5')).toBe(
      `${requests}/contract-00000001-contract-00000001-rr-4`,
    );
    await expect
      .element(lineOf('contract-00000001-6'))
      .toHaveTextContent('Closes once its release lands');
    await expect.element(page.elementLocator(element)).toMatchScreenshot('wrapper-closings');
  });
});
