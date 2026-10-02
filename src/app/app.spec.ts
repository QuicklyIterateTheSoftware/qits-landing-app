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
      '8 main · 3 tests',
      '8 main · 3 tests',
    ]);
    // Per language, largest first; Java and TypeScript tie on 5 lines and go by name.
    const rows = (card: Element) =>
      [...card.querySelectorAll('.languages tbody tr')].map((row) =>
        [...row.children].map((cell) => cell.textContent?.trim()).join(' '),
      );
    expect(rows(cards[0])).toEqual(['Java 3 2', 'TypeScript 4 1', 'Markdown 1 0']);
  });

  it('names the four largest languages and sums the rest as Other', async () => {
    const fixture = TestBed.createComponent(ProjectPicker);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    await new Promise((resolve) => setTimeout(resolve));
    const project = goldenMaster('a project exists', 'listProjects').entries[0].project;
    const repositories = goldenMaster('a project with 3 repositories', 'listProjectRepositories');
    http.expectOne('/projects/api/projects').flush({ entries: [{ project }] });
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne(`/projects/api/projects/${project.id}/repositories`).flush(repositories);
    // Derived from qits-githost's counted recording (three languages): the same entry under the
    // project's first two repositories, the second copy's languages renamed with a " 2" suffix and
    // its lines doubled, so the card has six languages to fold. No recording holds that many.
    const recorded = githostGoldenMaster('a repository with counted lines', 'listLoc').entries[0];
    const first = { ...recorded, repositoryId: repositories.entries[0].repository.id };
    const second = {
      ...recorded,
      repositoryId: repositories.entries[1].repository.id,
      languages: recorded.languages.map(
        (l: { language: string; mainLines: number; testLines: number }) => ({
          language: `${l.language} 2`,
          mainLines: l.mainLines * 2,
          testLines: l.testLines * 2,
        }),
      ),
    };
    http.expectOne('/githost/api/loc').flush({ entries: [first, second] });
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();

    const card = (fixture.nativeElement as HTMLElement).querySelector('a.card-link')!;
    const rows = [...card.querySelectorAll('.languages tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent?.trim()).join(' '),
    );
    // Java 2 6/4 and TypeScript 2 8/2 tie on 10; Java 3/2 and TypeScript 4/1 tie on 5;
    // Markdown 2 (2/0) and Markdown (1/0) are the rest.
    expect(rows).toEqual([
      'Java 2 6 4',
      'TypeScript 2 8 2',
      'Java 3 2',
      'TypeScript 4 1',
      'Other 3 0',
    ]);
  });
});
