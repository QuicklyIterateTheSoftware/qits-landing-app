import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { IN_PROGRESS_VIEW_KEY } from '$core/work/in-progress-view';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';

/**
 * Screenshots of the work section's tabs inside the shell (`openRoute`), over the real tab pages
 * (In Progress, Archive), answered with qits-projects' golden masters: the project list as
 * recorded, and "a project with work in every status" (one epic and one ticket per status) for the
 * counts. The layout also loads the open workspaces, answered by `openRoute` from qits-workspaces'
 * "a project with workspaces bound to work items"; In Progress reads the active agents, answered
 * from "a project with agents bound to work items" as in its own spec. The layout follows
 * transitions through the event stream; the stream here never connects.
 *
 * Each tab is a declared exit (`switch-work-tab`, epic qits-2000), shown by `tabs` and followed
 * once, from the Archive (the Archive's own from Refinement). The tab page it opens is its own
 * spec's: its reads are answered with an error (`leftFor`).
 *
 * The tabs stay at the top while the page scrolls, and what pins in the page pins below them
 * (qits-2077): shown on the In Progress board's inline view (stored before the page opens, as the
 * gear would have), the one board whose headings pin; no work page has page actions, so theirs is
 * checked by where they would pin. On a phone the tabs are a bar: the burger and the open page's
 * name, shown closed and with the burger's list open, whose links are the same exits.
 */

