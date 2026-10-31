import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { agentPath } from '$core/workspaces/agent-attention';
import {
  activityLabel,
  agentName,
  agentWaitLabel,
  runStateLabel,
} from '$core/workspaces/agent-labels';
import { Chip, type ChipTone } from '$ui/components/chip/chip';

/** What a row reads of an agent: what every agent read of the workspace pages holds. */
export interface AgentRowData {
  readonly agentId?: string;
  readonly entityId?: string;
  readonly entityTitle?: string;
  readonly entityStatus?: string;
  readonly state?: string;
  readonly runState?: string;
  readonly admin?: boolean;
  readonly harness?: string;
  readonly activity?: string;
  readonly waitingOn?: string;
  readonly waitingOnSince?: string;
  readonly wrapperBranch?: string;
}

/** A lifecycle state's chip tone. */
const STATE_TONES: Readonly<Record<string, ChipTone>> = { ACTIVE: 'ok', OBSOLETE: 'neutral' };

/**
 * One agent, as the Agents and slot pages list it (qits-workspaces-frontend's agent rows): its
 * work item's qualified id, a link to the agent's page (`/projects/<slug>/agents/<agent id>`, epic
 * qits-1681), the item's title, its state and run state, what it is doing, and — on a line of its own
 * — what it waits on and since when (qits-1229). "waiting on you" only when it waits for input and
 * declared no wait: a wait on a release request, a CI run or a work item is not a person's.
 * `wrapperBranch` and `harness` show when given. Projected content (the Agents page's waits and
 * attention, `app-agent-status`) goes last.
 */
@Component({
  selector: 'app-agent-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, RouterLink],
  host: { class: 'block' },
  template: `
    <div
      class="flex flex-col gap-1 rounded-md border border-charcoal-brown-200 px-4 py-2.5 text-sm"
    >
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        @if (link(); as path) {
          <a
            class="font-semibold text-ocean-deep-700 no-underline hover:underline"
            [routerLink]="path"
            >{{ name() }}</a
          >
        } @else {
          <span class="font-semibold text-charcoal-brown-900">{{ name() }}</span>
        }
        @if (agent().entityTitle; as title) {
          <span class="min-w-0 text-charcoal-brown-800">{{ title }}</span>
        }
      </div>
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-charcoal-brown-600">
        <ui-chip [label]="state()" [tone]="stateTone()" />
        <span>{{ runState() }}</span>
        @if (doing(); as doing) {
          <span aria-hidden="true">·</span>
          <span
            [class.font-semibold]="doing === 'waiting on you'"
            [class.text-cinnabar-700]="doing === 'waiting on you'"
            >{{ doing }}</span
          >
        }
        @if (agent().harness; as harness) {
          <span aria-hidden="true">·</span>
          <span>{{ harness.toLowerCase() }}</span>
        }
        @if (agent().admin) {
          <ui-chip label="docker socket" tone="waiting" />
        }
      </div>
      @if (wait(); as wait) {
        <p class="m-0 text-sunflower-gold-800" role="status">{{ wait }}</p>
      }
      @if (agent().wrapperBranch; as branch) {
        <code class="font-mono text-xs text-charcoal-brown-600">{{ branch }}</code>
      }
      <ng-content />
    </div>
  `,
})
export class AgentRow {
  readonly agent = input.required<AgentRowData>();
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
  protected readonly link = computed(() => {
    const slug = this.slug();
    const id = this.agent().agentId?.trim();
    return slug && id ? agentPath(slug, id) : undefined;
  });
}
