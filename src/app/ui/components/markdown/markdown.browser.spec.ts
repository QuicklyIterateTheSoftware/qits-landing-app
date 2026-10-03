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

describe('Markdown (screenshots)', () => {
  it('draws every part', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = page.elementLocator(fixture.nativeElement);
    await expect.element(element.getByRole('table')).toBeVisible();
    await expect.element(element).toMatchScreenshot('every-part');
  });
});
