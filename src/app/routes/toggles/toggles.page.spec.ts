import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client as togglesClient } from '../../api/toggles/client.gen';
import { provideHeyApiClient } from '../../api/toggles/client/client.gen';
import type { ToggleRows } from '$core/toggles/toggles.consumes';
import { workLink } from '$core/work/work-briefs';
import { togglesGoldenMaster } from '../../../testing/golden-masters';
import { TogglesPage } from './toggles.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const LIST = '/toggles/api/toggles';

/** The recorded list: the smoke toggle, its one STATIC rule answering false, never used, no ticket. */
const recorded = (): ToggleRows =>
  togglesGoldenMaster<ToggleRows>('a toggle is declared, asked by an admin', 'getToggles');

/** The same toggle, last used at the frozen instant, its removal ticket `qits-1` (qits-2726). */
const retiring = (): ToggleRows =>
  togglesGoldenMaster<ToggleRows>(
    'a toggle has an open removal ticket, asked by an admin',
    'getToggles',
  );

/**
 * The Toggles list (qits-2704) on answers derived from qits-toggles' recording "a toggle is declared,
 * asked by an admin": each toggle with its rules in brief, no toggle declared (the recording with no
 * rows), and a failed read; and on "a toggle has an open removal ticket, asked by an admin"
 * (qits-2726): its last use and its removal ticket as a link, or as text when it is an entity uuid.
 * Its screenshots are its browser spec's.
 */
describe('TogglesPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(togglesClient),
        workLink,
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function ticked() {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      await settle();
    }
  }

  async function shown(
    answer: (request: ReturnType<HttpTestingController['expectOne']>) => void,
  ): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(TogglesPage);
    fixture.detectChanges();
    await ticked();
    answer(http.expectOne(LIST));
    await ticked();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('lists each toggle with its description and its rules in brief', async () => {
    const element = await shown((request) => request.flush(recorded()));
    const cells = [...element.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => text(cell)),
    );
    expect(cells).toEqual([
      [
        'toggles-smoke',
        'Smoke toggle of qits-toggles itself: proves evaluation and, since no pact uses it, retirement live.',
        'else off',
        'never by a deployed pact',
        '',
      ],
    ]);
    expect(text(element.querySelector('[data-lede]'))).toBe('1 declared toggle');
    expect(element.querySelector('tbody a')?.getAttribute('href')).toBe('/toggles/toggles-smoke');
    expect(element.querySelector('[data-removal-ticket] a')).toBeNull();
  });

  it('shows when a deployed pact last used a toggle, and links its removal ticket', async () => {
    const element = await shown((request) => request.flush(retiring()));
    expect(text(element.querySelector('[data-last-used]'))).toBe('1 Jan 2026 00:00:00Z');
    const ticket = element.querySelector('[data-removal-ticket] a');
    expect(text(ticket)).toBe('qits-1');
    expect(ticket?.getAttribute('href')).toBe('/projects/qits/work/detail/qits-1');
  });

  it('shows a removal ticket that is an entity uuid as text, without a link', async () => {
    // The recording with its ticket swapped for the entity uuid qits-toggles falls back to.
    const element = await shown((request) =>
      request.flush(
        retiring().map((row) => ({
          ...row,
          removalTicket: '00000000-0000-4000-8000-000000000001',
        })),
      ),
    );
    const cell = element.querySelector('[data-removal-ticket]');
    expect(text(cell)).toBe('00000000-0000-4000-8000-000000000001');
    expect(cell?.querySelector('a')).toBeNull();
  });

  it('offers no way to create a toggle, and says where one is declared when none is', async () => {
    // The recording with its rows dropped: nothing declared.
    const element = await shown((request) => request.flush(recorded().slice(0, 0)));
    expect(text(element.querySelector('[role="status"]'))).toBe(
      'No toggle is declared. A toggle is added by declaring it in qits-toggles-service’s code, not here.',
    );
    const labels = [...element.querySelectorAll('button')]
      .filter((shown) => !shown.closest('.hidden'))
      .map((shown) => text(shown));
    expect(labels).toEqual(['Refresh']);
  });

  it('says the toggles cannot be read when the read fails', async () => {
    const element = await shown((request) =>
      request.flush(null, { status: 500, statusText: 'Internal Server Error' }),
    );
    expect(text(element)).toContain('The toggles cannot be read right now.');
  });
});
