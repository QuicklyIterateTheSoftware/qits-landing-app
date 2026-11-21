import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  PLATFORM_ID,
} from '@angular/core';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import type { DependencyEntry } from '$core/maintenance/maintenance.consumes';
import {
  MAINTENANCE_DEPENDENCIES,
  MAINTENANCE_DEPENDENTS,
} from '$core/maintenance/maintenance.operations';
import {
  artifactPage,
  byEmbeddedVersion,
  dependentsName,
  ecosystemOf,
  pinsGlob,
  pinsOf,
  type ArtifactPage,
  type EmbeddedVersion,
  type PackageDependent,
} from '$core/mirror/package-releases';
import { loadState } from '$core/resources/load-state';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** One pin of the package by a repository of ours, keyed by where it is, with its newest version. */
type PinRow = NonNullable<DependencyEntry['pins']>[number] & {
  readonly key: string;
  readonly latest: string | null | undefined;
};

/**
 * Which of our releases embed one package of a qits-mirror cache, and which of our repositories pin
 * it (qits-2488), below that package's versions on the Mirror section's repository page. It answers
 * "are we affected by this version" where the package comes in, replacing Maintenance ›
 * Dependencies.
 *
 * **Load budget: 2 per package shown.** `MAINTENANCE_DEPENDENCIES`
 * (`listDependencies?kind=EXTERNAL&name=`) is the pins: the package's name, or for an image a glob
 * on its upstream name (`*node`), cut to the names qits-maintenance may hold it under
 * (`core/mirror/package-releases.ts`). `MAINTENANCE_DEPENDENTS`
 * (`listDependencyDependents?ecosystem=&name=`) is the released artifacts of ours whose newest
 * release embeds it, read off their SBOMs; for an image it waits for the pins, as the name a pin uses
 * is the one its SBOM records. Both are read in the browser only.
 *
 * - "Our releases that embed <name>": one row per artifact, grouped by the version it embeds (the
 *   version, then each artifact: its name linking its page in the Artifacts section, its version,
 *   the repository that released it, direct or transitive), or one sentence when none does.
 * - "Pinned by": each repository's pin (repository, version, manifest; `behind` when the inventory
 *   says the pin is pending), or one sentence when none pins it.
 *
 * States: loading; a 403 (both doors are staff-only) says which roles may read them; any other
 * failure says they cannot be read right now, with Retry.
 *
 * Staleness (qits-1270): no `refreshOn`; no domain event follows qits-maintenance's inventory, so
 * the page's Refresh reads the package again, and choosing another package reads that one.
 */
