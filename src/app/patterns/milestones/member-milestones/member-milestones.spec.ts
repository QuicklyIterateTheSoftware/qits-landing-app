import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { WorkStore } from '$core/work/work.store';
import { goldenMaster, projectsGoldenMasters } from '../../../../testing/golden-masters';
import { MemberMilestones } from './member-milestones';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const MEMBER = 'a campaign member waiting on a milestone';
const params = projectsGoldenMasters.operation(MEMBER, 'listWorkMembers').params;

/**
 * A campaign's member milestones (epic qits-615), on "a campaign member waiting on a milestone"'
 * recordings: the membership as `listWorkMembers` answers it (as `WorkStore` keeps it), the
 * picker's milestones from "a ticket waiting on an unmet milestone"' `listProjectMilestones` (the
 * same two milestones), and the write's `setWorkMemberMilestones`.
 */
describe('MemberMilestones', () => {
  let http: HttpTestingController;
  const refresh = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    refresh.mockClear();
    const members = goldenMaster(MEMBER, 'listWorkMembers').members;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        {
          provide: SelectedWork,
          useValue: {
            entries: signal(members.map((m: { entity: object }) => ({ ...m.entity }))),
            memberships: signal({
              campaign: members.map(
                (m: { entity: { id: string }; membershipId: string; milestones: object[] }) => ({
                  entityId: m.entity.id,
                  membershipId: m.membershipId,
                  milestones: m.milestones,
                }),
              ),
            }),
          },
        },
        {
          provide: SelectedProject,
          useValue: { slug: signal('contract'), project: signal({ id: params['projectId'] }) },
        },
        { provide: WorkStore, useValue: { refresh } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render() {
    const fixture = TestBed.createComponent(MemberMilestones);
    fixture.componentRef.setInput('campaign', {
      id: 'campaign',
      qualifiedId: params['qualifiedId'],
    });
    fixture.componentRef.setInput('base', '/projects/contract/work/detail');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    return { fixture, element, button };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows each member with the milestones its membership needs', () => {
    const { element } = render();
    const [row] = [...element.querySelectorAll('[data-member-milestones]')];
    expect(row.querySelector('a')!.textContent?.trim()).toBe(params['ticketQualifiedId']);
    expect(row.querySelector('[data-milestone-needs]')!.textContent).toContain(
      'needs: bootstrap test node',
    );
  });

  it('sets the membership’s milestones, ticked from the project’s, and reads the work again', async () => {
    const { fixture, element, button } = render();
    button('Set milestones')!.click();
    fixture.detectChanges();
    await settle();
    http
      .expectOne(`/projects/api/projects/${params['projectId']}/milestones`)
      .flush(goldenMaster('a ticket waiting on an unmet milestone', 'listProjectMilestones'));
    await answered(fixture);
    const boxes = [...element.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
    boxes[1].click();
    fixture.detectChanges();
    button('Save')!.click();
    await settle();
    const put = http.expectOne(
      `/projects/api/work/${params['qualifiedId']}/members/${params['membershipId']}/milestones`,
    );
    expect(put.request.body).toEqual({
      milestoneIds: [params['milestoneId'], params['otherMilestoneId']],
    });
    put.flush(goldenMaster(MEMBER, 'setWorkMemberMilestones'));
    await answered(fixture);
    expect(refresh).toHaveBeenCalledWith(params['projectId']);
    expect(element.querySelector('fieldset')).toBeNull();
  });
});
