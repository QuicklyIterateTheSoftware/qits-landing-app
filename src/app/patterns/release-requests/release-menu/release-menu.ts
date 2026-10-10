import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, filter } from 'rxjs';
import { DomainEvents } from '$core/events/domain-events';
import {
  affectsReleaseRequests,
  RELEASE_REQUEST_EVENTS,
} from '$core/projects/release-request-events';
import type { ReleaseRequestEntry } from '$core/projects/projects.consumes';
import { ProjectsStore } from '$core/projects/projects.store';
import { SelectedProject } from '$core/projects/selected-project';
import { Dropdown } from '$ui/components/dropdown/dropdown';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** How long a burst of domain events waits before the requests are fetched again. */
export const REFRESH_DEBOUNCE_MS = 1_000;

/** A chip's Tailwind classes, written out in full so Tailwind finds them. */
const CHIP = {
  ok: 'bg-mint-leaf-100 text-mint-leaf-800',
  waiting: 'bg-sunflower-gold-100 text-sunflower-gold-800',
  failed: 'bg-cinnabar-100 text-cinnabar-700',
  neutral: 'bg-charcoal-brown-100 text-charcoal-brown-700',
} as const;

/** A gate's, phase's or automation's state as a chip colour: passed, waiting, failed, or not known. */
export function gateTone(state: string | undefined): keyof typeof CHIP {
  switch (state) {
    case 'PASSED':
    case 'WAIVED':
    case 'FRESH':
    case 'COMMITTED':
      return 'ok';
    case 'PENDING':
    case 'RUNNING':
    case 'REQUESTED':
    case 'WAITING':
      return 'waiting';
    case 'FAILED':
      return 'failed';
    default:
      return 'neutral';
  }
}

/** What the Test phase reads while the pre-run has not finished: QA has not started. */
export const WAITING_FOR_PRE_RUN = 'waiting for pre-run';

/** The pre-run states that let QA start. */
const PRE_RUN_DONE: ReadonlySet<string> = new Set(['PASSED', 'WAIVED']);

/** An automation kind's state when it does not apply to the request: left out of the cog's count. */
export const NOT_APPLICABLE = 'NOT_APPLICABLE';

/** One of a request's two phases, as a chip shows it. */
export interface Phase {
  /** `P1 Pre-run`, `P2 Test`. */
  readonly name: string;
  readonly state: string;
  readonly tone: keyof typeof CHIP;
}

/**
 * A request's two phases, in the order they run (qits-1133): P1 Pre-run, then P2 Test. The pre-run
 * reads `preRun.state`; a request older than the pre-run carries none, and its QA never waited on
 * one, so it reads as done. Test is the `ci` quality gate's state once the pre-run is PASSED or
 * WAIVED, and {@link WAITING_FOR_PRE_RUN} before: QA starts only after the pre-run.
 */
export function phases(request: ReleaseRequestEntry): readonly [Phase, Phase] {
  const preRun = request.preRun?.state;
  const done = preRun === undefined || preRun === null || PRE_RUN_DONE.has(preRun);
  const ci = request.qualityGates?.find((gate) => gate.kind === 'ci')?.state ?? 'UNKNOWN';
  return [
    { name: 'P1 Pre-run', state: preRun ?? 'NONE', tone: preRun ? gateTone(preRun) : 'neutral' },
    done
      ? { name: 'P2 Test', state: ci, tone: gateTone(ci) }
      : { name: 'P2 Test', state: WAITING_FOR_PRE_RUN, tone: 'neutral' },
  ];
}

/** The quality gates the phases already show: the pre-run's automations and Test's CI build. */
const PHASE_GATES: ReadonlySet<string> = new Set(['automations', 'ci']);

/** A request's quality gates past its two phases (approval, publish, deployment…), in order. */
export function laterGates(request: ReleaseRequestEntry) {
  return (request.qualityGates ?? []).filter((gate) => !PHASE_GATES.has(gate.kind ?? ''));
}

/** What a request's pre-run does, for the cog: the merge, then every automation kind that applies. */
export interface PreRunSteps {
  /** 1 (the merge) plus the automation kinds that apply (every state but NOT_APPLICABLE). */
  readonly count: number;
  /** One line per step and per kind that does not apply, for the cog's tooltip. */
  readonly title: string;
}

/**
 * The cog's count and tooltip. The merge always runs; an automation kind counts unless it is
 * {@link NOT_APPLICABLE}, which the tooltip still lists, with its reason. `automations` is null
 * until qits-projects has asked qits-maintenance about the request, so then only the merge counts.
 */
export function preRunSteps(request: ReleaseRequestEntry): PreRunSteps {
  const kinds = request.automations ?? [];
  const applicable = kinds.filter((kind) => kind.state !== NOT_APPLICABLE);
  const line = (kind: (typeof kinds)[number]) =>
    `${kind.label ?? kind.kind} · ${kind.state === NOT_APPLICABLE ? 'not applicable' : kind.state}` +
    (kind.detail ? ` (${kind.detail})` : '');
  return {
    count: 1 + applicable.length,
    title: [
      'Merge',
      ...applicable.map(line),
      ...kinds.filter((k) => !applicable.includes(k)).map(line),
    ].join('\n'),
  };
}

/** A request's state as a chip colour: on its way, waiting, or stuck. */
export function requestTone(state: string | undefined): keyof typeof CHIP {
  switch (state) {
    case 'READY':
    case 'RELEASED':
      return 'ok';
    case 'PENDING':
      return 'waiting';
    case 'REJECTED':
    case 'FAILED':
    case 'CONFLICTED':
      return 'failed';
    default:
      return 'neutral';
  }
}

