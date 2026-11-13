import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { exit, outcomes, QitsEntity, QitsExit, QitsField } from '@qits/angular';
import type { ReleaseRequestEntry } from '$core/projects/projects.consumes';
import {
  FROZEN_TITLE,
  freezeChip,
  freezeCount,
  nobodyWatching,
  participantsOf,
  queuedBehind,
  releaseRequestRef,
  requestBadge,
  requestItems,
  shortSha,
  utcMinute,
} from '$core/projects/release-requests';
import { attentionOf, lifecycleSummary } from '$core/release-requests/release-lifecycle';
import { Chip, chipClass } from '$ui/components/chip/chip';
import { LifecycleLine } from '$ui/components/lifecycle-line/lifecycle-line';
import { ReleaseWithdraw } from '$patterns/release-requests/release-withdraw/release-withdraw';

/**
 * One row of the Release Requests page (`li[app-release-request-row]`, qits-2146): a request of
 * the open project's list, as `ProjectReleaseRequests` read it, which the page hands each row.
 *
 * It shows the request's state (or "awaiting approval"), its priority, "nobody watching" for a
 * stopped request a machine asked for, its logical id (`<repository>-rr-<n>`; the repository where
 * an older answer has none), what it carries (qits-1673: per item, the work item its branch names,
 * linked to the item's page, and its title, else the branch's label; the source branches on an
 * older answer without items), when it last changed, its version, its merged commit, who asked (its
 * participants, comma-joined, or `–`), the service's detail, and its lifecycle as a line (cog,
 * phase chips, gate shields). The soft feature freeze (epic qits-1580): a frozen request has a
 * `frozen 3/3` chip, a queued one `queued behind <id>` (a link to that request), and an open one
 * that is neither a quiet count of its counted branches (`1/3`). A request that needs a person is
 * ringed, with a link to that check. The logical id and each item's text link to the request's own
 * page, `release-requests/<logical id>` (its uuid where it has no logical id). Every link is a
 * declared exit (`open-listed-release-request`, epic qits-2000). A request that can still be called
 * off has Withdraw.
 *
 * The row is a component of its own so that what it shows is traced to the client's answer (its
 * `request` input is a `ReleaseRequestEntry`) and carries the data marks (qits-2141): the row is
 * the request (`qitsEntity` by `id`), each value its field or the fields it is derived from.
 */
