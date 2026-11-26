import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../testing/browser/app-route';

const ADMIN = 'a toggle is declared, asked by an admin';
const MALFORMED = 'a toggle is declared, sent malformed rules by an admin';
const STALE = "a toggle's rules changed since an admin read them";
const UNDECLARED = 'a toggle slug is not declared';
const TOGGLES = 'qits-toggles';
const SMOKE = '/toggles/api/toggles/toggles-smoke';
const RULES = `${SMOKE}/rules`;

/**
 * Screenshots of one toggle's rule editor (qits-2704) inside the shell, with no project open. Its
 * read (`getToggle`) is answered with qits-toggles' "a toggle is declared, asked by an admin" (the
 * smoke toggle at version 0, its one STATIC rule); a save (`putToggleRules`) with the same state's
 * answer (version 1), or refused: 409 from "a toggle's rules changed since an admin read them", 400
 * from "a toggle is declared, sent malformed rules by an admin" (the rule at position 0), and 403 (no
 * body). An undeclared slug is "a toggle slug is not declared" (404).
 */
describe('TogglePage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  async function open(): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    const opened = await openRoute('/toggles/toggles-smoke');
    http.expectOne(SMOKE).flush(await goldenMaster(ADMIN, 'getToggle', TOGGLES));
    await opened.settled();
    return opened;
  }

  /** Presses Save and answers it with `flush`. */
  async function save(
    opened: OpenedRoute,
    flush: (request: ReturnType<HttpTestingController['expectOne']>) => Promise<void> | void,
  ) {
    const view = page.elementLocator(opened.page);
    await view.getByRole('button', { name: 'Save' }).click();
    await opened.idle();
    const request = http.expectOne((r) => r.method === 'PUT' && r.url === RULES);
    await flush(request);
    await opened.settled();
    return request;
  }

  it('shows the ordered rules, the default last, and edits them in a draft', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { name: 'toggles-smoke', exact: true }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('version 0');
    const rules = view.getByRole('list', { name: 'Rules' });
    expect(rules.getByRole('listitem').elements()).toHaveLength(1);
    await expect.element(rules.getByRole('listitem', { name: 'Rule 1: Default' })).toBeVisible();
    // The default cannot be removed or moved.
    expect(rules.getByRole('button', { name: 'Remove' }).elements()).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('rules', { kind: 'DATA' });

    await view.getByRole('button', { name: 'Add user rule' }).click();
    await view.getByRole('button', { name: 'Add time rule' }).click();
    await view.getByRole('textbox', { name: /Subjects/ }).fill('tok-project-agent-qits-developer');
    await view.getByRole('textbox', { name: /From/ }).fill('2026-12-01T00:00:00Z');
    expect(rules.getByRole('listitem').elements()).toHaveLength(3);
    await expect.element(rules.getByRole('listitem', { name: 'Rule 3: Default' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('draft', { kind: 'DATA' });

    const request = await save(opened, async (r) =>
      r.flush(await goldenMaster(ADMIN, 'putToggleRules', TOGGLES)),
    );
    expect(request.request.body).toEqual({
      version: 0,
      rules: [
        { kind: 'USER', value: true, userSubjects: ['tok-project-agent-qits-developer'] },
        { kind: 'TIME', value: true, afterInstant: '2026-12-01T00:00:00Z' },
        { kind: 'STATIC', value: false },
      ],
    });
    await expect.element(view.getByRole('status')).toMatchTextContent('Saved.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('saved', { kind: 'DATA' });
  });

  it('says someone else changed the rules (409) and reloads them', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await save(opened, async (r) =>
      r.flush(await goldenMaster(STALE, 'putToggleRules', TOGGLES), {
        status: 409,
        statusText: 'Conflict',
      }),
    );
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Someone else changed these rules since you opened them.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('conflict', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Reload' }).click();
    await opened.idle();
    http.expectOne(SMOKE).flush(await goldenMaster(ADMIN, 'getToggle', TOGGLES));
    await opened.settled();
    expect(view.getByRole('alert').elements()).toHaveLength(0);
  });

  it('says changing rules needs qits:admin or the delivery desk (403)', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await save(opened, (r) => r.flush(null, { status: 403, statusText: 'Forbidden' }));
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Changing rules needs qits:admin or the delivery desk.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('forbidden', { kind: 'ERROR' });
  });

  it('shows a 400 beside the rule it names', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await save(opened, async (r) =>
      r.flush(await goldenMaster(MALFORMED, 'putToggleRules', TOGGLES), {
        status: 400,
        statusText: 'Bad Request',
      }),
    );
    const first = view.getByRole('listitem', { name: 'Rule 1: Default' });
    await expect
      .element(first.getByRole('alert'))
      .toMatchTextContent('the STATIC rule must be the last one');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('says an undeclared slug is declared nowhere (404)', async () => {
    await page.viewport(1140, 900);
    const opened = await openRoute('/toggles/no-such-toggle');
    http
      .expectOne('/toggles/api/toggles/no-such-toggle')
      .flush(await goldenMaster(UNDECLARED, 'getToggle', TOGGLES), {
        status: 404,
        statusText: 'Not Found',
      });
    await opened.settled();
    await expect
      .element(page.elementLocator(opened.page).getByRole('status'))
      .toMatchTextContent('No toggle is declared as “no-such-toggle”.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('undeclared', { kind: 'NO_DATA' });
  });
});
