import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SlotDetail } from '$core/workspaces/agents.consumes';
import {
  daemonState,
  placementNote,
  relativeSince,
  runnerName,
  runtimeLabel,
} from '$core/workspaces/agent-labels';
import { Chip, type ChipTone } from '$ui/components/chip/chip';

/** A container state's chip tone. */
const RUNTIME_TONES: Readonly<Record<string, ChipTone>> = {
  RUNNING: 'ok',
  STOPPED: 'neutral',
  PROVISIONING: 'waiting',
  QUEUED: 'waiting',
  FAILED: 'failed',
  UNAVAILABLE: 'failed',
};

/**
 * A slot's status strip (qits-workspaces-frontend's `status-strip`, read only): the container
 * (its state, where it is placed and why, and its error), the runner, the daemon (connected since
 * when and its version; or not connected; or no container to hold one), whether it is an admin
 * slot, and how many agents it hosts. The verbs (start, stop, recreate) come with the writes.
 */
@Component({
  selector: 'app-slot-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip],
  host: { class: 'block' },
  template: `
    <dl
      class="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 rounded-md border border-charcoal-brown-200 px-4 py-3 text-sm"
      aria-label="Status"
    >
      <dt class="font-semibold text-charcoal-brown-700">Container</dt>
      <dd class="m-0 flex flex-wrap items-center gap-2 text-charcoal-brown-900">
        <ui-chip [label]="runtime()" [tone]="tone()" />
        <span class="text-charcoal-brown-600">{{ placement() }}</span>
        @if (slot().runtimeError; as fault) {
          <span class="text-cinnabar-700" role="alert">{{ fault }}</span>
        }
      </dd>

      <dt class="font-semibold text-charcoal-brown-700">Runner</dt>
      <dd class="m-0 text-charcoal-brown-900">
        @if (runner(); as name) {
          {{ name }}
        } @else if (slot().placement === 'RUNNER') {
          <span class="text-charcoal-brown-600">none yet</span>
        } @else {
          <span class="text-charcoal-brown-600">the platform host</span>
        }
      </dd>

      <dt class="font-semibold text-charcoal-brown-700">Daemon</dt>
      <dd class="m-0 flex flex-wrap items-center gap-2 text-charcoal-brown-900">
        @switch (daemon()) {
          @case ('connected') {
            <span
              >connected {{ daemonSince() }}
              @if (slot().daemonVersion; as version) {
                · version <code class="font-mono text-xs">{{ version }}</code>
              }
            </span>
            @if (slot().daemonOutdated) {
              <ui-chip label="outdated" tone="waiting" />
            }
          }
          @case ('gone') {
            <span class="text-cinnabar-700"
              >Not connected: files, terminals and the agent surface cannot work right now. It
              usually comes back on its own.</span
            >
          }
          @case ('not-running') {
            <span class="text-charcoal-brown-600"
              >No container running, so there is no daemon to reach.</span
            >
          }
        }
      </dd>

      @if (hosted() !== undefined) {
        <dt class="font-semibold text-charcoal-brown-700">Agents</dt>
        <dd class="m-0 text-charcoal-brown-900">{{ hostedLabel() }}</dd>
      }

      @if (slot().admin) {
        <dt class="font-semibold text-charcoal-brown-700">Admin</dt>
        <dd class="m-0 flex items-center gap-2 text-charcoal-brown-900">
          <ui-chip label="docker socket" tone="waiting" />
          <span class="text-charcoal-brown-600">its container holds the host's docker socket</span>
        </dd>
      }
    </dl>
  `,
})
export class SlotStatus {
  readonly slot = input.required<SlotDetail>();
  /** How many agents the slot hosts; the row is left out while unknown. */
  readonly hosted = input<number | undefined>(undefined);

  protected readonly runtime = computed(() => runtimeLabel(this.slot().runtimeStatus));
  protected readonly tone = computed(
    (): ChipTone => RUNTIME_TONES[this.slot().runtimeStatus ?? ''] ?? 'neutral',
  );
  protected readonly placement = computed(() => placementNote(this.slot()));
  protected readonly runner = computed(() => runnerName(this.slot()));
  protected readonly daemon = computed(() => daemonState(this.slot()));
  protected readonly daemonSince = computed(() => {
    const at = this.slot().daemonConnectedAt;
    return at ? relativeSince(at) : '';
  });
  protected readonly hostedLabel = computed(() => {
    const count = this.hosted() ?? 0;
    return count === 1 ? '1 agent' : `${count} agents`;
  });
}
