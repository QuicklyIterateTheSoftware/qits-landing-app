import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { exit, outcomes, QitsEntity, QitsExit, QitsField } from '@qits/angular';
import {
  activityLabel,
  agentName,
  agentWaitLabel,
  runStateLabel,
} from '$core/workspaces/agent-labels';
import type { ProjectStatusAgent, SlotAgent } from '$core/workspaces/agents.consumes';
import { Chip, type ChipTone } from '$ui/components/chip/chip';

/**
 * The agents a row shows, as their reads cut them (qits-2143): the Agents page's ACTIVE agents
 * (`PROJECT_AGENTS`) and a slot's hosted agents (`LIST_SLOT_AGENTS`). Typed from the consumed client
 * answers, so a field the row shows is one those reads, and their pacts, hold.
 */
export type AgentRowAgent = ProjectStatusAgent | SlotAgent;

/** A lifecycle state's chip tone. */
const STATE_TONES: Readonly<Record<string, ChipTone>> = { ACTIVE: 'ok', OBSOLETE: 'neutral' };

/**
 * One agent, as the Agents and slot pages list it (qits-workspaces-frontend's agent rows): its
 * work item's qualified id, a link to the agent's page (`/projects/<slug>/agents/<agent id>`, epic
 * qits-1681; the declared exit `open-agent-row` `open`, epic qits-2000), the item's title, its state and run state, what it is doing, and — on a line of its own
 * — what it waits on and since when (qits-1229). "waiting on you" only when it waits for input and
 * declared no wait: a wait on a release request, a CI run or a work item is not a person's.
 * `wrapperBranch` and `harness` show when given. Projected content (the Agents page's waits and
 * attention, `app-agent-status`) goes last.
 *
 * It marks what it shows (qits-2141): the row is the agent (`qitsEntity`, by `agentId`), its title
 * and branch are fields, and every label computed from fields (the name, the state, the run state,
 * the activity, the wait, the harness, the docker socket chip) is marked derived from those fields.
 */
@Component({
  selector: 'app-agent-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, QitsEntity, QitsExit, QitsField],
  host: { class: 'block' },
  template: `
    <div
      class="flex flex-col gap-1 rounded-md border border-line px-4 py-2.5 text-sm"
      [qitsEntity]="agent()"
      entityKey="agentId"
    >
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        @if (link(); as params) {
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="opening.open"
            [exitParams]="params"
            [fieldOf]="agent()"
            [qitsField]="{ derived: ['entityId', 'agentId'] }"
            >{{ name() }}</a
          >
        } @else {
          <span
            class="font-semibold text-fg"
            [fieldOf]="agent()"
            [qitsField]="{ derived: ['entityId', 'agentId'] }"
            >{{ name() }}</span
          >
        }
        @if (agent().entityTitle; as title) {
          <span class="min-w-0 text-fg" [fieldOf]="agent()" qitsField="entityTitle">{{
            title
          }}</span>
        }
      </div>
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-fg-soft">
        <ui-chip
          [label]="state()"
          [tone]="stateTone()"
          [fieldOf]="agent()"
          [qitsField]="{ derived: ['state'] }"
        />
        <span [fieldOf]="agent()" [qitsField]="{ derived: ['runState'] }">{{ runState() }}</span>
        @if (doing(); as doing) {
          <span aria-hidden="true">·</span>
          <span
            [class.font-semibold]="doing === 'waiting on you'"
            [class.text-danger]="doing === 'waiting on you'"
            [fieldOf]="agent()"
            [qitsField]="{ derived: ['activity', 'waitingOn', 'entityStatus'] }"
            >{{ doing }}</span
          >
        }
        @if (agent().harness; as harness) {
          <span aria-hidden="true">·</span>
          <span [fieldOf]="agent()" [qitsField]="{ derived: ['harness'] }">{{
            harness.toLowerCase()
          }}</span>
        }
        @if (agent().admin) {
          <ui-chip
            label="docker socket"
            tone="waiting"
            [fieldOf]="agent()"
            [qitsField]="{ derived: ['admin'] }"
          />
        }
      </div>
      @if (wait(); as wait) {
        <p
          class="m-0 text-warning"
          role="status"
          [fieldOf]="agent()"
          [qitsField]="{ derived: ['waitingOn', 'waitingOnSince'] }"
        >
          {{ wait }}
        </p>
      }
      @if (agent().wrapperBranch; as branch) {
        <code
          class="font-mono text-xs text-fg-soft"
          [fieldOf]="agent()"
          qitsField="wrapperBranch"
          >{{ branch }}</code
        >
      }
      <ng-content />
    </div>
  `,
})
export class AgentRow {
  readonly agent = input.required<AgentRowAgent>();
  /** The open project's slug, for the link to the agent's page; no link without it. */
  readonly slug = input<string | undefined>(undefined);

  protected readonly name = computed(() => agentName(this.agent()));
  protected readonly state = computed(() => (this.agent().state ?? 'unknown').toLowerCase());
  protected readonly stateTone = computed(
    (): ChipTone => STATE_TONES[this.agent().state ?? ''] ?? 'neutral',
  );
  protected readonly runState = computed(() => runStateLabel(this.agent()));
  protected readonly doing = computed(() =>
    activityLabel(this.agent().activity, this.agent().waitingOn, this.agent().entityStatus),
  );
  protected readonly wait = computed(() => agentWaitLabel(this.agent()));
  protected readonly opening = outcomes('open-agent-row', {
    open: exit('projects/:slug/agents/:agentId'),
  });

  /** The agent page's exit params; none without the slug and the agent's id. */
  protected readonly link = computed(() => {
    const slug = this.slug();
    const agentId = this.agent().agentId?.trim();
    return slug && agentId ? { slug, agentId } : undefined;
  });
}
