import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
  stay,
} from '@qits/angular';
import {
  formatBytes,
  newestPublishFirst,
  orphanSbomCount,
  plural,
  sbomsByVersion,
  splitPackageName,
} from '$core/artifacts/artifact-listings';
import type { ArtifactNpmVersion, ArtifactSbomVersion } from '$core/artifacts/artifacts.consumes';
import {
  ARTIFACT_NPM_VERSIONS,
  ARTIFACT_SBOM_VERSIONS,
} from '$core/artifacts/artifacts.operations';
import type { ArtifactVersionStatus } from '$core/maintenance/maintenance.consumes';
import { MAINTENANCE_ARTIFACT_VERSIONS } from '$core/maintenance/maintenance.operations';
import { statusesByVersion } from '$core/maintenance/sbom-status';
import { formatInstant } from '$core/release-requests/release-request-model';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { SbomCell } from '$patterns/artifacts/sbom-cell/sbom-cell';
import { SbomStatus } from '$patterns/artifacts/sbom-status/sbom-status';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** A read's failure status (404, 400, …); undefined while it has not failed. */
function failureStatus(read: { status(): string; error(): unknown }): number | undefined {
  if (read.status() !== 'error') return undefined;
  const error = read.error();
  return error instanceof QitsApiError ? error.status : undefined;
}

/** The SBOM store's type for an npm package. */
const PACKAGE_TYPE = 'npm';

/** What the Published column says for a version whose publish the store did not record. */
const NOT_RECORDED = 'not recorded';

/**
 * One npm package of an npm store (qits-2326), at
 * `/projects/<slug>/components/<repo>/artifacts/<store>/packages/<package>`: replaces qits-artifacts-frontend's
 * `repositories/:repo/packages/:package`, and adds what that page never showed, each version's
 * SBOM. The package name is one segment (`@qits/angular` is `@qits%2Fangular` in the URL, which
 * the router decodes; the versions read and the SBOM reads send it encoded, `%40qits%2Fangular`,
 * as the generated client spells it).
 *
 * **Load budget: 3 + 0.** `ARTIFACT_NPM_VERSIONS` (`listNpmVersionSummaries`) is the version table;
 * `ARTIFACT_SBOM_VERSIONS` (`listSbomVersions`, `npm` and the package name) says which of them has
 * an SBOM; `MAINTENANCE_ARTIFACT_VERSIONS` (qits-maintenance's `listArtifactVersions`, `npm` and the
 * package name, `@scope/name`, which is `mt_pin`'s spelling too; qits-2490) says how maintenance
 * read each version's SBOM. All three are read in parallel, in the browser only (the server render has no session); the
 * store page's listing is not read, nothing is read per row, and an SBOM's document is read only
 * when its Download is pressed (`ARTIFACT_SBOM`, `download-npm-sbom`, through `app-sbom-cell`).
 *
 * - Header: "← Artifacts" back to the repository's Artifacts (`leave-npm-package`), the package name, its scope
 *   and own name apart when it is scoped, and "N versions · M with an SBOM".
 * - Versions, newest publish first (a version whose publish was not recorded last): the version,
 *   the dist-tags pointing at it ("—" for none), its tarball's size ("not measured" when the store
 *   has none; never totalled, as a caption says: each tarball is a separate archive, and a column
 *   with unmeasured rows cannot be summed truthfully), when it was published ("not recorded" when
 *   null), its SBOM ("CycloneDX <specVersion> · <size>" with Download, "—" without one), and
 *   maintenance's SBOM status (`app-sbom-status`: a chip, a FAILED read's reason, and Re-read SBOM,
 *   `reread-artifact-sbom`; nothing for a version maintenance does not know). SBOMs of versions the
 *   store no longer holds are counted under the table, only when there are some.
 *
 * States: loading; a failed versions read offers Retry; a 404 is "There is no repository called
 * <repo> in this store"; a 400 "<repo> is not an npm repository", linking the repository's Artifacts; no
 * versions (the door answers an unknown package with an empty list) "There is no package called
 * <package> in this repository". The SBOM list's 404 means the package has none, not a failure;
 * any other failure keeps the table, its SBOM column "unknown", and a Retry above it.
 * Maintenance's statuses refused for the viewer's roles (401, 403) leave the status column out; any
 * other failure keeps the table, its status cells empty, and a Retry above it. A re-read refused
 * with 403 names the roles that may and takes Re-read SBOM off every row.
 *
 * Marks (qits-2141): each row an entry of the versions' read by `version`; its SBOM a join, an entry
 * of the SBOM list by `version` (`app-sbom-cell`); its status a join, an entry of maintenance's
 * versions by `version` (`app-sbom-status`).
 *
 * Staleness (qits-1270): none can follow, and nothing polls: qits-artifacts emits no domain event
 * for a publish, a dist-tag move, an SBOM or a sweep, and qits-maintenance none for an SBOM read.
 * Refresh reads all three again; a re-read's 202 reads maintenance's statuses again.
 */