/**
 * The top bar's lightning menu: the open project's pending release requests, each with its state,
 * its two phases in order (P1 Pre-run, then P2 Test, {@link phases}), a cog counting what its
 * pre-run does ({@link preRunSteps}) and its later quality gates. Shown only while a project is
 * open, like the settings gear beside it.
 *
 * The requests are fetched as soon as a project opens (`loadReleaseRequests`), so the button
 * carries their count right away (none when nothing is pending). They are fetched again when a
 * domain event says they may have changed ({@link RELEASE_REQUEST_EVENTS}, filtered to the open
 * project by `affectsReleaseRequests`), at most once a second, since one release sends several.
 * The button and the panel are `ui-dropdown`'s.
 */
@Component({
  selector: 'app-release-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, Spinner],
  // One display class or the other: a static display class would beat `hidden`. `ml-auto` pushes
  // the menu and the settings gear after it to the right end of the top bar.
  host: {
    '[class]': "projectId() ? 'inline-flex' : 'hidden'",
  },
  template: `
    <ui-dropdown
      label="Release requests"
      panelLabel="Pending release requests"
      panelId="release-menu"
      (opened)="load()"
    >
      <svg
        dropdown-trigger
        viewBox="0 0 24 24"
        aria-hidden="true"
        class="size-5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
      </svg>
      <span
        dropdown-trigger
        class="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-sunflower-gold-500 px-1 text-[0.625rem] leading-4 font-semibold text-charcoal-brown-950"
        [class.hidden]="!count()"
        aria-hidden="true"
        >{{ count() }}</span
      >
      <ui-spinner dropdown-panel [state]="state()" class="min-h-16">
        <ul class="m-0 list-none p-0">
          @for (request of pending(); track request.id) {
            <li class="flex flex-col gap-1 border-b border-gray-100 px-3 py-2 last:border-b-0">
              <div class="flex items-baseline justify-between gap-2">
                <span class="truncate text-sm font-semibold text-gray-900">{{
                  request.repoName
                }}</span>
                <span
                  class="shrink-0 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold"
                  [class]="chip(requestTone(request.state))"
                  >{{ request.state }}</span
                >
              </div>
              <span class="truncate text-[0.8125rem] text-gray-600">{{ request.summary }}</span>
              <span class="flex flex-wrap items-center gap-1">
                @let steps = preRunSteps(request);
                <span
                  class="inline-flex items-center gap-0.5 rounded px-1 text-[0.6875rem] leading-4 text-charcoal-brown-700"
                  role="img"
                  [attr.aria-label]="steps.count + ' pre-run steps: ' + steps.title"
                  [attr.title]="steps.title"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    class="size-3"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path
                      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                    />
                  </svg>
                  {{ steps.count }}
                </span>
                @for (phase of phases(request); track phase.name) {
                  <span class="rounded px-1.5 text-[0.6875rem] leading-4" [class]="chip(phase.tone)"
                    >{{ phase.name }} · {{ phase.state }}</span
                  >
                }
                @for (gate of laterGates(request); track gate.kind) {
                  <span
                    class="rounded px-1.5 text-[0.6875rem] leading-4"
                    [class]="chip(gateTone(gate.state))"
                    >{{ gate.label ?? gate.kind }} · {{ gate.state }}</span
                  >
                }
              </span>
            </li>
          }
        </ul>
        <p
          class="m-0 px-3 py-4 text-center text-sm text-gray-500"
          [class.hidden]="state() !== 'loaded' || pending().length > 0"
        >
          No pending release requests
        </p>
      </ui-spinner>
    </ui-dropdown>
  `,
})
export class ReleaseMenu {
  private readonly store = inject(ProjectsStore);
  private readonly selected = inject(SelectedProject);
  protected readonly gateTone = gateTone;
  protected readonly requestTone = requestTone;
  protected readonly phases = phases;
  protected readonly laterGates = laterGates;
  protected readonly preRunSteps = preRunSteps;

  /** The open project's id, once the list holds it. */
  protected readonly projectId = computed(() => this.selected.project()?.id);

  private readonly requests = computed(() => {
    const id = this.projectId();
    return id === undefined ? undefined : this.store.releaseRequests()[id];
  });

  protected readonly pending = computed(() => this.requests()?.pending ?? []);

  /** How many are pending, once fetched; undefined before the first opening. */
  protected readonly count = computed(() =>
    this.requests()?.status === 'loaded' ? this.pending().length : undefined,
  );

  protected readonly state = computed((): LoadState => {
    const status = this.requests()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

  protected chip(tone: keyof typeof CHIP): string {
    return CHIP[tone];
  }

  constructor() {
    effect(() => {
      const id = this.projectId();
      if (id !== undefined) untracked(() => void this.store.loadReleaseRequests(id));
    });
    inject(DomainEvents)
      .on(RELEASE_REQUEST_EVENTS)
      .pipe(
        filter((event) => {
          const id = this.projectId();
          return id !== undefined && affectsReleaseRequests(event, id, this.pending());
        }),
        debounceTime(REFRESH_DEBOUNCE_MS),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        const id = this.projectId();
        if (id !== undefined) void this.store.refreshReleaseRequests(id);
      });
  }

  /** Fetches the open project's requests if nothing has yet (opening the menu after a failure). */
  protected load(): void {
    const id = this.projectId();
    if (id !== undefined) void this.store.loadReleaseRequests(id);
  }
}
