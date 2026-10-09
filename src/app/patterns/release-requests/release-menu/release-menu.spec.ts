import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedProject } from '$core/projects/selected-project';
import { goldenMaster } from '../../../../testing/golden-masters';
import { Subject } from 'rxjs';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { ReleaseMenu, REFRESH_DEBOUNCE_MS } from './release-menu';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ReleaseMenu', () => {
  let http: HttpTestingController;
  /** What a fake `DomainEvents` hands the menu. */
  let events: Subject<DomainEvent>;
  const project = signal<{ id: string; name: string; slug: string } | undefined>(undefined);
  const recorded = goldenMaster('a project exists', 'getProject').project;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    project.set(recorded);
    TestBed.configureTestingModule({
      providers: [
        // A server platform: the store does not load the project list by itself.
        { provide: PLATFORM_ID, useValue: 'server' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        { provide: DomainEvents, useValue: { on: () => events.asObservable() } },
        {
          provide: SelectedProject,
          useValue: { project, slug: signal(recorded.slug), url: signal('') },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render() {
    const fixture = TestBed.createComponent(ReleaseMenu);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('button')!;
    const panel = element.querySelector<HTMLElement>('#release-menu')!;
    return { fixture, element, button, panel };
  }

  it('is hidden while no project is open, and fetches nothing', async () => {
    project.set(undefined);
    const { element } = render();
    expect(element.classList.contains('hidden')).toBe(true);
    await settle();
    http.expectNone(`/projects/api/projects/${recorded.id}/release-requests`);
  });

  it('fetches the requests as soon as a project is open, and shows their count', async () => {
    const { fixture, button, panel } = render();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.classList.contains('hidden')).toBe(true);
    await settle();
    http
      .expectOne(`/projects/api/projects/${recorded.id}/release-requests`)
      .flush(goldenMaster('a project with pending release requests', 'listProjectReleaseRequests'));
    await settle();
    fixture.detectChanges();
    expect(button.textContent?.trim()).toBe('5');

    button.click(); // opens, from what the store holds
    fixture.detectChanges();
    await settle();
    http.expectNone(`/projects/api/projects/${recorded.id}/release-requests`);
    expect(panel.classList.contains('hidden')).toBe(false);
    expect(panel.querySelectorAll('li')).toHaveLength(5);
  });

  it('fetches again, once, after a burst of events about the open project', async () => {
    const { fixture } = render();
    await settle();
    http
      .expectOne(`/projects/api/projects/${recorded.id}/release-requests`)
      .flush(goldenMaster('a project with no release requests', 'listProjectReleaseRequests'));
    await settle();
    vi.useFakeTimers();
    const ofThisProject = JSON.stringify({ projectId: recorded.id });
    events.next({ id: '1', name: 'ReleaseRequestChanged', payload: ofThisProject });
    events.next({ id: '2', name: 'BuildSuccessful', payload: ofThisProject });
    events.next({ id: '3', name: 'BuildFailed', payload: JSON.stringify({ projectId: 'other' }) });
    // A deployment names no project; with nothing RELEASED waiting for one, it is ignored.
    events.next({ id: '4', name: 'DeploymentActive', payload: '{"applicationName":"x"}' });
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    vi.useRealTimers();
    await settle();
    http
      .expectOne(`/projects/api/projects/${recorded.id}/release-requests`)
      .flush(goldenMaster('a project with pending release requests', 'listProjectReleaseRequests'));
    await settle();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('button')?.textContent?.trim(),
    ).toBe('5');
  });

  it('closes on Escape, returning the focus to its button, and on a click outside', async () => {
    const { fixture, button, panel } = render();
    await settle();
    http
      .expectOne(`/projects/api/projects/${recorded.id}/release-requests`)
      .flush(goldenMaster('a project with no release requests', 'listProjectReleaseRequests'));
    button.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(panel.classList.contains('hidden')).toBe(true);
    expect(document.activeElement).toBe(button);

    button.click();
    fixture.detectChanges();
    document.body.click();
    fixture.detectChanges();
    expect(panel.classList.contains('hidden')).toBe(true);
  });
});
