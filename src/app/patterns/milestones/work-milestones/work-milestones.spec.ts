import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { pendingGoldenMaster, pendingParams } from '../../../../testing/pending-golden-masters';
import { WorkMilestones } from './work-milestones';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const UNMET = 'a ticket waiting on an unmet milestone';
const params = pendingParams(UNMET);

/**
 * A work item's milestones on its page (epic qits-615), on "a ticket waiting on an unmet
 * milestone"' recordings: the item's `getWork` milestones, the picker's `listProjectMilestones`,
 * the writes' `attachWorkMilestone` and `detachWorkMilestone`.
 */
describe('WorkMilestones', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(milestones: unknown) {
    const fixture = TestBed.createComponent(WorkMilestones);
    fixture.componentRef.setInput('slug', 'contract');
    fixture.componentRef.setInput('projectId', params['projectId']);
    fixture.componentRef.setInput('qualifiedId', params['qualifiedId']);
    fixture.componentRef.setInput('milestones', milestones);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    let changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    return { fixture, element, button, changed: () => changed };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('lists the milestones the item needs, met or not, each linked', () => {
    const met = pendingGoldenMaster('a ticket waiting on a met milestone', 'getWork').milestones;
    const unmet = pendingGoldenMaster(UNMET, 'getWork').milestones;
    const { element } = render([...unmet, { ...met[0], id: 'other', displayName: 'arm64' }]);
    const rows = [...element.querySelectorAll('[data-work-milestone]')];
    const parts = (row: Element) =>
      [...row.querySelectorAll('a, ui-chip, button')].map((e) => e.textContent?.trim());
    expect(rows.map(parts)).toEqual([
      ['bootstrap test node', 'not met', 'Detach'],
      ['arm64', 'met since 2026-01-01 00:00 UTC', 'Detach'],
    ]);
    expect(rows[0].querySelector('a')!.getAttribute('href')).toBe(
      `/projects/contract/work/milestones/${unmet[0].id}`,
    );
  });

  it('attaches another of the project’s milestones, picked from the list', async () => {
    const { fixture, element, button, changed } = render(
      pendingGoldenMaster(UNMET, 'getWork').milestones,
    );
    button('Add a milestone')!.click();
    fixture.detectChanges();
    await settle();
    http
      .expectOne(`/projects/api/projects/${params['projectId']}/milestones`)
      .flush(pendingGoldenMaster(UNMET, 'listProjectMilestones'));
    await answered(fixture);
    const select = element.querySelector<HTMLSelectElement>('select[aria-label="Milestone"]')!;
    // The one it needs already is not offered again.
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual([
      'Choose a milestone…',
      'arm64 runner',
    ]);
    select.value = params['otherMilestoneId'];
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button('Attach')!.click();
    await settle();
    http
      .expectOne(
        `/projects/api/work/${params['qualifiedId']}/milestones/${params['otherMilestoneId']}`,
      )
      .flush(pendingGoldenMaster(UNMET, 'attachWorkMilestone'));
    await answered(fixture);
    expect(changed()).toBe(1);
    expect(element.querySelector('select')).toBeNull();
  });

  it('detaches a milestone, and shows a refusal in the service’s words', async () => {
    const { fixture, element, button, changed } = render(
      pendingGoldenMaster(UNMET, 'getWork').milestones,
    );
    button('Detach')!.click();
    await settle();
    http
      .expectOne(`/projects/api/work/${params['qualifiedId']}/milestones/${params['milestoneId']}`)
      .flush({ message: 'The item is DONE.' }, { status: 409, statusText: 'Conflict' });
    await answered(fixture);
    expect(changed()).toBe(0);
    expect(element.querySelector('[role=alert]')?.textContent?.trim()).toBe('The item is DONE.');

    button('Detach')!.click();
    await settle();
    http
      .expectOne(`/projects/api/work/${params['qualifiedId']}/milestones/${params['milestoneId']}`)
      .flush(pendingGoldenMaster(UNMET, 'detachWorkMilestone'));
    await answered(fixture);
    expect(changed()).toBe(1);
  });
});
