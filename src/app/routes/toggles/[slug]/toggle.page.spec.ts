import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { client as togglesClient } from '../../../api/toggles/client.gen';
import { provideHeyApiClient } from '../../../api/toggles/client/client.gen';
import { togglesGoldenMaster } from '../../../../testing/golden-masters';
import { TogglePage } from './toggle.page';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const ADMIN = 'a toggle is declared, asked by an admin';
const SMOKE = '/toggles/api/toggles/toggles-smoke';
const RULES = `${SMOKE}/rules`;

/**
 * One toggle's rule editor (qits-2704) on qits-toggles' recordings: the smoke toggle read ("a toggle
 * is declared, asked by an admin"), a draft edited and saved (the whole list with the version read),
 * and each refusal (409 with Reload, 403, 400 beside its rule) and an undeclared slug (404). Its
 * screenshots are its browser spec's.
 */
describe('TogglePage', () => {
  let http: HttpTestingController;

  function configure(slug: string) {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ slug })) } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(togglesClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => http.verify());

  async function ticked(fixture: { detectChanges(): void }) {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      await settle();
    }
    fixture.detectChanges();
  }

  async function opened() {
    configure('toggles-smoke');
    const fixture = TestBed.createComponent(TogglePage);
    fixture.detectChanges();
    await ticked(fixture);
    http.expectOne(SMOKE).flush(togglesGoldenMaster(ADMIN, 'getToggle'));
    await ticked(fixture);
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** The alert a person sees: not the hidden load failure, which is an alert too. */
  const alert = (element: Element) =>
    [...element.querySelectorAll('[role="alert"]')].find((found) => !found.closest('.hidden')) ??
    null;

  const button = (element: HTMLElement, label: string) =>
    [...element.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement;

  async function save(
    fixture: { detectChanges(): void },
    element: HTMLElement,
    answer: (request: ReturnType<HttpTestingController['expectOne']>) => void,
  ) {
    button(element, 'Save').click();
    await ticked(fixture);
    const request = http.expectOne((r) => r.method === 'PUT' && r.url === RULES);
    answer(request);
    await ticked(fixture);
    return request;
  }

  it('shows the default last, unremovable, and saves the whole draft with its version', async () => {
    const { fixture, element } = await opened();
    expect([...element.querySelectorAll('li')].map((li) => li.getAttribute('aria-label'))).toEqual([
      'Rule 1: Default',
    ]);
    expect(button(element, 'Remove')).toBeUndefined();

    button(element, 'Add user rule').click();
    fixture.detectChanges();
    const subjects = element.querySelector('textarea') as HTMLTextAreaElement;
    subjects.value = 'alice, tok-agent-x';
    subjects.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect([...element.querySelectorAll('li')].map((li) => li.getAttribute('aria-label'))).toEqual([
      'Rule 1: User',
      'Rule 2: Default',
    ]);

    const request = await save(fixture, element, (r) =>
      r.flush(togglesGoldenMaster(ADMIN, 'putToggleRules')),
    );
    expect(request.request.body).toEqual({
      version: 0,
      rules: [
        { kind: 'USER', value: true, userSubjects: ['alice', 'tok-agent-x'] },
        { kind: 'STATIC', value: false },
      ],
    });
    expect(text(element.querySelector('[role="status"]'))).toBe('Saved.');
    // The answer's rules (version 1: a USER, a TIME and the default) replace the draft.
    expect(element.querySelectorAll('li')).toHaveLength(3);
  });

  it('says a stale save someone else made first (409), and Reload reads the rules again', async () => {
    const { fixture, element } = await opened();
    await save(fixture, element, (r) =>
      r.flush(
        togglesGoldenMaster("a toggle's rules changed since an admin read them", 'putToggleRules'),
        {
          status: 409,
          statusText: 'Conflict',
        },
      ),
    );
    expect(text(alert(element))).toContain(
      'Someone else changed these rules since you opened them.',
    );
    button(element, 'Reload').click();
    await ticked(fixture);
    http.expectOne(SMOKE).flush(togglesGoldenMaster(ADMIN, 'getToggle'));
    await ticked(fixture);
    expect(alert(element)).toBeNull();
  });

  it('says changing rules needs qits:admin or the delivery desk (403)', async () => {
    const { fixture, element } = await opened();
    await save(fixture, element, (r) => r.flush(null, { status: 403, statusText: 'Forbidden' }));
    expect(text(alert(element))).toBe('Changing rules needs qits:admin or the delivery desk.');
  });

  it('shows a 400 beside the rule at its position', async () => {
    const { fixture, element } = await opened();
    await save(fixture, element, (r) =>
      r.flush(
        togglesGoldenMaster(
          'a toggle is declared, sent malformed rules by an admin',
          'putToggleRules',
        ),
        { status: 400, statusText: 'Bad Request' },
      ),
    );
    const first = element.querySelector('li[aria-label="Rule 1: Default"]');
    expect(text(first?.querySelector('[role="alert"]'))).toBe(
      'the STATIC rule must be the last one',
    );
  });

  it('says an undeclared slug is declared nowhere (404)', async () => {
    configure('no-such-toggle');
    const fixture = TestBed.createComponent(TogglePage);
    fixture.detectChanges();
    await ticked(fixture);
    http
      .expectOne('/toggles/api/toggles/no-such-toggle')
      .flush(togglesGoldenMaster('a toggle slug is not declared', 'getToggle'), {
        status: 404,
        statusText: 'Not Found',
      });
    await ticked(fixture);
    expect(text((fixture.nativeElement as HTMLElement).querySelector('[role="status"]'))).toContain(
      'No toggle is declared as “no-such-toggle”.',
    );
  });
});
