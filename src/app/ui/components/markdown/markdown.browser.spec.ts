import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { provideQitsWorkBriefs, type QitsWorkBrief } from '@qits/ui-components';
import { commands, page, userEvent } from 'vitest/browser';
import { workLink } from '$core/work/work-briefs.store';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { Markdown } from './markdown';

/** Every part the app's Markdown uses, inline (a dumb component: synthetic input). */
const TEXT = `## A heading
A paragraph with **bold**, *emphasis*, \`code\` and [a link](https://example.test).

### A smaller heading
- a list
- of items

1. an ordered
2. list

> A quote.

\`\`\`
GET /billing/api/invoices/export?format=csv
\`\`\`

| Invoice | Total |
|---|---|
| 2026-0412 | 1.01 |
`;

@Component({
  imports: [Markdown],
  host: { class: 'block w-[40rem] p-4' },
  template: `<ui-markdown [text]="text" />`,
})
class Host {
  readonly text = TEXT;
}

/** A long inline-code path, long enough to overflow a narrow column unbroken. */
const LONG_PATH =
  'src/app/layout/shell/__screenshots__/shell.layout.browser.spec.ts/menu-agents-phone-chromium-linux.png';
/** A long fenced command: must keep no-wrap and scroll inside `pre`, not widen the page. */
const LONG_COMMAND =
  'qits release-request --project qits approve --request qits-landing-app-rr-175 --sha 5c547ca984a5b448d5be1c82203006a87fa917c3';

/** A paragraph, a code block and a table, each with content wide enough to overflow 342px. */
const NARROW_TEXT = `See \`${LONG_PATH}\` for the baseline.

\`\`\`
${LONG_COMMAND}
\`\`\`

| Repository | File | Issue |
|---|---|---|
| qits-landing-app | src/app/ui/components/markdown/markdown.ts | inline code widening the whole document |
`;

@Component({
  imports: [Markdown],
  host: { class: 'block w-[342px] p-4' },
  template: `<ui-markdown [text]="text" />`,
})
class NarrowHost {
  readonly text = NARROW_TEXT;
}

describe('Markdown (screenshots)', () => {
  it('draws every part', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = page.elementLocator(fixture.nativeElement);
    await expect.element(element.getByRole('table')).toBeVisible();
    await expect.element(element).toMatchScreenshot('every-part', { kind: 'DATA' });
  });

  // qits-1913: a long inline-code path and a wide table used to push the whole page sideways on a
  // phone. The container itself must stay inside its column; a code block and a table may scroll,
  // but only inside their own box.
  it('keeps every part inside a narrow column', async () => {
    const fixture = TestBed.createComponent(NarrowHost);
    fixture.detectChanges();
    const element = page.elementLocator(fixture.nativeElement);
    await expect.element(element.getByRole('table')).toBeVisible();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);

    const pre = host.querySelector('pre') as HTMLElement;
    expect(pre.scrollWidth).toBeGreaterThan(pre.clientWidth);
    const table = host.querySelector('table') as HTMLElement;
    expect(table.scrollWidth).toBeGreaterThan(table.clientWidth);

    const code = host.querySelector('p code') as HTMLElement;
    expect(code.getBoundingClientRect().right).toBeLessThanOrEqual(
      host.getBoundingClientRect().right,
    );

    await expect.element(element).toMatchScreenshot('narrow', { kind: 'DATA' });
  });
});

/** The briefs door's recording: a ticket and an epic of the project `contract-00000001`. */
const BRIEFS = 'a project with work to brief';
/** An hour and a half after the recorded `updatedAt`, so the brief reads "1h ago" on every run. */
const NOW = new Date('2026-01-01T01:30:00Z');

/**
 * A work item's text naming the recorded ticket, as a ticket's description or a comment renders it
 * (`workProject`, qits-1898): once in prose, once in a code span, once as a link's text.
 */
@Component({
  imports: [Markdown],
  host: { class: 'block h-72 w-[40rem] p-4' },
  template: `
    <ui-markdown [text]="text" [workProject]="project" />
    <p id="outside" class="m-0 mt-24 text-sm">Somewhere else on the page</p>
  `,
})
class WorkText {
  project = '';
  text = '';
}

/** Where a reference's link leads: a work item's page, as a stub. */
@Component({ template: '' })
class WorkItemStub {}

