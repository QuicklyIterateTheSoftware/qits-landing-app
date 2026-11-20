import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client as observabilityClient } from '../../../../../api/observability/client.gen';
import { provideHeyApiClient } from '../../../../../api/observability/client/client.gen';
import type { TelemetryErrors } from '$core/observability/observability.consumes';
import { SelectedProject } from '$core/projects/selected-project';
import { observabilityGoldenMasters } from '../../../../../../testing/golden-masters';
import { ObservabilityErrorsPage } from './observability-errors.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const ONE_SERVICE = 'telemetry from one platform service';
const SOURCES = '/observability/api/telemetry/sources';
const ERRORS = '/observability/api/telemetry/errors';

/** The recorded answer: one group, a span that threw and the ERROR log it wrote. */
const recorded = (): TelemetryErrors =>
  observabilityGoldenMasters.body<TelemetryErrors>(ONE_SERVICE, 'listTelemetryErrors');

/**
 * The Errors page (qits-2339) on answers no recording holds, so a screenshot cannot show them, each
 * derived from qits-observability's recorded group ("telemetry from one platform service"): the
 * uncorrelated group (its log alone, under an empty trace id, as the service groups a log written
 * outside a span) answered first, an empty group list, and a truncated answer (the recorded group
 * with `truncated` set and a larger `total`).
 */
describe('ObservabilityErrorsPage', () => {
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

  /** The page at `?source=_service/qits-example`, its sources refused and its errors `answer`. */
  async function shown(answer: TelemetryErrors) {
    await TestBed.inject(Router).navigateByUrl('/?source=_service%2Fqits-example');
    const fixture = TestBed.createComponent(ObservabilityErrorsPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(SOURCES).flush(null, { status: 404, statusText: 'Not Found' });
    const [read] = http.match((request) => request.url.split('?')[0] === ERRORS);
    read.flush(answer);
    await ticked();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, rows: [...element.querySelectorAll('ol > li')] };
  }

  it('lists the uncorrelated group last, headed by its log, with no trace', async () => {
    const [group] = recorded().groups ?? [];
    const uncorrelated = { ...group, traceId: '', errorSpans: [] };
    const { rows } = await shown({ ...recorded(), groups: [uncorrelated, group], total: 2 });
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('java.lang.IllegalStateException');
    expect(rows[1].textContent).toContain('invoice store unreachable');
    expect(rows[1].textContent).toContain('0 error spans · 1 error log');
    expect(rows[1].textContent).toContain('Not correlated to a trace');
    expect(rows[1].textContent).not.toContain('trace 6a1f');
    expect(rows[1].querySelector('[data-trace]')).toBeNull();
  });

  it('links a correlated group’s trace id to the trace page at the same source', async () => {
    const { rows } = await shown(recorded());
    expect(rows[0].querySelector('[data-trace]')?.textContent?.trim()).toBe(
      'trace 6a1f0c2b9d8e47f3a5b4c3d2e1f00a01',
    );
    expect(rows[0].querySelector('[data-trace]')?.getAttribute('href')).toBe(
      '/projects/p/observability/traces/6a1f0c2b9d8e47f3a5b4c3d2e1f00a01?source=_service%2Fqits-example',
    );
  });

  it('says no errors are buffered, as good news, when there are no groups', async () => {
    const { element, rows } = await shown({ ...recorded(), groups: [], total: 0 });
    expect(rows).toHaveLength(0);
    expect(element.textContent).toContain(
      'No errors are buffered for this source: nothing it sent lately failed.',
    );
    expect(element.querySelector('[data-truncated]')?.classList).toContain('hidden');
  });

  it('says more groups exist than are shown when the answer was truncated', async () => {
    const { element } = await shown({ ...recorded(), truncated: true, total: 7 });
    const truncated = element.querySelector('[data-truncated]');
    expect(truncated?.classList).not.toContain('hidden');
    expect(truncated?.textContent).toContain('More groups exist than are shown: 1 of 7.');
  });
});
