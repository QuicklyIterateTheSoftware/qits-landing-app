import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { coverageOf } from '$core/ci/reports';
import { CoverageSummary } from './coverage-summary';

/** Screenshots of a coverage report, on a synthetic payload with a diff against its baseline. */
@Component({
  imports: [CoverageSummary],
  host: { class: 'block w-[36rem] p-4' },
  template: `<ui-coverage-summary [coverage]="coverage" />`,
})
class Summary {
  readonly coverage = coverageOf({
    sources: [{ language: 'java', tool: 'jacoco' }],
    total: { linesCovered: 353, linesTotal: 1000, percent: 35.3 },
    baselineTotal: { version: '2026.1009.122548', percent: 41.3 },
    diff: {
      baselineVersion: '2026.1009.122548',
      linesChanged: 4,
      linesCovered: 0,
      percent: 0,
      uncovered: [{ file: 'domain/src/main/java/eu/x/WorkspaceService.java', ranges: [[12, 15]] }],
    },
  });
}

describe('CoverageSummary (screenshots)', () => {
  it('shows the total against the baseline and the changed lines no test ran', async () => {
    const fixture = TestBed.createComponent(Summary);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view).toMatchTextContent('−6.0 vs 2026.1009.122548');
    await expect.element(view).toMatchScreenshot('diff');
  });
});
