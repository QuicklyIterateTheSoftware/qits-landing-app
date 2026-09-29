import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client as projectsClient } from './api/projects/client.gen';
import { provideHeyApiClient } from './api/projects/client/client.gen';
import { App } from './app';
import { routes } from './app.routes';
import { ProjectPicker } from './projects/project-picker';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});

describe('ProjectPicker', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectPicker],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    }).compileComponents();
  });

  /** The heading is in the template, so the server render has it without a session. */
  it('renders the heading before the list arrives', () => {
    const fixture = TestBed.createComponent(ProjectPicker);
    fixture.detectChanges();
    const rendered = fixture.nativeElement as HTMLElement;
    expect(rendered.querySelector('h1')?.textContent).toContain('Projects');
    expect(rendered.textContent).toContain('Loading projects');
  });

  it('draws one card per project, linking to the project with its component count', async () => {
    const fixture = TestBed.createComponent(ProjectPicker);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    // The store's client builds its request after a few awaits.
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/projects/api/projects').flush({
      entries: [
        { project: { id: '1', name: 'qits', slug: 'qits' } },
        { project: { id: '2', name: 'Other', slug: 'other' } },
      ],
    });
    // Render the cards, which start their own requests; whenStable() would wait for those.
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    http.expectOne('/projects/api/projects/1/repositories').flush({
      entries: [{ repository: { id: 'a' } }, { repository: { id: 'b' } }],
      wrapper: {},
    });
    http.expectOne('/projects/api/projects/2/repositories').flush({
      entries: [{ repository: { id: 'c' } }],
    });
    await fixture.whenStable();

    const cards = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a.card-link')];
    expect(cards.map((card) => card.getAttribute('href'))).toEqual([
      '/projects/qits',
      '/projects/other',
    ]);
    expect(cards.map((card) => card.querySelector('card-header')?.textContent)).toEqual([
      'qits',
      'Other',
    ]);
    expect(cards.map((card) => card.querySelector('card-body')?.textContent?.trim())).toEqual([
      '2 components',
      '1 component',
    ]);
  });
});