@Component({
  selector: 'li[app-release-request-row]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, LifecycleLine, QitsEntity, QitsExit, QitsField, ReleaseWithdraw],
  host: {
    class: 'rounded-md border px-3 py-2',
    '[class]':
      "needs().length ? 'border-warning-line bg-warning-soft ring-1 ring-warning-line' : 'border-line bg-surface'",
  },
  template: `
    @let row = request();
    @let badge = badgeOf(row);
    @let first = needs()[0];
    <div class="contents" [qitsEntity]="row" entityKey="id">
      <div class="flex flex-wrap items-baseline gap-2">
        <ui-chip
          [label]="badge.label"
          [tone]="badge.tone"
          [fieldOf]="row"
          [qitsField]="{ derived: ['state', 'approvalRequired', 'approvalState'] }"
        />
        <ui-chip
          [class.hidden]="!row.priority"
          [label]="(row.priority ?? '').toLowerCase()"
          title="The highest priority among this request’s branches"
          [fieldOf]="row"
          [qitsField]="{ derived: ['priority'] }"
        />
        <ui-chip
          [class.hidden]="watched(row)"
          label="nobody watching"
          tone="waiting"
          title="A machine asked for this release and it has stopped: it moves again only when somebody pushes a fix"
          [fieldOf]="row"
          [qitsField]="{ derived: ['unattended', 'state'] }"
        />
        @if (frozen(row); as chip) {
          <ui-chip
            [label]="chip.label"
            [tone]="chip.tone"
            [title]="frozenTitle"
            [fieldOf]="row"
            [qitsField]="{ derived: ['featureFreeze'] }"
          />
        }
        @if (behind(row); as ahead) {
          <a
            class="shrink-0 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold whitespace-nowrap no-underline hover:underline"
            [class]="queuedTone"
            [qitsExit]="opening.queuedBehind"
            [exitParams]="{ slug: slug(), requestId: ahead }"
            title="Held back by the feature freeze: this request folds and gates nothing until the one ahead of it has released or been withdrawn"
            [fieldOf]="row"
            [qitsField]="{ derived: ['queuedBehindQualifiedId', 'queuedBehind'] }"
            >queued behind {{ ahead }}</a
          >
        }
        <a
          class="font-semibold break-all text-accent no-underline hover:underline"
          [qitsExit]="opening.request"
          [exitParams]="{ slug: slug(), requestId: ref(row) }"
          [fieldOf]="row"
          [qitsField]="{ derived: ['qualifiedId', 'repoName'] }"
          >{{ row.qualifiedId ?? row.repoName }}</a
        >
        <span class="flex min-w-48 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          @for (item of items(row); track item.key) {
            <span
              class="inline-flex min-w-0 items-baseline gap-1"
              data-item
              [fieldOf]="row"
              [qitsField]="itemsMark"
            >
              @if (item.qualifiedId) {
                <a
                  class="font-mono text-sm whitespace-nowrap text-accent no-underline hover:underline"
                  [qitsExit]="opening.workItem"
                  [exitParams]="{ slug: slug(), id: item.qualifiedId }"
                  data-work-item
                  >{{ item.qualifiedId }}</a
                >
              }
              <a
                class="wrap-anywhere text-fg no-underline hover:underline"
                [qitsExit]="opening.request"
                [exitParams]="{ slug: slug(), requestId: ref(row) }"
                >{{ item.text }}</a
              >
            </span>
          }
        </span>
        @if (count(row); as counted) {
          <span
            class="text-xs whitespace-nowrap text-fg-faint"
            title="Counted branches of the feature freeze's threshold: at the threshold, new asks queue behind this request"
            [fieldOf]="row"
            [qitsField]="{ derived: ['featureFreeze'] }"
            >{{ counted }}</span
          >
        }
        <span
          class="text-xs whitespace-nowrap text-fg-muted"
          [fieldOf]="row"
          [qitsField]="{ derived: ['updatedAt'] }"
          >{{ when(row.updatedAt) }}</span
        >
      </div>
      <div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-fg-muted">
        <span [class]="row.version ? 'inline' : 'hidden'"
          >version
          <span class="font-mono" [fieldOf]="row" qitsField="version">{{ row.version }}</span></span
        >
        <span
          >merged
          <span class="font-mono" [fieldOf]="row" [qitsField]="{ derived: ['mergedSha'] }">{{
            sha(row.mergedSha) || '–'
          }}</span></span
        >
        <span
          title="Who asked for this release"
          data-participants
          [fieldOf]="row"
          [qitsField]="{ derived: ['participants', 'sources'] }"
          >{{ participants(row) }}</span
        >
        <ui-lifecycle-line
          [points]="summary(row)"
          [fieldOf]="row"
          [qitsField]="{ derived: ['pipeline', 'qualityGates', 'automations', 'state'] }"
        />
        @if (first) {
          <a
            class="inline-flex items-center gap-1 font-semibold text-warning no-underline hover:underline"
            [qitsExit]="opening.attention"
            [exitParams]="{ slug: slug(), requestId: ref(row) }"
            [exitFragment]="first.anchor"
            [fieldOf]="row"
            [qitsField]="{ derived: ['pipeline', 'qualityGates', 'automations', 'state'] }"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3 2.5 20h19z" />
              <path d="M12 10v4M12 17v.01" />
            </svg>
            {{ first.action }} · {{ first.label }}
          </a>
        }
        <app-release-withdraw class="ml-auto" [request]="row" />
      </div>
      <p
        class="mt-1 mb-0 text-sm break-words text-fg-soft"
        [class]="row.detail ? 'block' : 'hidden'"
        [fieldOf]="row"
        qitsField="detail"
      >
        {{ row.detail }}
      </p>
    </div>
  `,
})
export class ReleaseRequestRow {
  /** The request, as the project's list answered it. */
  readonly request = input.required<ReleaseRequestEntry>();
  /** The open project's slug, the links' param. */
  readonly slug = input.required<string>();

  protected readonly summary = lifecycleSummary;
  /** What a request carries (`requestItems`): its items, else its source branches. */
  protected readonly itemsMark = { derived: ['items', 'sources'] } as const;
  protected readonly badgeOf = requestBadge;
  protected readonly when = utcMinute;
  protected readonly sha = shortSha;
  protected readonly ref = releaseRequestRef;
  protected readonly frozen = freezeChip;
  protected readonly frozenTitle = FROZEN_TITLE;
  protected readonly count = freezeCount;
  protected readonly behind = queuedBehind;
  protected readonly queuedTone = chipClass('waiting');
  protected readonly items = requestItems;
  protected readonly participants = (request: ReleaseRequestEntry) => participantsOf(request);

  /** What in the request needs a person: the row is ringed, and links the first. */
  protected readonly needs = computed(() => attentionOf(this.request()));

  /**
   * Where a row leads (epic qits-2000): the request's page (its name, an item's text), the request
   * it is queued behind, the check that needs a person (the request's page at that check's
   * anchor), and the work item an item names.
   */
  protected readonly opening = outcomes('open-listed-release-request', {
    request: exit('projects/:slug/release-requests/:requestId'),
    queuedBehind: exit('projects/:slug/release-requests/:requestId'),
    attention: exit('projects/:slug/release-requests/:requestId'),
    workItem: exit('projects/:slug/work/detail/:id'),
  });

  protected watched(request: ReleaseRequestEntry): boolean {
    return !nobodyWatching(request);
  }
}
