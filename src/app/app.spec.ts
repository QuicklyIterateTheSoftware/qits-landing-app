import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client as githostClient } from './api/githost/client.gen';
import { client as projectsClient } from './api/projects/client.gen';
import { provideHeyApiClient } from './api/projects/client/client.gen';
import { App } from './app';
import { routes } from './app.routes';
import { ProjectPicker } from './projects/project-picker';
import { githostGoldenMaster, goldenMaster } from '../testing/golden-masters';

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
        provideHeyApiClient(githostClient),
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

  it('draws one card per project, linking to the project with its component count and lines', async () => {
    const fixture = TestBed.createComponent(ProjectPicker);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    // The store's client builds its request after a few awaits.
    await new Promise((resolve) => setTimeout(resolve));
    // qits-projects' golden masters, plus a second project derived from the recorded one (another
    // id, name and slug) whose repositories answer is the recorded one cut to its first entry, so
    // both the plural and the singular are drawn.
    const project = goldenMaster('a project exists', 'listProjects').entries[0].project;
    const other = {
      ...project,
      id: '00000000-0000-4000-8000-0000000000ff',
      name: 'Other',
      slug: 'other',
    };
    const repositories = goldenMaster('a project with 3 repositories', 'listProjectRepositories');
    http.expectOne('/projects/api/projects').flush({ entries: [{ project }, { project: other }] });
    // Render the cards, which ask the store for their repositories. The store's client builds each
    // request after a few awaits.
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne(`/projects/api/projects/${project.id}/repositories`).flush(repositories);
    http
      .expectOne(`/projects/api/projects/${other.id}/repositories`)
      .flush({ ...repositories, entries: repositories.entries.slice(0, 1) });
    // qits-githost's recording for a counted repository, under the id of the project's first
    // repository (the two providers' frozen ids are unrelated), so both cards sum its lines.
    const loc = githostGoldenMaster('a repository with counted lines', 'listLoc');
    loc.entries[0].repositoryId = repositories.entries[0].repository.id;
    http.expectOne('/githost/api/loc').flush(loc);
    // The store sets the answers after its own awaits; then the cards render them.
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();

    const cards = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a.card-link')];
    expect(cards.map((card) => card.getAttribute('href'))).toEqual([
      `/projects/${project.slug}`,
      '/projects/other',
    ]);
    expect(cards.map((card) => card.querySelector('card-header')?.textContent)).toEqual([
      project.name,
      'Other',
    ]);
    const text = (card: Element, selector: string) =>
      card.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
    expect(cards.map((card) => text(card, '.components'))).toEqual([
      `${repositories.entries.length} components`,
      '1 component',
    ]);
    // Java 3/2, TypeScript 4/1, Markdown 1/0.
    expect(cards.map((card) => text(card, '.lines'))).toEqual([
      '8 lines, 3 in tests',
      '8 lines, 3 in tests',
    ]);
  });
});
