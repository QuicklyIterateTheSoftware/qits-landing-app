import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { exit, outcomes, QitsEntity, QitsExit, QitsField } from '@qits/angular';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { ProjectsStore } from '$core/projects/projects.store';
import { SelectedProject } from '$core/projects/selected-project';
import { WorkStore } from '$core/work/work.store';
import {
  attentionAction,
  waitSubject,
  type WaitContext,
  type WaitSubject,
} from '$core/workspaces/agent-attention';
import type { AgentWait, ProjectStatusAgent } from '$core/workspaces/agents.consumes';

/**
 * What an agent waits on and what it needs a person for (epic qits-1681), as the Agents page's rows
 * and the agent page's header show it: a line per open wait (`waitSubject`: the subject, linked
 * where it has a page, and its state), then, when the agent needs a person, the attention's reason
 * in the danger tone with its action (`attentionAction`: Prompt agent → the agent page's Chat tab, Open
 * item → the item, or the overdue wait's subject). A STOPPED agent (epic qits-1667) says so first:
 * a person stopped it, and nothing starts it again until somebody restarts or prompts it. Shows
 * nothing for an agent with none of these.
 *
 * Its links are declared exits (epic qits-2000), chosen in the template by the subject's kind: a
 * wait's subject (`open-agent-wait`: its release request, its work item, the item whose comments it
 * waits on) and the attention's action (`act-on-agent-attention`: Prompt agent → the Chat tab, Open
 * item → the item, an overdue release request → the request). A run is qits-ci's page, a plain
 * link. qits-workspaces calls a wait overdue only on a release request or a run, so no other
 * subject has an overdue action.
 *
 * The context is what the app already holds: the open project's slug, its release requests
 * (`ProjectsStore`) and its work (`WorkStore`), and qits-ci's page origin; it reads nothing itself.
 *
 * Its agent is one of the project's ACTIVE agents as `PROJECT_AGENTS` cuts it (the Agents page's
 * rows, the agent page's header), and it marks what it shows (qits-2141): the agent
 * (`qitsEntity`, by `agentId`) around every line, each wait's line its wait (by `id`), each
 * subject's words and state derived from the wait's own fields, the attention's reason its field
 * and its action derived from the attention. A subject's state, and a release request's or an
 * item's words, may come from `ProjectsStore` or `WorkStore` rather than the wait: the marks name
 * the wait's fields only.
 */
