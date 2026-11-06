import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
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
    await expect.element(element).toMatchScreenshot('every-part');
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

    await expect.element(element).toMatchScreenshot('narrow');
  });
});
