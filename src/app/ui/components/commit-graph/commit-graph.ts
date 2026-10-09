import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  type TemplateRef,
} from '@angular/core';
import type { CommitGraph, GraphRow } from '$core/release-requests/commit-graph';

/** What a row says beside its dot. */
export interface GraphEntry {
  readonly hash: string;
  readonly shortHash: string;
  readonly subject: string;
  readonly author: string;
  /** When, for reading ("3h ago"). */
  readonly when: string;
  /** When, exactly, for the tooltip. */
  readonly title: string;
  /** The line of history this commit opens (a branch name), if it opens one. */
  readonly label?: string;
}

/** A lane's width and a row's height, in px. */
const LANE = 14;
const ROW = 28;
const MID = ROW / 2;

/** Lane colours, in turn. Written out so Tailwind keeps them. */
const COLOURS = [
  'var(--color-ocean-deep-600)',
  'var(--color-mint-leaf-600)',
  'var(--color-sunflower-gold-600)',
  'var(--color-cinnabar-600)',
  'var(--color-charcoal-brown-500)',
];

const x = (lane: number) => lane * LANE + LANE / 2;

/** One row's drawing: straight lines, curves and the dot. */
interface Drawn {
  readonly row: GraphRow;
  readonly entry: GraphEntry;
  readonly paths: readonly { readonly d: string; readonly colour: string }[];
  readonly dot: { readonly cx: number; readonly colour: string };
  /** The lines continued under an opened row. */
  readonly below: readonly { readonly x: number; readonly colour: string }[];
}

/**
 * A commit graph: one lane (column) per line of history, a dot per commit, newest first, with the
 * lines from each commit to its parents (`layoutGraph`). Beside each dot, the commit's short sha,
 * subject, author and time; a commit that opens a line of history shows its name. A row is a
 * button: pressing it emits the commit's hash (`toggle`). Under each row whose hash is in
 * `expanded`, the `expansion` template is drawn with the hash, and the lanes continue beside it.
 */
@Component({
  selector: 'ui-commit-graph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: { class: 'block' },
  template: `
    <ol class="m-0 list-none p-0">
      @for (drawn of drawn(); track drawn.row.hash) {
        @let open = expanded().has(drawn.row.hash);
        <li>
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-2 rounded pr-1 text-left text-sm hover:bg-charcoal-brown-50"
            [attr.aria-expanded]="open"
            (click)="toggle.emit(drawn.row.hash)"
          >
            <svg
              class="shrink-0"
              [attr.width]="svgWidth()"
              [attr.height]="row"
              [attr.viewBox]="'0 0 ' + svgWidth() + ' ' + row"
              aria-hidden="true"
            >
              @for (path of drawn.paths; track $index) {
                <path [attr.d]="path.d" [attr.stroke]="path.colour" stroke-width="2" fill="none" />
              }
              <circle
                [attr.cx]="drawn.dot.cx"
                [attr.cy]="mid"
                r="4"
                [attr.fill]="drawn.dot.colour"
                stroke="white"
                stroke-width="1.5"
              />
            </svg>
            <span class="font-mono text-charcoal-brown-600" [title]="drawn.entry.hash">{{
              drawn.entry.shortHash
            }}</span>
            @if (drawn.entry.label) {
              <span
                class="shrink-0 rounded border px-1.5 font-mono text-[0.6875rem] leading-4"
                [style.border-color]="drawn.dot.colour"
                [style.color]="drawn.dot.colour"
                >{{ drawn.entry.label }}</span
              >
            }
            <span
              class="min-w-0 flex-1 truncate text-charcoal-brown-950"
              [title]="drawn.entry.subject"
              >{{ drawn.entry.subject }}</span
            >
            <span class="text-xs whitespace-nowrap text-charcoal-brown-500">{{
              drawn.entry.author
            }}</span>
            <span
              class="text-xs whitespace-nowrap text-charcoal-brown-500"
              [title]="drawn.entry.title"
              >{{ drawn.entry.when }}</span
            >
          </button>
          @if (open) {
            <div class="flex">
              <svg class="shrink-0 self-stretch" [attr.width]="svgWidth()" aria-hidden="true">
                @for (line of drawn.below; track $index) {
                  <line
                    [attr.x1]="line.x"
                    [attr.x2]="line.x"
                    y1="0"
                    y2="100%"
                    [attr.stroke]="line.colour"
                    stroke-width="2"
                  />
                }
              </svg>
              <div class="min-w-0 flex-1 pt-1 pb-3 pl-2">
                <ng-container
                  [ngTemplateOutlet]="expansion() ?? null"
                  [ngTemplateOutletContext]="{ $implicit: drawn.row.hash }"
                />
              </div>
            </div>
          }
        </li>
      }
    </ol>
  `,
})
export class CommitGraphView {
  readonly graph = input.required<CommitGraph>();
  /** What each row says, in the graph's row order. */
  readonly entries = input.required<readonly GraphEntry[]>();
  /** The hashes of the opened rows. */
  readonly expanded = input<ReadonlySet<string>>(new Set());
  /** Drawn under an opened row, with its hash. */
  readonly expansion = input<TemplateRef<unknown>>();
  readonly toggle = output<string>();

  protected readonly row = ROW;
  protected readonly mid = MID;

  protected readonly svgWidth = computed(() => Math.max(1, this.graph().width) * LANE);

  protected readonly drawn = computed((): readonly Drawn[] => {
    const entries = this.entries();
    return this.graph().rows.map((row, index) => {
      const colour = (lane: number) => COLOURS[lane % COLOURS.length];
      const paths: { d: string; colour: string }[] = [];
      for (const lane of row.passing) {
        paths.push({ d: `M${x(lane)} 0V${ROW}`, colour: colour(lane) });
      }
      if (row.incoming) paths.push({ d: `M${x(row.lane)} 0V${MID}`, colour: colour(row.lane) });
      for (const lane of row.converging) {
        paths.push({
          d: `M${x(lane)} 0C${x(lane)} ${MID} ${x(row.lane)} 0 ${x(row.lane)} ${MID}`,
          colour: colour(lane),
        });
      }
      for (const edge of row.edges) {
        paths.push({
          d:
            edge.from === edge.to
              ? `M${x(edge.from)} ${MID}V${ROW}`
              : `M${x(edge.from)} ${MID}C${x(edge.from)} ${ROW} ${x(edge.to)} ${MID} ${x(edge.to)} ${ROW}`,
          colour: colour(edge.to),
        });
      }
      return {
        row,
        entry: entries[index],
        paths,
        dot: { cx: x(row.lane), colour: colour(row.lane) },
        below: row.below.map((lane) => ({ x: x(lane), colour: colour(lane) })),
      };
    });
  });
}
