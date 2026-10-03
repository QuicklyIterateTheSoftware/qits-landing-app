import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { client as eventsClient } from '../../../api/events/client.gen';
import { provideHeyApiClient } from '../../../api/events/client/client.gen';
import { DomainEvents, type DomainEvent } from '../../../core/events/domain-events';
import { RECENT_EVENTS } from '../../../core/events/events.consumes';
import { eventsGoldenMaster } from '../../../../testing/golden-masters';
import { eventTime, NotificationsMenu } from './notifications-menu';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('NotificationsMenu', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  const LIST = `/events/api/events?limit=${RECENT_EVENTS}`;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(eventsClient),
        { provide: DomainEvents, useValue: { on: () => events.asObservable() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render() {
    const fixture = TestBed.createComponent(NotificationsMenu);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('button')!;
    const panel = element.querySelector<HTMLElement>('#notifications-menu')!;
    return { fixture, button, panel };
  }

  it('fetches the newest events on its first opening, and lists them', async () => {
    const { fixture, button, panel } = render();
    expect(button.getAttribute('aria-label')).toBe('Notifications');
    await settle();
    http.expectNone(LIST);

    button.click();
    fixture.detectChanges();
    await settle();
    http.expectOne(LIST).flush(eventsGoldenMaster('a few recent events', 'listEvents'));
    await settle();
    fixture.detectChanges();
    const rows = [...panel.querySelectorAll('li')].map((li) =>
      li.textContent?.replace(/\s+/g, ' '),
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('DeploymentActive');
    expect(rows[0]).toContain('2026-01-01 00:00 UTC');
    expect(rows[0]).toContain('qits-projects is deployed');
  });

  it('puts an event from the live stream at the top, once the list is loaded', async () => {
    const { fixture, button, panel } = render();
    events.next({ id: 'early', name: 'BuildFailed' }); // before loading: dropped
    button.click();
    fixture.detectChanges();
    await settle();
    http.expectOne(LIST).flush(eventsGoldenMaster('no events', 'listEvents'));
    await settle();
    events.next({ id: 'late', name: 'SCMRelease', description: 'A release' });
    fixture.detectChanges();
    const names = [...panel.querySelectorAll('li')].map((li) => li.textContent);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain('SCMRelease');
  });

  it('writes times the same way on every machine', () => {
    expect(eventTime('2026-01-01T12:34:56.789Z')).toBe('2026-01-01 12:34 UTC');
    expect(eventTime(undefined)).toBe('');
    expect(eventTime('soon')).toBe('soon');
  });
});
