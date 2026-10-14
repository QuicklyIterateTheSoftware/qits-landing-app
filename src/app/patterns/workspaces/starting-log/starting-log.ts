import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import {
  ProcessLog,
  segmentLabel,
  segmentStatusLabel,
  type ProcessOutcome,
  type ProcessSegment,
} from '$core/workspaces/process-log';
import { SegmentLog, type LogSegment } from '$ui/components/segment-log/segment-log';

/** What the log says above its segments, per outcome. */
const LEDES: Readonly<Record<ProcessOutcome, string>> = {
  running: 'The container is coming up.',
  ok: 'The container is up.',
  failed: 'Starting the container failed.',
  expired: 'The log ended before the start finished (it may have expired).',
};

/** The sentence below a failed segment that carries a classification; none otherwise. */
export function segmentNote(segment: ProcessSegment): string | undefined {
  if (!segment.hint) return undefined;
  if (segment.hint === 'remote-auth' && segment.hintTarget) {
    return `This step needs to sign in to ${segment.hintTarget}.`;
  }
  return segment.hintTarget
    ? `The failure is classified as ${segment.hint}, for ${segment.hintTarget}.`
    : `The failure is classified as ${segment.hint}.`;
}

/**
 * The log of the start bringing a slot's container up (qits-workspaces-frontend's Starting tab),
 * followed live from its own stream (`ProcessLog`): a runner-placed start opens with its `queued`
 * wait, named by the service's own words ("waiting for a slot on localhost"), then `container`,
 * `clone` and the rest. A region named "Starting".
 */
@Component({
  selector: 'app-starting-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegmentLog],
  providers: [ProcessLog],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-2" aria-label="Starting">
      <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">Starting</h2>
      <ui-segment-log [segments]="segments()" [lede]="lede()" [waiting]="running()" />
    </section>
  `,
})
export class StartingLog {
  /** The technical process starting the container. */
  readonly processId = input.required<string>();

  private readonly log = inject(ProcessLog);

  protected readonly segments = computed((): readonly LogSegment[] =>
    this.log.state().segments.map((segment) => ({
      name: segment.name,
      label: segmentLabel(segment),
      status: segment.status,
      badge: segmentStatusLabel(segment),
      lines: segment.lines,
      note: segmentNote(segment),
    })),
  );

  protected readonly lede = computed(() => LEDES[this.log.state().outcome]);

  protected readonly running = computed(() => this.log.state().outcome === 'running');

  constructor() {
    effect(() => this.log.follow(this.processId()));
  }
}
