import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { goldenMaster } from '../../../../testing/golden-masters';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import type { ReleaseRequestEntry } from '$core/projects/projects.consumes';
import { ProjectsStore } from '$core/projects/projects.store';
import { SelectedProject } from '$core/projects/selected-project';
import { AgentsMenu, clockTime } from './agents-menu';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/**
 * `AgentsMenu` on inline agents: the pinned `@qits/workspaces-golden-masters` holds no waits or
 * attention yet (state `a project with agents needing attention` comes with its bump), so the
 * agents here are written out. The project and its release requests are qits-projects' recorded
 * ones.
 */
describe('AgentsMenu', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  const project = signal<{ id: string; name: string; slug: string } | undefined>(undefined);
  const recorded = goldenMaster('a project exists', 'getProject').project;
  const slug = recorded.slug;
  const agentsUrl = `/workspaces/api/agents?projectId=${recorded.id}&state=ACTIVE`;
  const requestsAnswer = goldenMaster(
    'a project with pending release requests',
    'listProjectReleaseRequests',
  ) as { requests: ReleaseRequestEntry[] };
  const request = requestsAnswer.requests.find((r) => r.qualifiedId && r.state)!;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    project.set(recorded);
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        provideRouter([{ path: '**', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        provideTestPlatformOrigins({}, { ci: 'https://ci.example' }),
        { provide: DomainEvents, useValue: { on: () => events.asObservable() } },
        { provide: SelectedProject, useValue: { project, slug: signal(slug), url: signal('') } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    await settle();
    http.verify();
  });

  const agent = (n: number, extra: Record<string, unknown> = {}) => ({
    agentId: `agent-${n}`,
    repositoryId: 'repo-1',
    entityId: `${slug}-${n}`,
    entityTitle: `Item ${n}`,
    state: 'ACTIVE',
    activity: 'BUSY',
    lastActivityAt: `2026-10-28T10:0${n}:00Z`,
    waits: [],
    ...extra,
  });

  async function render(agents: readonly object[]) {
    const fixture = TestBed.createComponent(AgentsMenu);
    fixture.detectChanges();
    await settle();
    http.expectOne(agentsUrl).flush({ agents });
    await settle();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('button')!;
    const panel = element.querySelector<HTMLElement>('#agents-menu')!;
    const badge = () => element.querySelector<HTMLElement>('button span[aria-hidden="true"]')!;
    const open = async () => {
      button.click();
      fixture.detectChanges();
      await settle();
      http.expectOne(agentsUrl).flush({ agents });
      await settle();
      fixture.detectChanges();
    };
    return { fixture, element, button, panel, badge, open };
  }

  const attention = (code: string, extra: Record<string, unknown> = {}) => ({
    attention: { code, reason: `because ${code}`, since: '2026-10-28T10:00:00Z', ...extra },
  });

  it('is hidden while no project is open, and reads nothing', async () => {
    project.set(undefined);
    const fixture = TestBed.createComponent(AgentsMenu);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).classList.contains('hidden')).toBe(true);
    await settle();
    http.expectNone(agentsUrl);
  });

  it('badges the agents needing a person in red', async () => {
    const { badge } = await render([
      agent(1, attention('IDLE_NO_WAIT')),
      agent(2, attention('BLOCKED_NO_DESK')),
      agent(3),
    ]);
    expect(badge().textContent?.trim()).toBe('2');
    expect(badge().className).toContain('bg-cinnabar-600');
    expect(badge().classList.contains('hidden')).toBe(false);
  });

  it('badges the active agents in amber when none needs a person', async () => {
    const { badge } = await render([agent(1), agent(2), agent(3)]);
    expect(badge().textContent?.trim()).toBe('3');
    expect(badge().className).toContain('bg-sunflower-gold-500');
    expect(badge().classList.contains('hidden')).toBe(false);
  });

  it('hides the badge with no active agent, and says so in the panel', async () => {
    const { badge, panel, open } = await render([]);
    expect(badge().classList.contains('hidden')).toBe(true);
    await open();
    expect(panel.textContent).toContain('No active agents');
    const all = panel.querySelector<HTMLAnchorElement>('a:last-of-type')!;
    expect(all.textContent?.trim()).toBe('All agents');
    expect(all.getAttribute('href')).toBe(`/projects/${slug}/agents`);
  });

  it('lists the agents needing a person first, then the newest activity first', async () => {
    const { fixture, panel, open } = await render([
      agent(1),
      agent(2, attention('IDLE_NO_WAIT')),
      agent(3),
      agent(4, { lastActivityAt: undefined }),
    ]);
    await open();
    const links = Array.from(panel.querySelectorAll<HTMLAnchorElement>('li > div:first-child a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      [2, 3, 1, 4].map((n) => `/projects/${slug}/agents/agent-${n}`),
    );
    expect(links[0].textContent?.replace(/\s+/g, ' ').trim()).toBe(`${slug}-2 Item 2`);

    links[0].click();
    fixture.detectChanges();
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('says what each agent is doing', async () => {
    const idleSince = '2026-10-28T09:41:00Z';
    const { panel, open } = await render([
      agent(4),
      agent(3, { activity: 'WAITING', waits: [{ id: 'w', subjectKind: 'OTHER', label: 'x' }] }),
      agent(2, { activity: 'IDLE', waitingSince: idleSince }),
      agent(1, { activity: 'ENDED' }),
    ]);
    await open();
    const chips = Array.from(panel.querySelectorAll('[data-activity]')).map((c) =>
      c.textContent?.trim(),
    );
    expect(chips).toEqual(['Working', 'Waiting', `Idle since ${clockTime(idleSince)}`, 'Ended']);
    expect(clockTime(idleSince)).toMatch(/^\d\d:\d\d$/);
  });

  it('gives each wait a line: a request with its state and lifecycle, a run, an item, comments, a label', async () => {
    const store = TestBed.inject(ProjectsStore);
    const loaded = store.loadReleaseRequests(recorded.id);
    await settle();
    http.expectOne(`/projects/api/projects/${recorded.id}/release-requests`).flush(requestsAnswer);
    await loaded;
    const { panel, open } = await render([
      agent(1, {
        activity: 'WAITING',
        waits: [
          {
            id: 'rr',
            subjectKind: 'RELEASE_REQUEST',
            subjectQualifiedId: request.qualifiedId,
          },
          { id: 'run', subjectKind: 'CI_RUN', subjectId: 'abcdef1234567', subjectState: 'RUNNING' },
          {
            id: 'item',
            subjectKind: 'WORK_ITEM',
            subjectQualifiedId: `${slug}-9`,
            subjectState: 'IMPLEMENTING',
          },
          { id: 'comments', subjectKind: 'COMMENTS', subjectQualifiedId: `${slug}-9` },
          { id: 'other', subjectKind: 'OTHER', label: 'the desk' },
        ],
      }),
    ]);
    await open();
    const lines = Array.from(panel.querySelectorAll<HTMLElement>('[data-wait]'));
    expect(lines).toHaveLength(5);
    const [rr, run, item, comments, other] = lines;
    expect(rr.querySelector('a')!.getAttribute('href')).toBe(
      `/projects/${slug}/release-requests/${request.qualifiedId}`,
    );
    expect(rr.textContent).toContain(request.state!);
    expect(rr.querySelector('ui-lifecycle-line')).not.toBeNull();
    expect(run.querySelector('a')!.getAttribute('href')).toBe(
      'https://ci.example/runs/abcdef1234567',
    );
    expect(run.textContent).toContain('CI run abcdef12');
    expect(run.textContent).toContain('RUNNING');
    expect(item.querySelector('a')!.getAttribute('href')).toBe(
      `/projects/${slug}/work/detail/${slug}-9`,
    );
    expect(item.textContent).toContain('IMPLEMENTING');
    expect(comments.textContent).toContain(`Comments on ${slug}-9`);
    expect(other.textContent).toContain('the desk');
    expect(other.querySelector('a')).toBeNull();
  });

  it('says when the item is blocked', async () => {
    const at = '2026-10-28T08:15:00Z';
    const { panel, open } = await render([
      agent(2, { entityBlocked: true, blockedAt: at }),
      agent(1, { entityBlocked: true }),
      agent(3),
    ]);
    await open();
    expect(
      Array.from(panel.querySelectorAll('[data-blocked]')).map((b) => b.textContent?.trim()),
    ).toEqual([`Blocked since ${clockTime(at)}`, 'Blocked']);
  });

  it('gives each attention its reason in cinnabar and its action', async () => {
    const { fixture, panel, open } = await render([
      agent(1, attention('IDLE_NO_WAIT')),
      agent(2, {
        ...attention('WAIT_SUBJECT_PASSED', { waitId: 'w2' }),
        waits: [{ id: 'w2', subjectKind: 'WORK_ITEM', subjectQualifiedId: `${slug}-8` }],
      }),
      agent(3, attention('BLOCKED_NO_DESK')),
      agent(4, {
        ...attention('WAIT_OVERDUE', { waitId: 'w4' }),
        waits: [{ id: 'w4', subjectKind: 'CI_RUN', subjectId: 'run-4' }],
      }),
      agent(5, {
        ...attention('WAIT_OVERDUE', { waitId: 'w5' }),
        waits: [
          { id: 'w5', subjectKind: 'RELEASE_REQUEST', subjectQualifiedId: 'qits-landing-rr-5' },
        ],
      }),
    ]);
    await open();
    const blocks = Array.from(panel.querySelectorAll<HTMLElement>('[data-attention]'));
    const byReason = (code: string) =>
      blocks.filter((b) => b.textContent?.includes(`because ${code}`));
    for (const block of blocks) {
      expect(block.querySelector('span')!.className).toContain('text-cinnabar-600');
    }
    const action = (block: HTMLElement) => block.querySelector<HTMLAnchorElement>('[data-action]')!;

    const idle = byReason('IDLE_NO_WAIT')[0];
    expect(action(idle).textContent?.trim()).toBe('Prompt agent');
    expect(action(idle).getAttribute('href')).toBe(`/projects/${slug}/agents/agent-1/chat`);
    const passed = byReason('WAIT_SUBJECT_PASSED')[0];
    expect(action(passed).getAttribute('href')).toBe(`/projects/${slug}/agents/agent-2/chat`);
    const blocked = byReason('BLOCKED_NO_DESK')[0];
    expect(action(blocked).textContent?.trim()).toBe('Open item');
    expect(action(blocked).getAttribute('href')).toBe(`/projects/${slug}/work/detail/${slug}-3`);
    // Newest activity first: agent 5 (the request) before agent 4 (the run).
    const [rr, run] = byReason('WAIT_OVERDUE');
    expect(action(run).getAttribute('href')).toBe('https://ci.example/runs/run-4');
    expect(action(rr).getAttribute('href')).toBe(
      `/projects/${slug}/release-requests/qits-landing-rr-5`,
    );

    action(blocked).click();
    fixture.detectChanges();
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('reads the agents again after a status event about the open project', async () => {
    await render([agent(1)]);
    vi.useFakeTimers();
    try {
      events.next({
        name: 'AgentAttentionChanged',
        payload: JSON.stringify({ projectId: recorded.id }),
      } as DomainEvent);
      await vi.advanceTimersByTimeAsync(1500);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    http.expectOne(agentsUrl).flush({ agents: [] });
  });
});
