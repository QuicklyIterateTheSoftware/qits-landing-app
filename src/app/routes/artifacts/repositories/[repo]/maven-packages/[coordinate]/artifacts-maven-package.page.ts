import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
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
  sortedFiles,
  splitCoordinate,
} from '$core/artifacts/artifact-listings';
import type { ArtifactMavenVersion, ArtifactSbomVersion } from '$core/artifacts/artifacts.consumes';
import {
  ARTIFACT_MAVEN_VERSIONS,
  ARTIFACT_SBOM_VERSIONS,
} from '$core/artifacts/artifacts.operations';
import { formatInstant } from '$core/release-requests/release-request-model';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { SbomCell } from '$patterns/artifacts/sbom-cell/sbom-cell';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** A read's failure status (404, 400, …); undefined while it has not failed. */
function failureStatus(read: { status(): string; error(): unknown }): number | undefined {
  if (read.status() !== 'error') return undefined;
  const error = read.error();
  return error instanceof QitsApiError ? error.status : undefined;
}

/** The SBOM store's type for a maven coordinate. */
const PACKAGE_TYPE = 'maven';

/**
 * One maven coordinate of a maven store (qits-2325), at
 * `/artifacts/repositories/<repo>/maven-packages/<coordinate>`: replaces qits-artifacts-frontend's
 * `repositories/:repo/maven-packages/:coordinate`, and adds what that page never showed, each
 * version's SBOM. The coordinate (`groupId:artifactId`) is one segment, encoded on the wire.
 *
 * **Load budget: 2 + 0.** `ARTIFACT_MAVEN_VERSIONS` (`listMavenVersionSummaries`) is the version
 * table; `ARTIFACT_SBOM_VERSIONS` (`listSbomVersions`, `maven` and the coordinate) says which of them
 * has an SBOM. Both are read in parallel, in the browser only (the server render has no session);
 * nothing is read per row, and an SBOM's document is read only when its Download is pressed
 * (`ARTIFACT_SBOM`, `download-maven-sbom`, through `app-sbom-cell`).
 *
 * - Header: "← <repo>" back to the store page (`leave-maven-package`), the coordinate, its groupId
 *   and artifactId apart, and "N versions · M with an SBOM".
 * - Versions, newest publish first (the store answers oldest first): the version, its files
 *   (sorted, wrapped, never cut), their size, when it was published, and its SBOM ("CycloneDX
 *   <specVersion> · <size>" with Download, "—" without one). SBOMs of versions the store no longer
 *   holds are counted under the table, only when there are some.
 *
 * States: loading; a failed versions read offers Retry; a 404 is "There is no repository called
 * <repo> in this store"; a 400 "<repo> is not a Maven repository", linking its store page; no
 * versions (the door answers an unknown coordinate with an empty list) "There is no Maven
 * coordinate called <coordinate> in this repository". The SBOM list's 404 means the coordinate has
 * none, not a failure; any other failure keeps the table, its SBOM column "unknown", and a Retry
 * in the header.
 *
 * Marks (qits-2141): each row an entry of the versions' read by `version`; its SBOM a join, an entry
 * of the SBOM list by `version` (`app-sbom-cell`).
 *
 * Staleness (qits-1270): none can follow, and nothing polls: qits-artifacts emits no domain event
 * for a deploy, an SBOM or a sweep. Refresh reads both again.
 */