describe('WorkLayout (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    // As wide as the tabs were, plus the sidebar.
    await page.viewport(1040, 600);
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    localStorage.removeItem(IN_PROGRESS_VIEW_KEY);
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The section of the recorded project at `tab`, with its work requested. */
  async function shown(tab: string) {
    const opened = await openRoute((project) => `/projects/${project.slug}/work/${tab}`);
    if (tab === 'in-progress') {
      http
        .expectOne('/workspaces/api/agents?state=ACTIVE')
        .flush(
          await goldenMaster(
            'a project with agents bound to work items',
            'listAgents',
            'qits-workspaces',
          ),
        );
    }
    const work = http.expectOne(`/projects/api/projects/${opened.project.id}/work`);
    const layout = opened.frame.querySelector<HTMLElement>('app-work-layout')!;
    // A locator finds the element by what it shows when made, so make it once the page is drawn.
    return {
      opened,
      locate: () => page.elementLocator(layout),
      frame: page.elementLocator(opened.frame),
      work,
      project: opened.project,
    };
  }

  it('shows the tabs in workflow order, each with its count, no Campaigns or Milestones, and marks the current one', async () => {
    // Tall enough for the whole board below the tabs: the shell shows only what is in the viewport.
    await page.viewport(1040, 2000);
    const { opened, locate, frame, work, project } = await shown('in-progress');
    work.flush(await goldenMaster('a project with work in every status', 'listProjectWork'));
    await opened.settled();
    const element = locate();
    const tabs = element.getByRole('navigation', { name: 'Work' }).getByRole('link');
    await expect.element(tabs.nth(2)).toMatchTextContent('9');
    expect(tabs.elements().map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Refinement 2',
      'Schedule 4',
      'In Progress 9',
      'Acceptance 2',
      'Archive 4',
    ]);
    expect(tabs.elements().map((a) => a.getAttribute('href'))).toEqual([
      `/projects/${project.slug}/work/refinement`,
      `/projects/${project.slug}/work/schedule`,
      `/projects/${project.slug}/work/in-progress`,
      `/projects/${project.slug}/work/acceptance`,
      `/projects/${project.slug}/work/archive`,
    ]);
    await expect.element(tabs.nth(2)).toHaveAttribute('aria-current', 'page');
    await expect.element(tabs.nth(0)).not.toHaveAttribute('aria-current');
    await expect
      .element(element.getByRole('heading', { level: 1 }))
      .toMatchTextContent('In Progress');
    await expect.element(frame).toMatchScreenshot('tabs', { kind: 'DATA' });
  });

  // qits-2098: the underline is the `<li>`'s (`has-[[aria-current=page]]`), not the link's alone, so
  // it reaches across the gear, which sits beside the link inside the same `<li>`.
  it('underlines the active tab’s li, including the gear, and not an inactive one', async () => {
    const { opened, locate, work } = await shown('in-progress');
    work.flush(await goldenMaster('a project with work in every status', 'listProjectWork'));
    await opened.settled();
    const element = locate();
    const tabs = element.getByRole('navigation', { name: 'Work' }).getByRole('link');
    const activeLi = tabs.nth(2).element().closest('li')!;
    const inactiveLi = tabs.nth(0).element().closest('li')!;
    expect(getComputedStyle(activeLi).borderBottomColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(inactiveLi).borderBottomColor).toBe('rgba(0, 0, 0, 0)');
    await expect
      .element(
        page.elementLocator(activeLi).getByRole('button', { name: 'In Progress view settings' }),
      )
      .toBeVisible();
  });

  it('hides the counts while the work is loading', async () => {
    const { opened, locate, frame, work } = await shown('archive');
    const element = locate();
    const tabs = element.getByRole('navigation', { name: 'Work' }).getByRole('link');
    await expect.element(tabs.nth(4)).toHaveAttribute('aria-current', 'page');
    await expect.element(tabs.nth(0)).toHaveAccessibleName('Refinement');
    await expect.element(frame).toMatchScreenshot('loading', { kind: 'PENDING' });
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
  });

  // qits-2077: the row stays at the top of `<main>`, which scrolls on its own from 768px up.
  it('keeps the tabs at the top while the page scrolls, and pins the page’s headings below them', async () => {
    localStorage.setItem(IN_PROGRESS_VIEW_KEY, 'inline');
    await page.viewport(1440, 900);
    const { opened, locate, frame, work } = await shown('in-progress');
    work.flush(await goldenMaster('a project with work in every status', 'listProjectWork'));
    await opened.settled();
    const layout = locate().element();
    const row = layout.querySelector<HTMLElement>('[data-work-tabs]')!;
    const main = opened.frame.querySelector('main')!;
    const headings = opened.page.querySelector<HTMLElement>('[data-board-headings]')!;
    await expect.element(page.elementLocator(headings)).toBeVisible();
    // Past the page's heading and into the board.
    main.scrollTop = headings.getBoundingClientRect().top - main.getBoundingClientRect().top + 120;
    await expect.poll(() => main.scrollTop).toBeGreaterThan(0);
    await opened.idle();
    const top = (element: Element) => element.getBoundingClientRect().top;
    expect(top(row)).toBe(top(main));
    expect(Math.round(top(headings))).toBe(Math.round(row.getBoundingClientRect().bottom));
    // The page's actions (none on a work page) would pin there too.
    const actions = opened.page.querySelector('[data-page-actions]')!;
    expect(getComputedStyle(actions).top).toBe(`${row.offsetHeight}px`);
    await expect.element(frame).toMatchScreenshot('scrolled', {
      kind: 'DATA',
      viewports: ['DESKTOP'],
      reason: 'a wider or narrower window would move the scrolled board',
    });
  });

  /** The phone bar's burger and the name beside it, in the section at `tab` with its work loaded. */
  async function onPhone(tab: string) {
    await page.viewport(390, 844);
    const shownTab = await shown(tab);
    shownTab.work.flush(
      await goldenMaster('a project with work in every status', 'listProjectWork'),
    );
    await shownTab.opened.settled();
    const element = shownTab.locate();
    const burger = element.getByRole('button', { name: 'Work views' });
    await expect.element(burger).toBeVisible();
    const name = () => burger.element().closest('ui-dropdown')!.nextElementSibling!;
    return { ...shownTab, element, burger, name };
  }

  it('shows the tabs on a phone as a burger and the open page’s name with its count', async () => {
    const { locate, frame, burger, name } = await onPhone('in-progress');
    const layout = locate().element();
    expect(getComputedStyle(layout.querySelector('nav[aria-label=Work]')!).display).toBe('none');
    await expect.element(burger).toHaveAttribute('aria-expanded', 'false');
    expect(name().textContent?.replace(/\s+/g, ' ').trim()).toBe('In Progress 9');
    // The gear beside it: In Progress is open.
    await expect
      .element(locate().getByRole('button', { name: 'In Progress view settings' }))
      .toBeVisible();
    await expect.element(frame).toMatchScreenshot('phone-bar', {
      kind: 'DATA',
      viewports: ['PHONE'],
      reason: 'the bar shows below md only',
    });
  });

  it('opens the list of the tabs from the burger on a phone, and closes it as one opens', async () => {
    const { opened, element, frame, burger, project } = await onPhone('in-progress');
    await burger.click();
    await expect.element(burger).toHaveAttribute('aria-expanded', 'true');
    const panel = element.getByRole('region', { name: 'Work views' });
    await expect.element(panel).toBeVisible();
    const links = panel.getByRole('link');
    expect(links.elements().map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Refinement 2',
      'Schedule 4',
      'In Progress 9',
      'Acceptance 2',
      'Archive 4',
    ]);
    expect(links.elements().map((a) => a.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'page',
      null,
      null,
    ]);
    await expect.element(frame).toMatchScreenshot('phone-menu', {
      kind: 'DATA',
      viewports: ['PHONE'],
      reason: 'the bar shows below md only',
    });
    await panel.getByRole('link', { name: 'Archive' }).click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'switch-work-tab:archive',
    ]);
    expect(TestBed.inject(Router).url).toBe(`/projects/${project.slug}/work/archive`);
    await expect.element(burger).toHaveAttribute('aria-expanded', 'false');
  });

  /**
   * Lets the navigation a tab started finish, and answers every read the tab page makes with a 404
   * (an error answer is only a status): that page is its own spec's (`idle()`, not `settled()`,
   * qits-2056). Answers in rounds, until a round leaves nothing open.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  it.each([
    ['refinement', 'Refinement', 'refinement'],
    ['schedule', 'Schedule', 'schedule'],
    ['inProgress', 'In Progress', 'in-progress'],
    ['acceptance', 'Acceptance', 'acceptance'],
    ['archive', 'Archive', 'archive'],
  ])('switch-work-tab %s: the %s tab opens its page', async (outcome, label, segment) => {
    const { opened, locate, work, project } = await shown(
      segment === 'archive' ? 'refinement' : 'archive',
    );
    work.flush(await goldenMaster('a project with work in every status', 'listProjectWork'));
    await opened.settled();
    const tab = locate()
      .getByRole('navigation', { name: 'Work' })
      .getByRole('link', { name: label });
    await tab.click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      `switch-work-tab:${outcome}`,
    ]);
    expect(TestBed.inject(Router).url).toBe(`/projects/${project.slug}/work/${segment}`);
    await expect.element(tab).toHaveAttribute('aria-current', 'page');
  });
});