describe('Markdown with work references (browser)', () => {
  let ticket: QitsWorkBrief;
  let epic: QitsWorkBrief;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    const recorded = await goldenMaster(BRIEFS, 'listProjectWorkBriefs');
    const briefs: readonly QitsWorkBrief[] = recorded.briefs;
    [ticket, epic] = briefs;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/detail/:id', component: WorkItemStub }]),
        // The app's own link (`open-work-ref:opened`, qits-2042), so the panel's link is its exit.
        workLink,
        // The briefs as qits-projects recorded them, without the HTTP read `workBriefSource` makes.
        provideQitsWorkBriefs(async (_project, ids) =>
          briefs.filter((brief) => ids.includes(brief.qualifiedId)),
        ),
      ],
    });
    history.replaceState(null, '', location.pathname + location.search);
  });

  afterEach(async () => {
    await commands.touch('cancel', 0, 0);
    await commands.parkPointer();
    vi.useRealTimers();
    history.replaceState(null, '', location.pathname + location.search);
  });

  async function render(text: string) {
    const fixture = TestBed.createComponent(WorkText);
    fixture.componentInstance.project = ticket.qualifiedId.replace(/-\d+$/, '');
    fixture.componentInstance.text = text;
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    // The id as drawn in the text, the reference's trigger: the panel's own link comes after it.
    const refOf = (qualifiedId: string) => view.getByText(qualifiedId, { exact: true }).first();
    // The brief's title is in the panel only; the panel is in the accessibility tree only open.
    const panel = view.getByText(ticket.title);
    const tap = async (element: Element) => {
      const rect = element.getBoundingClientRect();
      const at = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      await commands.touch('down', at.x, at.y);
      await commands.touch('up', at.x, at.y);
    };
    return { fixture, view, refOf, panel, tap };
  }

  /** A ticket's description: the ticket in prose, below a heading. */
  const description = () =>
    `## Why\nThe release request lists ${ticket.qualifiedId} without its status, so a reader ` +
    `opens it to know whether it is done.`;

  it("opens a description's brief on hover: the id, its status, when it changed, its title", async () => {
    const { view, refOf, panel } = await render(description());
    const ref = refOf(ticket.qualifiedId);
    await expect.element(ref).toHaveClass('qits-work-ref');
    await expect.element(panel).not.toBeVisible();
    await userEvent.hover(ref);
    await expect.element(panel).toBeVisible();
    const tooltip = view.getByRole('tooltip');
    await expect.element(tooltip.getByRole('link', { name: ticket.qualifiedId })).toBeVisible();
    const status = ticket.status.toLowerCase().replace(/_/g, ' ');
    await expect
      .element(tooltip)
      .toHaveTextContent(`${ticket.qualifiedId}${status}1h ago${ticket.title}`);
    await expect.element(view).toMatchScreenshot('work-text-ref-open', { kind: 'DATA' });
  });

  it("on a finger, a tap opens a comment's brief without following anything", async () => {
    const { refOf, panel, tap } = await render(
      `Same cause as ${ticket.qualifiedId}. Reproduced twice.`,
    );
    const ref = refOf(ticket.qualifiedId);
    await expect.element(ref).toHaveClass('qits-work-ref');
    const before = location.href;
    await tap(ref.element());
    await expect.element(panel).toBeVisible();
    expect(location.href).toBe(before);

    // A second tap closes it, and follows nothing either; a tap outside closes it too.
    await tap(ref.element());
    await expect.element(panel).not.toBeVisible();
    await tap(ref.element());
    await expect.element(panel).toBeVisible();
    await tap(document.querySelector('#outside')!);
    await expect.element(panel).not.toBeVisible();
    expect(location.href).toBe(before);
  });

  it('draws an id in a code span as a reference, and leaves a link that link', async () => {
    const { view, refOf } = await render(
      `Folded with \`${epic.qualifiedId}\`; see [${ticket.qualifiedId}](https://example.test/t).`,
    );
    const ref = refOf(epic.qualifiedId);
    await expect.element(ref).toHaveClass('qits-work-ref');
    expect(ref.element().closest('code')).not.toBeNull();
    await userEvent.hover(ref);
    await expect.element(view.getByText(epic.title)).toBeVisible();
    const link = view.getByRole('link', { name: ticket.qualifiedId, exact: true }).first();
    await expect.element(link).toHaveAttribute('href', 'https://example.test/t');
    expect(link.element().querySelector('qits-work-ref')).toBeNull();
  });

  it("opens the item's page from the brief's link (open-work-ref:opened)", async () => {
    const { view, refOf, panel } = await render(description());
    const project = ticket.qualifiedId.replace(/-\d+$/, '');
    await userEvent.hover(refOf(ticket.qualifiedId));
    await expect.element(panel).toBeVisible();
    const link = view.getByRole('tooltip').getByRole('link', { name: ticket.qualifiedId });
    await expect
      .element(link)
      .toHaveAttribute('href', `/projects/${project}/work/detail/${ticket.qualifiedId}`);
    await expect.element(link).toHaveAttribute('data-qits-outcome', 'open-work-ref:opened');
    await userEvent.click(link);
    await expect.poll(() => outcomeRecords().map((r) => r.outcome)).toEqual(['opened']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${project}/work/detail/${ticket.qualifiedId}`,
    );
  });
});
