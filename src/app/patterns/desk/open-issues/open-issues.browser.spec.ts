import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { commands, page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { DomainEvents, EVENT_SOURCE } from '$core/events/domain-events';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { OpenIssues } from './open-issues';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const OPEN_ISSUE = 'a project with an open issue';

/**
 * Screenshots of the Desk's open issues (qits-1819), 40rem wide, on qits-projects' "a project with
 * an open issue" (qits-2039): the project's work (`listProjectWork`) holds one OPEN issue, read
 * on its own (`getWork`, `app-issue-description`), whose description shows below its title.
 *
 * An issue's id is a declared exit (`open-open-issue` `issue`, epic qits-2000), shown by
 * `open-issue` and followed once, to a stub of the issue's page.
 */
describe('OpenIssues (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/detail/:id', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideTestPlatformOrigins(),
        // No live stream in a screenshot: the real DomainEvents, on a stream that never connects.
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
        // The work's `refreshOn` (qits-2146) follows that stream.
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The recorded project's open issues, its work and the issue's description answered. */
  async function shown() {
    const work = await goldenMaster(OPEN_ISSUE, 'listProjectWork');
    const issue = await goldenMaster(OPEN_ISSUE, 'getWork');
    const fixture = TestBed.createComponent(OpenIssues);
    fixture.componentRef.setInput('projectId', issue.projectId);
    fixture.componentRef.setInput('slug', 'contract-00000001');
    (fixture.nativeElement as HTMLElement).style.width = '40rem';
    fixture.detectChanges();
    await settle();
    http.expectOne(`/projects/api/projects/${issue.projectId}/work`).flush(work);
    // Not `whenStable()`: the issue's own read, which drawing the row starts, is a pending task
    // until it is answered (qits-2146). Draw the row, and run the effect that starts that read.
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
    }
    fixture.detectChanges();
    await settle();
    // No project list: `SelectedProject` reads it once a URL names a project (qits-2146).
    http.expectNone('/projects/api/projects');
    http.expectOne(`/projects/api/work/${issue.qualifiedId}`).flush(issue);
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    const locator = page.elementLocator(fixture.nativeElement as HTMLElement);
    await expect.element(locator).toMatchTextContent(issue.title);
    return { locator, issue };
  }

  it('lists an open issue, its id linking its page', async () => {
    const { locator, issue } = await shown();
    await expect
      .element(locator.getByRole('link', { name: issue.qualifiedId, exact: true }))
      .toBeVisible();
    await commands.parkPointer();
    await expect.element(locator).toMatchScreenshot('open-issue', { kind: 'DATA' });
  });

  it('open-open-issue issue: an issue’s id opens its page', async () => {
    const { locator, issue } = await shown();
    await userEvent.click(locator.getByRole('link', { name: issue.qualifiedId, exact: true }));
    await settle();
    // Nothing here reads the open project (`SelectedProject`): the open issues read the work by the
    // project id they are given (qits-2146), and the stub page reads nothing.
    http.expectNone('/projects/api/projects');
    expect(TestBed.inject(Router).url).toBe(
      `/projects/contract-00000001/work/detail/${issue.qualifiedId}`,
    );
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-open-issue:issue',
    ]);
  });
});