@Component({
  selector: 'app-agent-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsEntity, QitsExit, QitsField],
  host: { class: 'block' },
  template: `
    <div [qitsEntity]="agent()" entityKey="agentId">
      @if (agent().runState === 'STOPPED') {
        <p
          class="m-0 text-sm text-fg-soft"
          data-stopped
          [fieldOf]="agent()"
          [qitsField]="{ derived: ['runState'] }"
        >
          <strong class="font-semibold text-fg">stopped</strong> by a person: it starts again when
          somebody restarts or prompts it.
        </p>
      }
      @for (wait of agent().waits ?? []; track wait.id ?? $index) {
        @let subject = subjectOf(wait);
        <p
          class="m-0 flex flex-wrap items-baseline gap-x-2 text-sm text-fg-soft"
          data-wait
          [qitsEntity]="wait"
          entityKey="id"
        >
          <span>waits on</span>
          @switch (slug() && subject.id ? subject.kind : null) {
            @case ('RELEASE_REQUEST') {
              <a
                class="text-accent"
                [qitsExit]="opening.releaseRequest"
                [exitParams]="{ slug: slug(), requestId: subject.id! }"
                [fieldOf]="wait"
                [qitsField]="{
                  derived: [
                    'subjectKind',
                    'subjectQualifiedId',
                    'subjectId',
                    'subjectRef',
                    'label',
                  ],
                }"
                >{{ subject.text }}</a
              >
            }
            @case ('WORK_ITEM') {
              <a
                class="text-accent"
                [qitsExit]="opening.workItem"
                [exitParams]="{ slug: slug(), id: subject.id! }"
                [fieldOf]="wait"
                [qitsField]="{
                  derived: [
                    'subjectKind',
                    'subjectQualifiedId',
                    'subjectId',
                    'subjectRef',
                    'label',
                  ],
                }"
                >{{ subject.text }}</a
              >
            }
            @case ('COMMENTS') {
              <a
                class="text-accent"
                [qitsExit]="opening.comments"
                [exitParams]="{ slug: slug(), id: subject.id! }"
                [fieldOf]="wait"
                [qitsField]="{
                  derived: [
                    'subjectKind',
                    'subjectQualifiedId',
                    'subjectId',
                    'subjectRef',
                    'label',
                  ],
                }"
                >{{ subject.text }}</a
              >
            }
            @default {
              @if (subject.href; as href) {
                <a
                  class="text-accent"
                  [href]="href"
                  [fieldOf]="wait"
                  [qitsField]="{ derived: ['subjectKind', 'subjectId', 'subjectRef', 'label'] }"
                  >{{ subject.text }}</a
                >
              } @else {
                <span
                  class="text-fg"
                  [fieldOf]="wait"
                  [qitsField]="{ derived: ['subjectKind', 'subjectId', 'subjectRef', 'label'] }"
                  >{{ subject.text }}</span
                >
              }
            }
          }
          @if (subject.state; as state) {
            <span
              class="text-xs font-semibold"
              [fieldOf]="wait"
              [qitsField]="{ derived: ['subjectKind', 'subjectState'] }"
              >{{ state }}</span
            >
          }
        </p>
      }
      @if (action(); as action) {
        <p class="m-0 flex flex-wrap items-baseline gap-x-2 text-sm" data-attention>
          <span class="text-danger" [fieldOf]="agent()" qitsField="attention.reason">{{
            agent().attention?.reason
          }}</span>
          @switch (action.kind) {
            @case ('prompt') {
              @if (slug() && agent().agentId; as agentId) {
                <a
                  class="font-semibold text-fg"
                  [qitsExit]="acting.prompt"
                  [exitParams]="{ slug: slug(), agentId }"
                  [fieldOf]="agent()"
                  [qitsField]="{ derived: ['attention.code', 'attention.waitId', 'waits'] }"
                  data-action
                  >{{ action.label }}</a
                >
              }
            }
            @case ('open-item') {
              @if (slug() && action.itemId; as id) {
                <a
                  class="font-semibold text-fg"
                  [qitsExit]="acting.openItem"
                  [exitParams]="{ slug: slug(), id }"
                  [fieldOf]="agent()"
                  [qitsField]="{ derived: ['attention.code', 'entityId'] }"
                  data-action
                  >{{ action.label }}</a
                >
              }
            }
            @case ('subject') {
              @if (
                slug() && action.subject.kind === 'RELEASE_REQUEST' && action.subject.id;
                as requestId
              ) {
                <a
                  class="font-semibold text-fg"
                  [qitsExit]="acting.overdueRequest"
                  [exitParams]="{ slug: slug(), requestId }"
                  [fieldOf]="agent()"
                  [qitsField]="{ derived: ['attention.code', 'attention.waitId', 'waits'] }"
                  data-action
                  >{{ action.label }}</a
                >
              } @else if (action.subject.href; as href) {
                <a
                  class="font-semibold text-fg"
                  [href]="href"
                  [fieldOf]="agent()"
                  [qitsField]="{ derived: ['attention.code', 'attention.waitId', 'waits'] }"
                  data-action
                  >{{ action.label }}</a
                >
              }
            }
          }
        </p>
      }
    </div>
  `,
})
export class AgentStatus {
  readonly agent = input.required<ProjectStatusAgent>();

  private readonly selected = inject(SelectedProject);
  private readonly projects = inject(ProjectsStore);
  private readonly work = inject(WorkStore);
  private readonly origins = inject(PlatformOrigins);

  /** A wait's subject, one exit per kind that has a page here (epic qits-2000). */
  protected readonly opening = outcomes('open-agent-wait', {
    releaseRequest: exit('projects/:slug/release-requests/:requestId'),
    workItem: exit('projects/:slug/work/detail/:id'),
    comments: exit('projects/:slug/work/detail/:id'),
  });

  /** What to do about the agent's attention, one exit per action (epic qits-2000). */
  protected readonly acting = outcomes('act-on-agent-attention', {
    prompt: exit('projects/:slug/agents/:agentId/chat'),
    openItem: exit('projects/:slug/work/detail/:id'),
    overdueRequest: exit('projects/:slug/release-requests/:requestId'),
  });

  /** The open project's slug, the exits' param. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

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

  /** What the wait `wait` waits on, as its line says it (`waitSubject`, in the open project). */
  protected subjectOf(wait: AgentWait): WaitSubject {
    return waitSubject(wait, this.context());
  }

  protected readonly action = computed(() => attentionAction(this.agent(), this.context()));
}
