import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { QitsEntity, QitsField } from '@qits/angular';
import type {
  RepositoryDetail,
  RepositoryPin,
  RepositoryTransitive,
} from '$core/maintenance/maintenance.consumes';
import { Chip } from '$ui/components/chip/chip';

/** A pin as a table row, keyed by where it is and what it pins: a name may be in two manifests. */
export interface PinRow extends RepositoryPin {
  /** `<manifestPath>:<ecosystem>:<name>`, the entity's key. */
  readonly key: string;
}

/** A behind transitive as a row, keyed by what it is, which version and through which pin. */
export interface TransitiveRow extends RepositoryTransitive {
  /** `<ecosystem>:<name>:<version>:<via>`, the entity's key. */
  readonly key: string;
}

/** One table of pins: its pins, pending first, and the transitives they bring in. */
export interface PinTable {
  readonly pins: readonly PinRow[];
  /** How many transitives come in through these pins. */
  readonly transitives: number;
  /** Only those of them that are behind. */
  readonly behind: readonly TransitiveRow[];
}

/** The repository's pins as the page shows them, by kind. */
export interface PinTables {
  readonly internal: PinTable;
  readonly external: PinTable;
  /** REACTOR and UNRESOLVED pins (and any other kind), in the collapsed disclosure. */
  readonly other: PinTable;
}

const pinKey = (pin: RepositoryPin) =>
  `${pin.manifestPath ?? ''}:${pin.ecosystem ?? ''}:${pin.name ?? ''}`;

const transitiveKey = (t: RepositoryTransitive) =>
  `${t.ecosystem ?? ''}:${t.name ?? ''}:${t.version ?? ''}:${t.via ?? ''}`;

/** Pending pins first (the service's `pending`, never a version compare), then by name. */
const byPendingThenName = (a: PinRow, b: PinRow) =>
  Number(!!b.pending) - Number(!!a.pending) ||
  (a.name ?? '').localeCompare(b.name ?? '') ||
  (a.manifestPath ?? '').localeCompare(b.manifestPath ?? '');

/**
 * The repository's pins in three tables, Internal, External and the rest (REACTOR, UNRESOLVED and
 * any other kind), each pending first, each with the transitives that come in through its pins
 * (`via`, a pin's name): how many, and only the behind ones as rows. A transitive whose `via`
 * names no pin of the repository counts with the rest.
 */
export function pinTables(repository: RepositoryDetail): PinTables {
  const pins = (repository.pins ?? []).map((pin): PinRow => ({ ...pin, key: pinKey(pin) }));
  const ofKind = (test: (kind: string) => boolean) =>
    pins.filter((pin) => test(pin.kind ?? '')).sort(byPendingThenName);
  const internal = ofKind((kind) => kind === 'INTERNAL');
  const external = ofKind((kind) => kind === 'EXTERNAL');
  const other = ofKind((kind) => kind !== 'INTERNAL' && kind !== 'EXTERNAL');
  const names = (rows: readonly PinRow[]) => new Set(rows.map((pin) => pin.name ?? ''));
  const internalNames = names(internal);
  const externalNames = names(external);
  const transitives = repository.transitives ?? [];
  const table = (rows: readonly PinRow[], through: (via: string) => boolean): PinTable => {
    const brought = transitives.filter((t) => through(t.via ?? ''));
    return {
      pins: rows,
      transitives: brought.length,
      behind: brought
        .filter((t) => t.behind === true)
        .map((t): TransitiveRow => ({ ...t, key: transitiveKey(t) }))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    };
  };
  return {
    internal: table(internal, (via) => internalNames.has(via)),
    external: table(external, (via) => externalNames.has(via)),
    other: table(other, (via) => !internalNames.has(via) && !externalNames.has(via)),
  };
}

/** A transitives caption: `817 transitives, 11 behind`. */
export function transitivesCaption(table: PinTable): string {
  const n = table.transitives;
  return `${n} ${n === 1 ? 'transitive' : 'transitives'}, ${table.behind.length} behind`;
}

/** The data marks of what the table derives from a pin, a transitive or the repository. */
const MARKS = {
  latest: { derived: ['latest'] },
  pending: { derived: ['pending'] },
  transitives: { derived: ['transitives'] },
  behind: { derived: ['behind'] },
} as const;

/**
 * One table of a repository's pins (qits-2334, the repository page's Internal, External and
 * collapsed Reactor and unresolved tables): each pin's dependency (name, ecosystem), version,
 * latest (unknown when the service has none), manifest and whether it is pending (the service's
 * `pending`, never a version compare), pending pins first; none says "No <noun> pins.". Under it,
 * the transitives its pins bring in, captioned with their count and how many are behind
 * ("817 transitives, 11 behind"), only the behind ones listed (what, version, ecosystem, `via`):
 * never hundreds of rows. Nothing about transitives when the pins bring in none.
 *
 * Marks (qits-2141): each pin an entity by its manifest, ecosystem and name, each behind
 * transitive by what it is and its `via`; the caption is derived from the repository's
 * `transitives`.
 */
