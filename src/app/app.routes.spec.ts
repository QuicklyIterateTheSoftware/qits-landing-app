import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { ProjectWorkArchive } from './patterns/work/project-work-archive/project-work-archive';
import { WorkItem } from './patterns/work/work-item/work-item';

/** The work section's own routes, under the layout, without its session guard. */
const work = routes[0].children ?? [];

describe('work routes', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter(work), provideHttpClient(), provideHttpClientTesting()],
    }),
  );

  it('opens the archive at work/archive, before the item route can take it', async () => {
    const harness = await RouterTestingHarness.create();
    expect(await harness.navigateByUrl('/projects/qits/work/archive')).toBeInstanceOf(
      ProjectWorkArchive,
    );
  });

  it('opens an item’s page at work/<qualified id>', async () => {
    const harness = await RouterTestingHarness.create();
    expect(await harness.navigateByUrl('/projects/qits/work/qits-112')).toBeInstanceOf(WorkItem);
  });
});
