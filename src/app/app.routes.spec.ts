import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { ProjectWorkArchivePage } from './routes/projects/[slug]/work-archive/project-work-archive.page';
import { WorkItemPage } from './routes/projects/[slug]/work/[id]/work-item.page';

/** The work section's own routes, under the layout, without its session guard. */
const work = routes.find((route) => route.path === '')?.children ?? [];

describe('work routes', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter(work), provideHttpClient(), provideHttpClientTesting()],
    }),
  );

  it('opens the archive at work-archive', async () => {
    const harness = await RouterTestingHarness.create();
    expect(await harness.navigateByUrl('/projects/qits/work-archive')).toBeInstanceOf(
      ProjectWorkArchivePage,
    );
  });

  it('opens an item’s page at work/<qualified id>', async () => {
    const harness = await RouterTestingHarness.create();
    expect(await harness.navigateByUrl('/projects/qits/work/qits-112')).toBeInstanceOf(
      WorkItemPage,
    );
  });
});