@Component({
  selector: 'app-package-releases',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, LoadFailure, QitsEntity, QitsEntityList, QitsExit, QitsField, Spinner],
  template: `
    <section class="mt-8" aria-labelledby="mirror-package-releases">
      <h2 id="mirror-package-releases" class="mt-0 mb-2 text-base font-semibold">
        Our releases that embed
        <span class="font-mono break-all">{{ name() }}</span>
      </h2>
      @if (refused()) {
        <p
          role="alert"
          class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
        >
          Which of our releases embed it is read from qits-maintenance, which needs a staff role:
          qits:admin, qits:admin-agent, qits:desk-admin, qits:desk, qits:system or qits:agent.
        </p>
      } @else {
        <ui-load-failure
          message="Which of our releases embed it cannot be read right now."
          [class.hidden]="dependentsState() !== 'error'"
          (retry)="reload()"
        />
        <ui-spinner
          [state]="dependentsState()"
          class="min-h-16"
          [class.hidden]="dependentsState() === 'error'"
        >
          @if (groups().length === 0) {
            <p role="status" class="m-0 text-sm text-fg-soft" data-no-dependents>
              No release of ours embeds {{ name() }}.
            </p>
          } @else {
            <div class="overflow-x-auto">
              <table
                class="w-full border-collapse text-left text-sm"
                aria-label="Releases that embed it"
              >
                <thead>
                  <tr class="border-b border-line text-xs text-fg-muted">
                    <th class="py-1.5 pr-3 font-semibold">Embedded version</th>
                    <th class="py-1.5 pr-3 font-semibold">Artifact</th>
                    <th class="py-1.5 pr-3 font-semibold">Release</th>
                    <th class="py-1.5 pr-3 font-semibold">Repository</th>
                    <th class="py-1.5 font-semibold">How</th>
                  </tr>
                </thead>
                <tbody [qitsEntityList]="dependents">
                  @for (group of groups(); track group.version) {
                    @for (row of group.dependents; track rowKey(row); let first = $first) {
                      <tr
                        class="align-top"
                        [class.border-t]="first"
                        [class.border-line-subtle]="first"
                        [qitsEntity]="row"
                        entityKey="artifactName"
                      >
                        <td
                          class="py-1.5 pr-3 font-mono whitespace-nowrap"
                          [fieldOf]="row"
                          qitsField="embeddedVersion"
                        >
                          @if (first) {
                            {{ row.embeddedVersion }}
                          }
                        </td>
                        <td class="py-1.5 pr-3 font-mono whitespace-nowrap">
                          @switch (page(row)?.kind) {
                            @case ('image') {
                              <a
                                class="font-medium text-accent no-underline hover:underline"
                                [qitsExit]="opening.image"
                                [exitParams]="imageAt(row)"
                                [fieldOf]="row"
                                qitsField="artifactName"
                                >{{ row.artifactName }}</a
                              >
                            }
                            @case ('npmPackage') {
                              <a
                                class="font-medium text-accent no-underline hover:underline"
                                [qitsExit]="opening.npmPackage"
                                [exitParams]="npmAt(row)"
                                [fieldOf]="row"
                                qitsField="artifactName"
                                >{{ row.artifactName }}</a
                              >
                            }
                            @case ('mavenPackage') {
                              <a
                                class="font-medium text-accent no-underline hover:underline"
                                [qitsExit]="opening.mavenPackage"
                                [exitParams]="mavenAt(row)"
                                [fieldOf]="row"
                                qitsField="artifactName"
                                >{{ row.artifactName }}</a
                              >
                            }
                            @case ('daemon') {
                              <a
                                class="font-medium text-accent no-underline hover:underline"
                                [qitsExit]="opening.daemon"
                                [exitParams]="daemonAt(row)"
                                [fieldOf]="row"
                                qitsField="artifactName"
                                >{{ row.artifactName }}</a
                              >
                            }
                            @default {
                              <span [fieldOf]="row" qitsField="artifactName">{{
                                row.artifactName
                              }}</span>
                            }
                          }
                        </td>
                        <td
                          class="py-1.5 pr-3 font-mono whitespace-nowrap text-fg-soft"
                          [fieldOf]="row"
                          qitsField="artifactVersion"
                        >
                          {{ row.artifactVersion }}
                        </td>
                        <td
                          class="py-1.5 pr-3 font-mono whitespace-nowrap text-fg-soft"
                          [fieldOf]="row"
                          qitsField="repository"
                        >
                          {{ row.repository }}
                        </td>
                        <td
                          class="py-1.5 whitespace-nowrap text-fg-soft"
                          [fieldOf]="row"
                          [qitsField]="marks.direct"
                        >
                          {{ row.direct ? 'direct' : 'transitive' }}
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          }
        </ui-spinner>

        <h3 class="mt-6 mb-2 text-sm font-semibold">Pinned by</h3>
        <ui-spinner [state]="pinsState()" class="min-h-16" [class.hidden]="pinsState() === 'error'">
          @if (pinRows().length === 0) {
            <p role="status" class="m-0 text-sm text-fg-soft" data-no-pins>
              No repository of ours pins {{ name() }}.
            </p>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-left text-sm" aria-label="Pins">
                <thead>
                  <tr class="border-b border-line text-xs text-fg-muted">
                    <th class="py-1.5 pr-3 font-semibold">Repository</th>
                    <th class="py-1.5 pr-3 font-semibold">Version</th>
                    <th class="py-1.5 pr-3 font-semibold">Manifest</th>
                    <th class="py-1.5 font-semibold">Newest</th>
                  </tr>
                </thead>
                <tbody [qitsEntityList]="pins">
                  @for (row of pinRows(); track row.key) {
                    <tr
                      class="border-b border-line-subtle align-top"
                      [qitsEntity]="row"
                      entityKey="repository"
                    >
                      <td
                        class="py-1.5 pr-3 font-mono whitespace-nowrap"
                        [fieldOf]="row"
                        qitsField="repository"
                      >
                        {{ row.repository }}
                      </td>
                      <td
                        class="py-1.5 pr-3 font-mono whitespace-nowrap"
                        [fieldOf]="row"
                        qitsField="version"
                      >
                        {{ row.version }}
                      </td>
                      <td
                        class="py-1.5 pr-3 font-mono whitespace-nowrap text-fg-soft"
                        [fieldOf]="row"
                        qitsField="manifestPath"
                      >
                        {{ row.manifestPath }}
                      </td>
                      <td
                        class="py-1.5 whitespace-nowrap"
                        [fieldOf]="row"
                        [qitsField]="marks.pending"
                      >
                        @if (row.pending) {
                          <ui-chip [label]="behind(row)" tone="waiting" />
                        } @else {
                          <span class="text-fg-soft">current</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </ui-spinner>
      }
    </section>
  `,
})
export class PackageReleases {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The cache root's name (`hub`, `npmjs`). */
  readonly root = input.required<string>();
  /** The cache root's type (`npm-proxy`, `maven-proxy`, `oci-mirror`). */
  readonly type = input.required<string | undefined>();
  /** The package's name as the mirror caches it. */
  readonly name = input.required<string>();

  /** An artifact's name: its page in the Artifacts section, by its ecosystem. */
  protected readonly opening = outcomes('open-mirror-package-release', {
    image: exit('artifacts/repositories/:repo/images/:image'),
    npmPackage: exit('artifacts/repositories/:repo/packages/:package'),
    mavenPackage: exit('artifacts/repositories/:repo/maven-packages/:coordinate'),
    daemon: exit('artifacts/repositories/:repo/daemons/:daemon'),
  });

