import { Component, input, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedProject } from '$core/projects/selected-project';
import { goldenMaster, projectsGoldenMasters } from '../../../../testing/golden-masters';
import { WrapperClosingLine } from './wrapper-closing';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/**
 * A VERIFIED ticket's closing line (qits-1873), on qits-projects' golden master "a project with
 * VERIFIED tickets in every wrapper verdict" (one ticket per verdict, and the two CLOSING ways),
 * read through the real `WrapperClosingsStore`. The open project is the recording's (its id).
 */
const STATE = 'a project with VERIFIED tickets in every wrapper verdict';
const PROJECT_ID = projectsGoldenMasters.operation(STATE, 'listWrapperClosings').params[
  'projectId'
];
const URL = `/projects/api/projects/${PROJECT_ID}/wrapper-closings`;

@Component({
  imports: [WrapperClosingLine],
  template: `<app-wrapper-closing [qualifiedId]="qualifiedId()" />`,
})
class OneLine {
  readonly qualifiedId = input.required<string>();
}

describe('WrapperClosingLine', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        {
          provide: SelectedProject,
          useValue: { project: signal({ id: PROJECT_ID }), slug: signal('qits') },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(qualifiedId: string) {
    const fixture = TestBed.createComponent(OneLine);
    fixture.componentRef.setInput('qualifiedId', qualifiedId);
    fixture.detectChanges();
    TestBed.tick();
    await settle();
    return fixture;
  }

  async function answered(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const line = (element: HTMLElement) => element.querySelector('span')!;
  const link = (element: HTMLElement) => element.querySelector('a')!;

  it.each([
    ['contract-00000001-1', 'Waits for its wrapper release request', null],
    [
      'contract-00000001-2',
      'Closes with contract-00000001-contract-00000001-rr-1, pending',
      '/projects/qits/release-requests/contract-00000001-contract-00000001-rr-1',
    ],
    [
      'contract-00000001-3',
      'Closes now: contract-00000001-contract-00000001-rr-2 finalized',
      '/projects/qits/release-requests/contract-00000001-contract-00000001-rr-2',
    ],
    ['contract-00000001-4', 'Closes now: nothing left to release', null],
    [
      'contract-00000001-5',
      'Its wrapper request contract-00000001-contract-00000001-rr-4 ended without proof, so it cannot close by itself',
      '/projects/qits/release-requests/contract-00000001-contract-00000001-rr-4',
    ],
    ['contract-00000001-6', 'Closes once its release lands', null],
  ])('%s: says “%s”, linking %s', async (ticket, words, href) => {
    const fixture = await render(ticket);
    http.expectOne(URL).flush(goldenMaster(STATE, 'listWrapperClosings'));
    await answered(fixture);
    const element = fixture.nativeElement as HTMLElement;
    expect(line(element).textContent).toBe(words);
    // Hidden by class while the line names no request, so its href then leads nowhere it shows.
    if (href !== null) expect(link(element).getAttribute('href')).toBe(href);
    expect(link(element).dataset['qitsOutcome']).toBe('open-closing-request:open');
    expect(link(element).classList.contains('hidden')).toBe(href === null);
    expect(line(element).classList.contains('text-warning')).toBe(ticket === 'contract-00000001-5');
  });

  it('says “waiting on approval” for a request waiting on one', async () => {
    const fixture = await render('contract-00000001-2');
    // Derived from the recording: its IN_FLIGHT row's approval set to WAITING, which no state
    // records yet.
    const recorded = goldenMaster(STATE, 'listWrapperClosings');
    const closings = recorded.closings.map((c: { ticket: string }) =>
      c.ticket === 'contract-00000001-2' ? { ...c, approval: 'WAITING' } : c,
    );
    http.expectOne(URL).flush({ ...recorded, closings });
    await answered(fixture);
    expect(line(fixture.nativeElement).textContent).toBe(
      'Closes with contract-00000001-contract-00000001-rr-1, waiting on approval',
    );
  });

  it('keeps the generic line while the closings load and after they failed', async () => {
    const fixture = await render('contract-00000001-2');
    expect(line(fixture.nativeElement).textContent).toBe('Closes once its release lands');
    http.expectOne(URL).flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    expect(line(fixture.nativeElement).textContent).toBe('Closes once its release lands');
  });

  it('asks once for the project however many lines show', async () => {
    const first = await render('contract-00000001-1');
    const second = await render('contract-00000001-2');
    http.expectOne(URL).flush(goldenMaster(STATE, 'listWrapperClosings'));
    await answered(first);
    await answered(second);
    expect(line(second.nativeElement).textContent).toContain('pending');
  });
});
