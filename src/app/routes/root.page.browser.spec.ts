import { Location } from '@angular/common';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { openRoute, provideAppRoute, type OpenedRoute } from '../../testing/browser/app-route';

/**
 * The root page, opened through the app's routes (`openRoute`). It renders nothing and leaves at
 * once through its one declared outcome, `leave-root:projects` (epic qits-2000), which no element
 * triggers (`triggered: false`), so there is nothing to screenshot: the test reaches it and checks
 * that the picker takes the root's place in the history. The picker it leaves for is its own
 * spec's: the frame's project list is left to this spec, and every read is answered with an error
 * (`leftFor`).
 */
describe('RootPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /**
   * Lets the navigation finish, and answers every read the page it left for makes with a 404 (an
   * error answer is only a status). Answers in rounds, until a round leaves nothing open.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  it('leave-root projects: the root leaves for the project picker, replacing itself', async () => {
    const location = TestBed.inject(Location);
    const replaced = vi.spyOn(location, 'replaceState');
    const pushed = vi.spyOn(location, 'go');
    const opened = await openRoute('/', { projects: 'unanswered' });
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe('/projects');
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome} ${r.url}`)).toEqual([
      'leave-root:projects /projects',
    ]);
    // `replaceUrl`: the picker takes the root's place in the history, so Back never returns to it.
    expect(replaced.mock.calls.map(([path]) => path)).toContain('/projects');
    expect(pushed.mock.calls.map(([path]) => path)).not.toContain('/projects');
  });
});
