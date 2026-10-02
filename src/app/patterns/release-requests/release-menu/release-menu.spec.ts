import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedProject } from '../../../core/projects/selected-project';
import { goldenMaster } from '../../../../testing/golden-masters';
import { gateTone, ReleaseMenu, requestTone } from './release-menu';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ReleaseMenu', () => {
  let http: HttpTestingController;
  const project = signal<{ id: string; name: string; slug: string } | undefined>(undefined);
  const recorded = goldenMaster('a project exists', 'getProject').project;

  beforeEach(() => {
    project.set(recorded);
    TestBed.configureTestingModule({
      providers: [
        // A server platform: the store does not load the project list by itself.
        { provide: PLATFORM_ID, useValue: 'server' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
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

  it('is hidden while no project is open', () => {
    project.set(undefined);
    const { element } = render();
    expect(element.classList.contains('hidden')).toBe(true);
  });

  it('fetches the requests on its first opening only, and shows their count', async () => {
    const { fixture, button, panel } = render();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.classList.contains('hidden')).toBe(true);
    http.expectNone(`/projects/api/projects/${recorded.id}/release-requests`);

    button.click();
    fixture.detectChanges();
    await settle();
    http
      .expectOne(`/projects/api/projects/${recorded.id}/release-requests`)
      .flush(goldenMaster('a project with pending release requests', 'listProjectReleaseRequests'));
    await settle();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.classList.contains('hidden')).toBe(false);
    expect(panel.querySelectorAll('li')).toHaveLength(5);
    expect(button.textContent?.trim()).toBe('5');

    button.click(); // closes
    fixture.detectChanges();
    button.click(); // opens again, from what the store holds
    fixture.detectChanges();
    await settle();
    http.expectNone(`/projects/api/projects/${recorded.id}/release-requests`);
  });

  it('closes on Escape, returning the focus to its button, and on a click outside', async () => {
    const { fixture, button, panel } = render();
    button.click();
    fixture.detectChanges();
    await settle();
    http
      .expectOne(`/projects/api/projects/${recorded.id}/release-requests`)
      .flush(goldenMaster('a project with no release requests', 'listProjectReleaseRequests'));
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

  it('colours gates and requests by how they stand', () => {
    expect(['PASSED', 'PENDING', 'FAILED', 'UNKNOWN'].map(gateTone)).toEqual([
      'ok',
      'waiting',
      'failed',
      'neutral',
    ]);
    expect(['READY', 'RELEASED', 'PENDING', 'CONFLICTED', 'REJECTED'].map(requestTone)).toEqual([
      'ok',
      'ok',
      'waiting',
      'failed',
      'failed',
    ]);
  });
});