  private readonly ecosystem = computed(() => ecosystemOf(this.type()));

  /** The pins of the package: its name, or for an image the glob on its upstream name. */
  protected readonly pins = qitsResource(MAINTENANCE_DEPENDENCIES, () =>
    this.browser && this.ecosystem() && this.name()
      ? { query: { kind: 'EXTERNAL', name: pinsGlob(this.root(), this.type(), this.name()) } }
      : undefined,
  );

  /** The inventory's entries that are this package. */
  private readonly entries = computed((): readonly DependencyEntry[] =>
    pinsOf(
      (this.pins.hasValue() ? this.pins.value() : undefined) ?? [],
      this.root(),
      this.type(),
      this.name(),
    ),
  );

  /**
   * Who embeds the package. An image waits for the pins, whose name its SBOMs record; npm and
   * maven name it as the mirror does, so they ask at once.
   */
  protected readonly dependents = qitsResource(MAINTENANCE_DEPENDENTS, () => {
    const ecosystem = this.ecosystem();
    const name = this.dependentsName();
    return this.browser && ecosystem && name ? { query: { ecosystem, name } } : undefined;
  });

  /**
   * The name the dependents are asked by, a string so an answer that changes nothing asks nothing
   * again; none while an image's pins are still being read.
   */
  private readonly dependentsName = computed((): string | undefined => {
    if (!this.name()) return undefined;
    if (this.ecosystem() !== 'docker') return this.name();
    if (this.pins.isLoading()) return undefined;
    return dependentsName(this.entries(), this.root(), this.type(), this.name());
  });

  /** The dependents grouped by the version they embed. */
  protected readonly groups = computed((): readonly EmbeddedVersion[] =>
    byEmbeddedVersion(
      (this.dependents.hasValue() ? this.dependents.value()?.dependents : undefined) ?? [],
    ),
  );

  /** Each pin of the package, in the inventory's order. */
  protected readonly pinRows = computed((): readonly PinRow[] =>
    this.entries().flatMap((entry) =>
      (entry.pins ?? []).map((pin): PinRow => ({
        ...pin,
        key: `${pin.repository ?? ''}:${pin.manifestPath ?? ''}:${entry.name ?? ''}`,
        latest: entry.latest,
      })),
    ),
  );

  /** The dependents' state; loading, too, while an image's pins are still being read. */
  protected readonly dependentsState = computed((): LoadState =>
    this.ecosystem() === 'docker' && this.pins.isLoading() ? 'loading' : loadState(this.dependents),
  );
  protected readonly pinsState = computed((): LoadState => loadState(this.pins));

  /** A 403 from either: the viewer's roles may not read the inventory. */
  protected readonly refused = computed(
    () => this.statusOf(this.dependents) === 403 || this.statusOf(this.pins) === 403,
  );

  protected readonly marks = MARKS;

  /** Retry and the page's Refresh: both reads again. */
  reload(): void {
    this.pins.reload();
    this.dependents.reload();
  }

  protected page(row: PackageDependent): ArtifactPage | undefined {
    return artifactPage(row);
  }

  /** The image page's params; only called for a docker dependent. */
  protected imageAt(row: PackageDependent): { repo: string; image: string } {
    const page = artifactPage(row);
    return page?.kind === 'image'
      ? { repo: page.repo, image: page.image }
      : { repo: '', image: '' };
  }

  /** The npm package page's params; only called for an npm dependent. */
  protected npmAt(row: PackageDependent): { repo: string; package: string } {
    const page = artifactPage(row);
    return page?.kind === 'npmPackage'
      ? { repo: page.repo, package: page.package }
      : { repo: '', package: '' };
  }

  /** The maven package page's params; only called for a maven dependent. */
  protected mavenAt(row: PackageDependent): { repo: string; coordinate: string } {
    const page = artifactPage(row);
    return page?.kind === 'mavenPackage'
      ? { repo: page.repo, coordinate: page.coordinate }
      : { repo: '', coordinate: '' };
  }

  /** The daemon page's params; only called for a daemon dependent. */
  protected daemonAt(row: PackageDependent): { repo: string; daemon: string } {
    const page = artifactPage(row);
    return page?.kind === 'daemon'
      ? { repo: page.repo, daemon: page.daemon }
      : { repo: '', daemon: '' };
  }

  protected rowKey(row: PackageDependent): string {
    return `${row.artifactEcosystem ?? ''}:${row.artifactName ?? ''}:${row.artifactVersion ?? ''}`;
  }

  /** `behind 1.3.0`, or `behind` when the newest is not known. */
  protected behind(row: PinRow): string {
    return row.latest ? `behind ${row.latest}` : 'behind';
  }

  private statusOf(resource: { status(): string; error(): unknown }): number | undefined {
    if (resource.status() !== 'error') return undefined;
    const error = resource.error();
    return error instanceof QitsApiError ? error.status : undefined;
  }
}

/** The data marks of what the section derives (each a class constant, as the rule reads). */
const MARKS = {
  direct: { derived: ['direct'] },
  pending: { derived: ['pending'] },
} as const;