@Component({
  selector: 'app-pin-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, QitsEntity, QitsField],
  host: { class: 'block' },
  template: `
    @if (pins().length) {
      <div class="overflow-x-auto rounded-md border border-line">
        <table
          class="w-full border-collapse text-left text-sm"
          [attr.aria-label]="title() + ' pins'"
        >
          <thead class="bg-surface-muted text-xs text-fg-muted">
            <tr>
              <th class="px-3 py-1.5 font-semibold">Dependency</th>
              <th class="px-3 py-1.5 font-semibold">Version</th>
              <th class="px-3 py-1.5 font-semibold">Latest</th>
              <th class="px-3 py-1.5 font-semibold">Manifest</th>
              <th class="px-3 py-1.5 font-semibold">Pending</th>
            </tr>
          </thead>
          <tbody>
            @for (pin of pins(); track pin.key) {
              <tr class="border-t border-line-subtle" [qitsEntity]="pin" entityKey="key">
                <td class="px-3 py-1.5">
                  <span
                    class="font-mono text-xs break-all text-fg"
                    [fieldOf]="pin"
                    qitsField="name"
                    >{{ pin.name }}</span
                  >
                  <span class="ml-2 text-xs text-fg-muted" [fieldOf]="pin" qitsField="ecosystem">{{
                    pin.ecosystem
                  }}</span>
                </td>
                <td
                  class="px-3 py-1.5 font-mono text-xs break-all"
                  [fieldOf]="pin"
                  qitsField="version"
                >
                  {{ pin.version }}
                </td>
                <td
                  class="px-3 py-1.5 font-mono text-xs break-all"
                  [fieldOf]="pin"
                  [qitsField]="marks.latest"
                >
                  {{ pin.latest ?? 'unknown' }}
                </td>
                <td
                  class="px-3 py-1.5 font-mono text-xs wrap-anywhere"
                  [fieldOf]="pin"
                  qitsField="manifestPath"
                >
                  {{ pin.manifestPath }}
                </td>
                <td class="px-3 py-1.5" [fieldOf]="pin" [qitsField]="marks.pending">
                  @if (pin.pending) {
                    <ui-chip label="pending" tone="waiting" />
                  } @else {
                    <span class="text-fg-muted">–</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="m-0 text-sm text-fg-muted">No {{ noun() }} pins.</p>
    }
    @if (transitives()) {
      <div class="mt-2" [qitsEntity]="repository()" entityKey="name" data-transitives>
        <p
          class="m-0 mb-1 text-xs text-fg-muted"
          [fieldOf]="repository()"
          [qitsField]="marks.transitives"
        >
          {{ caption() }}
        </p>
        @if (behind().length) {
          <ul
            class="m-0 flex list-none flex-col gap-1 p-0 text-xs"
            [attr.aria-label]="title() + ' transitives behind'"
          >
            @for (t of behind(); track t.key) {
              <li class="flex flex-wrap items-baseline gap-x-2" [qitsEntity]="t" entityKey="key">
                <span class="font-mono break-all text-fg" [fieldOf]="t" qitsField="name">{{
                  t.name
                }}</span>
                <span class="font-mono text-fg-soft" [fieldOf]="t" qitsField="version">{{
                  t.version
                }}</span>
                <span class="text-fg-muted" [fieldOf]="t" qitsField="ecosystem">{{
                  t.ecosystem
                }}</span>
                <span class="text-fg-muted" [fieldOf]="t" qitsField="via"
                  >via <span class="font-mono">{{ t.via }}</span></span
                >
                <ui-chip label="behind" tone="waiting" [fieldOf]="t" [qitsField]="marks.behind" />
              </li>
            }
          </ul>
        }
      </div>
    }
  `,
})
export class PinTableComponent {
  /** The table's name, for its accessible label: `Internal`, `External`, … */
  readonly title = input.required<string>();
  /** What its pins are, for the empty text: `internal`, … */
  readonly noun = input.required<string>();
  /** Its pins, pending first (`pinTables`). */
  readonly pins = input.required<readonly PinRow[]>();
  /** How many transitives its pins bring in. */
  readonly transitives = input.required<number>();
  /** Only those of them that are behind. */
  readonly behind = input.required<readonly TransitiveRow[]>();
  /** The repository they come from: the caption's mark. */
  readonly repository = input.required<RepositoryDetail>();

  protected readonly caption = computed(() =>
    transitivesCaption({
      pins: this.pins(),
      transitives: this.transitives(),
      behind: this.behind(),
    }),
  );
  protected readonly marks = MARKS;
}
