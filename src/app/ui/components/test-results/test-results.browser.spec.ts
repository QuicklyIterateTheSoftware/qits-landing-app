import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { testResultsOf } from '$core/ci/reports';
import { TestResultsView } from './test-results';

/** Screenshots of a test results report, on a synthetic payload with one failing test. */
@Component({
  imports: [TestResultsView],
  host: { class: 'block w-[44rem] p-4' },
  template: `<ui-test-results [results]="results" runHref="https://ci.example/runs/r1" />`,
})
class Results {
  readonly results = testResultsOf({
    totals: { tests: 456, passed: 455, failed: 0, errored: 1, skipped: 0, durationMs: 44448 },
    suites: [
      { language: 'java', tool: 'surefire', module: 'domain', tests: 434, errored: 1 },
      { language: 'java', tool: 'surefire', module: 'gitmirror', tests: 22 },
    ],
    failures: [
      {
        coordinates: {
          className: 'eu.wohlben.qits.workspaces.control.WorkspaceEnsureContainerProcessTest',
          testName: 'aStopInTheBootstrapWindowEndsTheStartAndTheNextEnsureStartsAgain',
          file: 'domain/src/test/java/eu/wohlben/qits/workspaces/control/WorkspaceEnsureContainerProcessTest.java',
          lineStart: 313,
        },
        shape: 'ERROR',
        failureType: 'java.util.ConcurrentModificationException',
        stackTrace: 'java.util.ConcurrentModificationException\n\tat java.base/java.util.HashMap',
      },
    ],
  });
}

describe('TestResultsView (screenshots)', () => {
  it('shows the totals, the failing test first with its place, then the suites', async () => {
    const fixture = TestBed.createComponent(Results);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view.getByRole('list', { name: 'Failing tests' })).toBeVisible();
    await expect.element(view).toHaveTextContent('1 errored');
    await expect.element(view).toMatchScreenshot('failing');
  });
});
