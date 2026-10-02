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
    expect(
      rendered
        .querySelector('ui-spinner > div:not(.hidden) svg[role="img"]')
        ?.getAttribute('aria-label'),
    ).toBe('Loading');
  });

  it('draws one card per project, linking to the project with its work, component count and lines', async () => {
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
    // Work: the first project's tree has three REFINED entities, the other has none.
    http
      .expectOne(`/projects/api/projects/${project.id}/entities`)
      .flush(goldenMaster('a project with refined work', 'listProjectEntities'));
    http
      .expectOne(`/projects/api/projects/${other.id}/entities`)
      .flush(goldenMaster('a project with no work', 'listProjectEntities'));
    // qits-githost's recording for a counted repository, under the id of the project's first
    // repository (the two providers' frozen ids are unrelated), so both cards sum its lines.
    const loc = githostGoldenMaster('a repository with counted lines', 'listLoc');
    loc.entries[0].repositoryId = repositories.entries[0].repository.id;
    // The lines are loaded when a card's languages section first opens.
    (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLButtonElement>('card-expandable button')
      .forEach((button) => button.click());
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/githost/api/loc').flush(loc);
    // The store sets the answers after its own awaits; then the cards render them.
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();

    const cards = [...(fixture.nativeElement as HTMLElement).querySelectorAll('app-project-card')];
    expect(cards.map((card) => card.querySelector('a.card-link')?.getAttribute('href'))).toEqual([
      `/projects/${project.slug}`,
      '/projects/other',
    ]);
    expect(cards.map((card) => card.querySelector('card-header')?.textContent?.trim())).toEqual([
      project.name,
      'Other',
    ]);
    const text = (card: Element, selector: string) =>
      card.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
    const stat = (card: Element, tile: string) => [
      text(card, `${tile} dt`),
      text(card, `${tile} dd`),
    ];
    expect(cards.map((card) => stat(card, '.work'))).toEqual([
      ['Work', '3'],
      ['Work', '0'],
    ]);
    expect(cards.map((card) => stat(card, '.components'))).toEqual([
      ['Components', `${repositories.entries.length}`],
      ['Components', '1'],
    ]);
    // No grand total: the language rows carry the numbers.
    expect(cards.map((card) => text(card, '.lines'))).toEqual([undefined, undefined]);
    // Per language, largest first; Java and TypeScript tie on 5 lines and go by name.
    const rows = (card: Element) =>
      [...card.querySelectorAll('.languages tbody tr')].map((row) =>
        [...row.children].map((cell) => cell.textContent?.trim()).join(' '),
      );
    // Only CODE languages: the recording's JSON (DATA) and Markdown (DOCS) rows are left out.
    expect(rows(cards[0])).toEqual(['Java 3 2', 'TypeScript 4 1']);
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
    http
      .expectOne(`/projects/api/projects/${project.id}/entities`)
      .flush(goldenMaster('a project with refined work', 'listProjectEntities'));
    // Derived from qits-githost's counted recording (two CODE languages, plus JSON and Markdown,
    // which the card leaves out): the same entry under the project's first three repositories, the
    // second and third copies' languages renamed with a " 2" / " 3" suffix and their lines doubled /
    // tripled, so the card has six code languages to fold. No recording holds that many.
    const recorded = githostGoldenMaster('a repository with counted lines', 'listLoc').entries[0];
    const copy = (index: number, times: number) => ({
      ...recorded,
      repositoryId: repositories.entries[index].repository.id,
      languages: recorded.languages.map(
        (l: { language: string; mainLines: number; testLines: number }) => ({
          ...l,
          language: `${l.language} ${times}`,
          mainLines: l.mainLines * times,
          testLines: l.testLines * times,
        }),
      ),
    });
    const first = { ...recorded, repositoryId: repositories.entries[0].repository.id };
    const second = copy(1, 2);
    const third = copy(2, 3);
    // The lines are loaded when a card's languages section first opens.
    (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLButtonElement>('card-expandable button')
      .forEach((button) => button.click());
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/githost/api/loc').flush({ entries: [first, second, third] });
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();

    const card = (fixture.nativeElement as HTMLElement).querySelector('app-project-card')!;
    const rows = [...card.querySelectorAll('.languages tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent?.trim()).join(' '),
    );
    // Java 3 9/6 and TypeScript 3 12/3 tie on 15; Java 2 6/4 and TypeScript 2 8/2 tie on 10;
    // Java 3/2 and TypeScript 4/1 (7/3) are the rest. JSON and Markdown never appear.
    expect(rows).toEqual([
      'Java 3 9 6',
      'TypeScript 3 12 3',
      'Java 2 6 4',
      'TypeScript 2 8 2',
      'Other 7 3',
    ]);
  });
});