@Component({
  selector: 'app-artifacts-npm-package-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    SbomCell,
    SbomStatus,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [actions]="actions">
        <h1
          slot="header"
          class="m-0 min-w-0 font-mono text-2xl leading-[1.2] font-bold wrap-anywhere"
        >
          <span>{{ scopePrefix() }}</span
          ><wbr /><span>{{ parts().name }}</span>
        </h1>
        <p class="mt-0 mb-2 text-sm" [class.hidden]="!owner()">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.back"
            [exitParams]="{ slug: slug(), repo: owner() }"
            [exitCurrent]="null"
            data-back
            >← Artifacts</a
          >
        </p>
        @if (parts().scope) {
          <p
            class="mt-0 mb-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-soft"
            data-package-name
          >
            <span
              >scope <span class="font-mono text-fg">{{ parts().scope }}</span></span
            >
            <span
              >name <span class="font-mono text-fg">{{ parts().name }}</span></span
            >
          </p>
        }
        @if (state() === 'loaded' && versionList().length) {
          <p class="mt-0 mb-4 text-sm text-fg-soft" data-lede>{{ lede() }}</p>
        }

        @if (unknownRepository()) {
          <p
            role="alert"
            class="m-0 mt-3 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            There is no repository called “{{ store() }}” in this store.
          </p>
        } @else if (notNpm()) {
          <p
            role="alert"
            class="m-0 mt-3 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            “{{ store() }}” is not an npm repository.
            <a
              class="text-accent no-underline hover:underline"
              [class.hidden]="!owner()"
              [qitsExit]="leaving.repository"
              [exitParams]="{ slug: slug(), repo: owner() }"
              [exitCurrent]="null"
              >Open the repository’s artifacts</a
            >.
          </p>
        } @else {
          <ui-load-failure
            class="mt-3"
            message="This package’s versions could not be read."
            [class.hidden]="state() !== 'error'"
            (retry)="retry()"
          />
          <ui-spinner [state]="state()" class="mt-3 min-h-32" [class.hidden]="state() === 'error'">
            @if (versionList().length === 0) {
              <p
                role="alert"
                class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
              >
                There is no package called “{{ packageName() }}” in this repository.
              </p>
            } @else {
              @if (sbomsUnknown()) {
                <div
                  class="mb-3 flex flex-wrap items-center gap-3 text-sm text-fg-muted"
                  data-sboms-unknown
                >
                  <span>This package’s SBOMs could not be read; the versions follow.</span>
                  <button
                    type="button"
                    class="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft hover:bg-surface-muted"
                    (click)="sboms.reload()"
                  >
                    Retry
                  </button>
                </div>
              }
              @if (statusesUnknown()) {
                <div
                  class="mb-3 flex flex-wrap items-center gap-3 text-sm text-fg-muted"
                  data-statuses-unknown
                >
                  <span>Maintenance’s SBOM statuses could not be read; the versions follow.</span>
                  <button
                    type="button"
                    class="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft hover:bg-surface-muted"
                    aria-label="Retry the SBOM statuses"
                    (click)="statuses.reload()"
                  >
                    Retry
                  </button>
                </div>
              }
              <p class="mt-0 mb-2 text-xs text-fg-muted" data-sizes-caption>
                Each tarball is a separate archive, and a size the store did not measure cannot be
                added, so the sizes are not totalled.
              </p>
              <div class="overflow-x-auto">
                <table class="w-full border-collapse text-left text-sm" aria-label="Versions">
                  <thead>
                    <tr class="border-b border-line text-xs text-fg-muted">
                      <th class="py-1.5 pr-3 font-semibold">Version</th>
                      <th class="py-1.5 pr-3 font-semibold">Dist-tags</th>
                      <th class="py-1.5 pr-3 text-right font-semibold">Tarball</th>
                      <th class="py-1.5 pr-3 font-semibold">Published</th>
                      <th class="py-1.5 pr-3 font-semibold">SBOM</th>
                      @if (statusesShown()) {
                        <th class="py-1.5 font-semibold">SBOM status</th>
                      }
                    </tr>
                  </thead>
                  <tbody [qitsEntityList]="versions">
                    @for (row of versionRows(); track row.version) {
                      <tr
                        class="border-b border-line-subtle align-top"
                        [qitsEntity]="row"
                        entityKey="version"
                      >
                        <td
                          class="py-1.5 pr-3 font-mono font-medium whitespace-nowrap"
                          [fieldOf]="row"
                          qitsField="version"
                        >
                          {{ row.version }}
                        </td>
                        <td
                          class="py-1.5 pr-3 font-mono text-xs wrap-anywhere text-fg-soft"
                          [fieldOf]="row"
                          [qitsField]="marks.distTags"
                        >
                          {{ tags(row) }}
                        </td>
                        <td
                          class="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums"
                          [fieldOf]="row"
                          [qitsField]="marks.tarballSizeBytes"
                        >
                          {{ bytes(row.tarballSizeBytes) }}
                        </td>
                        <td
                          class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                          [fieldOf]="row"
                          [qitsField]="marks.publishedAt"
                        >
                          {{ published(row.publishedAt) }}
                        </td>
                        <td class="py-1.5 pr-3 text-xs">
                          <app-sbom-cell
                            [packageType]="packageType"
                            [packageName]="packageName()"
                            [version]="row.version ?? ''"
                            [sbom]="sbomOf(row)"
                            [source]="sboms"
                            [unknown]="sbomsUnknown()"
                            [saved]="downloading.saved"
                            [failed]="downloading.failed"
                          />
                        </td>
                        @if (statusesShown()) {
                          <td class="py-1.5 text-xs">
                            <app-sbom-status
                              [ecosystem]="packageType"
                              [name]="packageName()"
                              [version]="row.version ?? ''"
                              [status]="statusOf(row)"
                              [source]="statuses"
                              [(refused)]="rereadRefused"
                            />
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (orphans() > 0) {
                <p class="mt-3 mb-0 text-sm text-fg-soft" data-orphans>{{ orphanNote() }}</p>
              }
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class ArtifactsNpmPackagePage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);

  /** "← Artifacts", and a non-npm store's note: the repository's Artifacts (qits-2477). */
  protected readonly leaving = outcomes('leave-npm-package', {
    back: exit('projects/:slug/components/:repo/artifacts'),
    repository: exit('projects/:slug/components/:repo/artifacts'),
  });

  /** A version's SBOM saved as a file, or not: the page stays either way. */
  protected readonly downloading = outcomes('download-npm-sbom', {
    saved: stay(),
    failed: stay(),
  });

  /** A re-read was refused for the viewer's roles (403): Re-read SBOM is gone from every row. */
  protected readonly rereadRefused = signal(false);

  protected readonly packageType = PACKAGE_TYPE;

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The URL's store repository name. */
  protected readonly store = computed(() => this.params().get('store') ?? '');

  /**
   * The repository that publishes the artifact (qits-2477): the back link's. Empty on the old
   * `artifacts/repositories/…` address, which qits-artifacts-frontend still hands off to: that
   * address names no repository, so it shows no back link.
   */
  protected readonly owner = computed(() => this.params().get('repo') ?? '');

  /** The open project's slug. */
  protected readonly slug = computed(() => this.params().get('slug') ?? '');
  /** The URL's package name, decoded (`@qits/angular`). */
  protected readonly packageName = computed(() => this.params().get('package') ?? '');
  /** The package's scope (`''` when unscoped) and its own name. */
  protected readonly parts = computed(() => splitPackageName(this.packageName()));
  /** `@scope/`, the heading's first part, so a narrow heading breaks after the slash. */
  protected readonly scopePrefix = computed(() => {
    const scope = this.parts().scope;
    return scope ? `${scope}/` : '';
  });

  /** The package's versions, in store order. */
  protected readonly versions = qitsResource(ARTIFACT_NPM_VERSIONS, () => {
    const repo = this.store();
    const name = this.packageName();
    return this.browser && repo && name ? { path: { repo, package: name } } : undefined;
  });

  /** The package's stored SBOMs, newest first; a 404 when it has none. */
  protected readonly sboms = qitsResource(ARTIFACT_SBOM_VERSIONS, () => {
    const packageName = this.packageName();
    return this.browser && packageName
      ? { path: { packageType: PACKAGE_TYPE, packageName } }
      : undefined;
  });

  /**
   * Maintenance's released versions of the package with their SBOM status, newest first (qits-2490):
   * the ecosystem is the SBOM store's type and the name its spelling, which is `mt_pin`'s.
   */
  protected readonly statuses = qitsResource(MAINTENANCE_ARTIFACT_VERSIONS, () => {
    const name = this.packageName();
    return this.browser && name ? { query: { ecosystem: PACKAGE_TYPE, name } } : undefined;
  });

  private readonly statusIndex = computed(() =>
    statusesByVersion(this.statuses.hasValue() ? this.statuses.value() : undefined),
  );

  private readonly statusesStatus = computed(() => failureStatus(this.statuses));

  /** The viewer may not read maintenance's statuses (401, 403): the column is left out. */
  private readonly statusesRefused = computed(() => {
    const status = this.statusesStatus();
    return status === 401 || status === 403;
  });

  /** The status column: shown unless the viewer may not read it. */
  protected readonly statusesShown = computed(() => !this.statusesRefused());

  /** Maintenance's statuses failed otherwise than for the viewer's roles: said, with Retry. */
  protected readonly statusesUnknown = computed(
    () => this.statuses.status() === 'error' && !this.statusesRefused(),
  );

  protected readonly versionList = computed(
    (): readonly ArtifactNpmVersion[] =>
      (this.versions.hasValue() ? this.versions.value()?.versions : undefined) ?? [],
  );
  /** The versions, newest publish first. */
  protected readonly versionRows = computed(() => newestPublishFirst(this.versionList()));

  private readonly sbomStatus = computed(() => failureStatus(this.sboms));

  /** The SBOMs, none when the list answered 404 (the package has none) or failed. */
  private readonly sbomList = computed(
    (): readonly ArtifactSbomVersion[] =>
      (this.sboms.hasValue() ? this.sboms.value()?.versions : undefined) ?? [],
  );
  private readonly sbomIndex = computed(() => sbomsByVersion(this.sbomList()));

  /** The SBOM list failed otherwise than with a 404: whether a version has one is unknown. */
  protected readonly sbomsUnknown = computed(
    () => this.sboms.status() === 'error' && this.sbomStatus() !== 404,
  );

  /** SBOMs of versions the store no longer holds. */
  protected readonly orphans = computed(() => orphanSbomCount(this.sbomList(), this.versionList()));

  private readonly versionStatus = computed(() => failureStatus(this.versions));

  /** A 404 on the versions: the store holds no repository of that name. */
  protected readonly unknownRepository = computed(() => this.versionStatus() === 404);

  /** A 400 on the versions: the repository holds something other than npm packages. */
  protected readonly notNpm = computed(() => this.versionStatus() === 400);

  /**
   * The table: failed when the versions failed, loaded once they answered and the SBOM list has
   * settled (answered, none, or failed), so the SBOM column never shows "—" for a list on its way.
   */
  protected readonly state = computed((): LoadState => {
    const versions = this.versions;
    if (versions.status() === 'error') return 'error';
    const sbomsSettled = this.sboms.hasValue() || this.sboms.status() === 'error';
    const statusesSettled = this.statuses.hasValue() || this.statuses.status() === 'error';
    return versions.hasValue() && sbomsSettled && statusesSettled ? 'loaded' : 'loading';
  });

  /** Refresh: the versions, the SBOM list and maintenance's statuses, read again. */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.versions.reload();
        this.sboms.reload();
        this.statuses.reload();
      },
    },
  ];

  protected readonly marks = MARKS;

  /** Retry: the failed reads, again. */
  protected retry(): void {
    this.versions.reload();
    if (this.sboms.status() === 'error') this.sboms.reload();
    if (this.statuses.status() === 'error') this.statuses.reload();
  }

  /** This version's SBOM, if the list holds one. */
  protected sbomOf(row: ArtifactNpmVersion): ArtifactSbomVersion | undefined {
    return this.sbomIndex().get(row.version ?? '');
  }

  /** This version's status in maintenance, if maintenance knows the version. */
  protected statusOf(row: ArtifactNpmVersion): ArtifactVersionStatus | undefined {
    return this.statusIndex().get(row.version ?? '');
  }

  /** `2 versions · 1 with an SBOM`; the SBOMs unknown when their list failed. */
  protected lede(): string {
    const versions = this.versionList();
    const count = plural(versions.length, 'version');
    if (this.sbomsUnknown()) return `${count} · SBOMs unknown`;
    const index = this.sbomIndex();
    const withSbom = versions.filter((version) => index.has(version.version ?? '')).length;
    return `${count} · ${withSbom} with an SBOM`;
  }

  /** `1 SBOM documents a version this package no longer stores.` */
  protected orphanNote(): string {
    const n = this.orphans();
    return n === 1
      ? '1 SBOM documents a version this package no longer stores.'
      : `${n} SBOMs document versions this package no longer stores.`;
  }

  /** `latest, main`: the dist-tags pointing at the version, in store order; `—` for none. */
  protected tags(row: ArtifactNpmVersion): string {
    const tags = row.distTags ?? [];
    return tags.length ? tags.join(', ') : '—';
  }

  /** The tarball's size; "not measured" when the store has none (null). */
  protected bytes(value: number | null | undefined): string {
    return formatBytes(value);
  }

  /** When the version was published; "not recorded" when the store has no instant (null). */
  protected published(iso: string | null | undefined): string {
    return iso ? formatInstant(iso) : NOT_RECORDED;
  }
}

/** The data marks of what the page derives from a row (each a class constant, as the rule reads). */
const MARKS = {
  distTags: { derived: ['distTags'] },
  tarballSizeBytes: { derived: ['tarballSizeBytes'] },
  publishedAt: { derived: ['publishedAt'] },
} as const;
