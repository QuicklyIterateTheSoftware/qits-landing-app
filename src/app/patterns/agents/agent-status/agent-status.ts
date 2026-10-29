import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { ProjectsStore } from '$core/projects/projects.store';
import { SelectedProject } from '$core/projects/selected-project';
import { WorkStore } from '$core/work/work.store';
import {
  agentPath,
  attentionAction,
  waitSubject,
  type AttentionAgent,
  type WaitContext,
  type WaitSubject,
} from '$core/workspaces/agent-attention';

/**
 * What the lines read of an agent: its id (for Prompt agent), its run state (STOPPED is said), its
 * item, waits and attention.
 */
export interface AgentStatusData extends AttentionAgent {
  readonly agentId?: string;
  readonly runState?: string | null;
}

/** One wait's line. */
interface WaitLine {
  readonly id: string;
  readonly subject: WaitSubject;
}

/**
 * What an agent waits on and what it needs a person for (epic qits-1681), as the Agents page's rows
 * and the agent page's header show it: a line per open wait (`waitSubject`: the subject, linked
 * where it has a page, and its state), then, when the agent needs a person, the attention's reason
 * in cinnabar with its action (`attentionAction`: Prompt agent → the agent page's Chat tab, Open
 * item → the item, or the overdue wait's subject). A STOPPED agent (epic qits-1667) says so first:
 * a person stopped it, and nothing starts it again until somebody restarts or prompts it. Shows
 * nothing for an agent with none of these.
 *
 * The context is what the app already holds: the open project's slug, its release requests
 * (`ProjectsStore`) and its work (`WorkStore`), and qits-ci's page origin; it reads nothing itself.
 */
@Component({
  selector: 'app-agent-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'block' },
  template: `
    @if (agent().runState === 'STOPPED') {
      <p class="m-0 text-sm text-charcoal-brown-600" data-stopped>
        <strong class="font-semibold text-charcoal-brown-900">stopped</strong> by a person: it
        starts again when somebody restarts or prompts it.
      </p>
    }
    @for (wait of waits(); track wait.id) {
      <p
        class="m-0 flex flex-wrap items-baseline gap-x-2 text-sm text-charcoal-brown-600"
        data-wait
      >
        <span>waits on</span>
        @if (wait.subject.link; as link) {
          @if (isAppPath(link)) {
            <a class="text-ocean-deep-700" [routerLink]="link">{{ wait.subject.text }}</a>
          } @else {
            <a class="text-ocean-deep-700" [href]="link">{{ wait.subject.text }}</a>
          }
        } @else {
          <span class="text-charcoal-brown-900">{{ wait.subject.text }}</span>
        }
        @if (wait.subject.state; as state) {
          <span class="text-xs font-semibold">{{ state }}</span>
        }
      </p>
    }
    @if (action(); as action) {
      <p class="m-0 flex flex-wrap items-baseline gap-x-2 text-sm" data-attention>
        <span class="text-cinnabar-700">{{ agent().attention?.reason }}</span>
        @switch (action.kind) {
          @case ('prompt') {
            @if (chat(); as chat) {
              <a class="font-semibold text-charcoal-brown-900" [routerLink]="chat" data-action>{{
                action.label
              }}</a>
            }
          }
          @case ('open-item') {
            @if (action.link; as link) {
              <a class="font-semibold text-charcoal-brown-900" [routerLink]="link" data-action>{{
                action.label
              }}</a>
            }
          }
          @case ('subject') {
            @if (action.subject.link; as link) {
              @if (isAppPath(link)) {
                <a class="font-semibold text-charcoal-brown-900" [routerLink]="link" data-action>{{
                  action.label
                }}</a>
              } @else {
                <a class="font-semibold text-charcoal-brown-900" [href]="link" data-action>{{
                  action.label
                }}</a>
              }
            }
          }
        }
      </p>
    }
  `,
})
export class AgentStatus {
  readonly agent = input.required<AgentStatusData>();

  private readonly selected = inject(SelectedProject);
  private readonly projects = inject(ProjectsStore);
  private readonly work = inject(WorkStore);
  private readonly origins = inject(PlatformOrigins);

  private readonly context = computed((): WaitContext => {
    const id = this.selected.project()?.id;
    return {
      slug: this.selected.slug() ?? '',
      ciOrigin: this.origins.page('ci') || undefined,
      releaseRequests:
        (id === undefined ? undefined : this.projects.releaseRequests()[id]?.requests) ?? [],
      work: (id === undefined ? undefined : this.work.byProject()[id]?.entries) ?? [],
    };
  });

  protected readonly waits = computed((): readonly WaitLine[] =>
    (this.agent().waits ?? []).map((wait, index) => ({
      id: wait.id ?? String(index),
      subject: waitSubject(wait, this.context()),
    })),
  );

  protected readonly action = computed(() => attentionAction(this.agent(), this.context()));

  /** The agent page's Chat tab, for Prompt agent. */
  protected readonly chat = computed(() => {
    const slug = this.context().slug;
    const id = this.agent().agentId;
    return slug && id ? agentPath(slug, id, 'chat') : null;
  });

  /** Whether a link is the app's own (a router link) rather than another app's page. */
  protected isAppPath(link: string): boolean {
    return link.startsWith('/');
  }
}
