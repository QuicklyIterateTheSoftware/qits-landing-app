import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client as observabilityClient } from '../../../../../api/observability/client.gen';
import { provideHeyApiClient } from '../../../../../api/observability/client/client.gen';
import type { ErrorIssues } from '$core/observability/observability.consumes';
import { SelectedProject } from '$core/projects/selected-project';
import { isRecorded, observabilityGoldenMasters } from '../../../../../../testing/golden-masters';
import { ObservabilityErrorsPage } from './observability-errors.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const STORED = 'stored error issues';
const ISSUES = '/observability/api/error-issues';

/** The recorded answer: two OPEN issues, one with an exception and a location, one a log's message. */
const recorded = (): ErrorIssues =>
  observabilityGoldenMasters.body<ErrorIssues>(STORED, 'listErrorIssues');

/**
 * The Errors page (qits-2538) on answers no recording holds, so a screenshot cannot show them, each
 * derived from qits-observability's recorded issues ("stored error issues"): a regressed OPEN issue
 * (the recorded one with `regressions` set), a regressed one shown under the ALL lens after it was
 * dismissed again (no chip), an empty list and a truncated answer. Skipped until the pin records
 * the state.
 */
describe.skipIf(!isRecorded(STORED, 'listErrorIssues', observabilityGoldenMasters))(
  'ObservabilityErrorsPage',
  () => {
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          { provide: PLATFORM_ID, useValue: 'browser' },
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          provideHeyApiClient(observabilityClient),
          { provide: SelectedProject, useValue: { slug: signal('p') } },
        ],
      });
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    /** Runs the page's effects and lets the client build its requests. */
    async function ticked() {
      for (let i = 0; i < 3; i++) {
        TestBed.tick();
        await settle();
      }
    }

    /** The page at `url`, its issues `answer`; the read's URL. */
    async function shown(answer: ErrorIssues, url = '/') {
      await TestBed.inject(Router).navigateByUrl(url);
      const fixture = TestBed.createComponent(ObservabilityErrorsPage);
      fixture.detectChanges();
      await ticked();
      const [read] = http.match((request) => request.url.split('?')[0] === ISSUES);
      const sent = new URL(read.request.urlWithParams, 'http://x').searchParams;
      read.flush(answer);
      await ticked();
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      return { fixture, element, sent, rows: [...element.querySelectorAll('ol > li')] };
    }

    it('titles each row, links its issue and sends no query for the default lens', async () => {
      const { rows, sent } = await shown(recorded());
      expect([...sent.keys()]).toEqual([]);
      expect(rows).toHaveLength(2);
      expect(rows[0].textContent).toContain('nightly export finished with <n> failures');
      expect(rows[1].textContent).toContain('IllegalStateException: invoice store unreachable');
      expect(rows[1].textContent).toContain('eu.example.InvoiceResource.list');
      expect(rows[1].textContent).toContain('3×');
      expect(rows[1].querySelector('a')?.getAttribute('href')).toBe(
        '/projects/p/observability/errors/0123456789abcdef0123456789abcdef',
      );
      expect(rows[1].querySelector('[data-regressed]')).toBeNull();
    });

    it('marks an OPEN issue that came back as regressed', async () => {
      const [quiet, issue] = recorded().issues ?? [];
      const { rows } = await shown({
        ...recorded(),
        issues: [quiet, { ...issue, regressions: 2 }],
      });
      expect(rows[1].querySelector('[data-regressed]')?.textContent).toContain('regressed');
      expect(rows[0].querySelector('[data-regressed]')).toBeNull();
    });

    it('sends the ALL lens and the service, shows each state and no chip on a dismissed one', async () => {
      const [quiet, issue] = recorded().issues ?? [];
      const dismissed = { ...issue, state: 'DISMISSED', regressions: 2 };
      const { rows, sent, element } = await shown(
        { ...recorded(), issues: [quiet, dismissed] },
        '/?state=ALL&service=qits-example',
      );
      expect(sent.get('state')).toBe('ALL');
      expect(sent.get('service')).toBe('qits-example');
      expect(rows[1].textContent).toContain('DISMISSED');
      expect(rows[1].querySelector('[data-regressed]')).toBeNull();
      expect(element.querySelector('[data-service-filter]')?.textContent).toContain('qits-example');
      expect(element.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toBe('All');
    });

    it('says no issue is open when the list is empty', async () => {
      const { element, rows } = await shown({ ...recorded(), issues: [], total: 0 });
      expect(rows).toHaveLength(0);
      expect(element.textContent).toContain('No error issue is open');
      expect(element.querySelector('[data-truncated]')?.classList).toContain('hidden');
    });

    it('says more issues exist than are shown when the answer was truncated', async () => {
      const { element } = await shown({ ...recorded(), truncated: true, total: 7 });
      const truncated = element.querySelector('[data-truncated]');
      expect(truncated?.classList).not.toContain('hidden');
      expect(truncated?.textContent).toContain('More issues exist than are shown: 2 of 7.');
    });
  },
);