@Component({
  selector: 'app-artifacts-maven-package-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    SbomCell,
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
          <span>{{ groupPrefix() }}</span
          ><wbr /><span>{{ parts().artifactId }}</span>
        </h1>
        <p class="mt-0 mb-2 text-sm">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.back"
            [exitParams]="{ repo: repo() }"
            [exitCurrent]="null"
            data-back
            >← {{ repo() }}</a
          >
        </p>
        <p class="mt-0 mb-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-soft" data-coordinate>
          <span
            >groupId <span class="font-mono text-fg">{{ parts().groupId || '—' }}</span></span
          >
          <span
            >artifactId <span class="font-mono text-fg">{{ parts().artifactId }}</span></span
          >
        </p>
        @if (state() === 'loaded' && versionList().length) {
          <p class="mt-0 mb-4 text-sm text-fg-soft" data-lede>{{ lede() }}</p>
        }

        @if (unknownRepository()) {
          <p
            role="alert"
            class="m-0 mt-3 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            There is no repository called “{{ repo() }}” in this store.
          </p>
        } @else if (notMaven()) {
          <p
            role="alert"
            class="m-0 mt-3 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            “{{ repo() }}” is not a Maven repository.
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="leaving.repository"
              [exitParams]="{ repo: repo() }"
              [exitCurrent]="null"
              >Open its store page</a
            >.
          </p>
        } @else {
          <ui-load-failure
            class="mt-3"
            message="This coordinate’s versions could not be read."
            [class.hidden]="state() !== 'error'"
            (retry)="retry()"
          />
          <ui-spinner [state]="state()" class="mt-3 min-h-32" [class.hidden]="state() === 'error'">
            @if (versionList().length === 0) {
              <p
                role="alert"
                class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
              >
                There is no Maven coordinate called “{{ coordinate() }}” in this repository.
              </p>
            } @else {
              @if (sbomsUnknown()) {
                <div
                  class="mb-3 flex flex-wrap items-center gap-3 text-sm text-fg-muted"
                  data-sboms-unknown
                >
                  <span>This coordinate’s SBOMs could not be read; the versions follow.</span>
                  <button
                    type="button"
                    class="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft hover:bg-surface-muted"
                    (click)="sboms.reload()"
                  >
                    Retry
                  </button>
                </div>
              }
              <div class="overflow-x-auto">
                <table class="w-full border-collapse text-left text-sm" aria-label="Versions">
                  <thead>
                    <tr class="border-b border-line text-xs text-fg-muted">
                      <th class="py-1.5 pr-3 font-semibold">Version</th>
                      <th class="py-1.5 pr-3 font-semibold">Files</th>
                      <th class="py-1.5 pr-3 text-right font-semibold">Size</th>
                      <th class="py-1.5 pr-3 font-semibold">Published</th>
                      <th class="py-1.5 font-semibold">SBOM</th>
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
                          class="min-w-56 py-1.5 pr-3 font-mono text-xs wrap-anywhere text-fg-soft"
                          [fieldOf]="row"
                          [qitsField]="marks.files"
                        >
                          @for (file of files(row); track file) {
                            <span class="block">{{ file }}</span>
                          }
                        </td>
                        <td
                          class="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums"
                          [fieldOf]="row"
                          [qitsField]="marks.sizeBytes"
                        >
                          {{ bytes(row.sizeBytes) }}
                        </td>
                        <td
                          class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                          [fieldOf]="row"
                          [qitsField]="marks.publishedAt"
                        >
                          {{ instant(row.publishedAt) }}
                        </td>
                        <td class="py-1.5 text-xs">
                          <app-sbom-cell
                            [packageType]="packageType"
                            [packageName]="coordinate()"
                            [version]="row.version ?? ''"
                            [sbom]="sbomOf(row)"
                            [source]="sboms"
                            [unknown]="sbomsUnknown()"
                            [saved]="downloading.saved"
                            [failed]="downloading.failed"
                          />
                        </td>
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
export class ArtifactsMavenPackagePage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);

  /** "← <repo>", and a non-maven repository's store page: the repository's page. */
  protected readonly leaving = outcomes('leave-maven-package', {
    back: exit('artifacts/repositories/:repo'),
    repository: exit('artifacts/repositories/:repo'),
  });

  /** A version's SBOM saved as a file, or not: the page stays either way. */
  protected readonly downloading = outcomes('download-maven-sbom', {
    saved: stay(),
    failed: stay(),
  });

  protected readonly packageType = PACKAGE_TYPE;

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The URL's store repository name. */
  protected readonly repo = computed(() => this.params().get('repo') ?? '');
  /** The URL's coordinate, `groupId:artifactId`, decoded. */
  protected readonly coordinate = computed(() => this.params().get('coordinate') ?? '');
  /** The coordinate's groupId and artifactId. */
  protected readonly parts = computed(() => splitCoordinate(this.coordinate()));
  /** `groupId:`, the heading's first part, so a narrow heading breaks after the colon. */
  protected readonly groupPrefix = computed(() => {
    const groupId = this.parts().groupId;
    return groupId ? `${groupId}:` : '';
  });

  /** The coordinate's versions, in store order. */
  protected readonly versions = qitsResource(ARTIFACT_MAVEN_VERSIONS, () => {
    const repo = this.repo();
    const coordinate = this.coordinate();
    return this.browser && repo && coordinate ? { path: { repo, coordinate } } : undefined;
  });

  /** The coordinate's stored SBOMs, newest first; a 404 when it has none. */
  protected readonly sboms = qitsResource(ARTIFACT_SBOM_VERSIONS, () => {
    const packageName = this.coordinate();
    return this.browser && packageName
      ? { path: { packageType: PACKAGE_TYPE, packageName } }
      : undefined;
  });

  protected readonly versionList = computed(
    (): readonly ArtifactMavenVersion[] =>
      (this.versions.hasValue() ? this.versions.value()?.versions : undefined) ?? [],
  );
  /** The versions, newest publish first. */
  protected readonly versionRows = computed(() => newestPublishFirst(this.versionList()));

  private readonly sbomStatus = computed(() => failureStatus(this.sboms));

  /** The SBOMs, none when the list answered 404 (the coordinate has none) or failed. */
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

  /** A 400 on the versions: the repository holds something other than maven packages. */
  protected readonly notMaven = computed(() => this.versionStatus() === 400);

  /**
   * The table: failed when the versions failed, loaded once they answered and the SBOM list has
   * settled (answered, none, or failed), so the SBOM column never shows "—" for a list on its way.
   */
  protected readonly state = computed((): LoadState => {
    const versions = this.versions;
    if (versions.status() === 'error') return 'error';
    const sbomsSettled = this.sboms.hasValue() || this.sboms.status() === 'error';
    return versions.hasValue() && sbomsSettled ? 'loaded' : 'loading';
  });

  /** Refresh: the versions and the SBOM list, read again (no event follows the store). */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.versions.reload();
        this.sboms.reload();
      },
    },
  ];

  protected readonly marks = MARKS;

  /** Retry: the failed reads, again. */
  protected retry(): void {
    this.versions.reload();
    if (this.sboms.status() === 'error') this.sboms.reload();
  }

  /** This version's SBOM, if the list holds one. */
  protected sbomOf(row: ArtifactMavenVersion): ArtifactSbomVersion | undefined {
    return this.sbomIndex().get(row.version ?? '');
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

  /** `1 SBOM documents a version this coordinate no longer stores.` */
  protected orphanNote(): string {
    const n = this.orphans();
    return n === 1
      ? '1 SBOM documents a version this coordinate no longer stores.'
      : `${n} SBOMs document versions this coordinate no longer stores.`;
  }

  protected files(row: ArtifactMavenVersion): readonly string[] {
    return sortedFiles(row.files);
  }

  protected bytes(value: number | undefined): string {
    return formatBytes(value);
  }

  protected instant(iso: string | undefined): string {
    return formatInstant(iso);
  }
}

/** The data marks of what the page derives from a row (each a class constant, as the rule reads). */
const MARKS = {
  files: { derived: ['files'] },
  sizeBytes: { derived: ['sizeBytes'] },
  publishedAt: { derived: ['publishedAt'] },
} as const;
