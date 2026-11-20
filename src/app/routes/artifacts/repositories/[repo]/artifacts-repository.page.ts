import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  PLATFORM_ID,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  external,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
  QitsTriggers,
  type ExternalOutcome,
} from '@qits/angular';
import { map } from 'rxjs';
import {
  formatBytes,
  itemNoun,
  listingOf,
  metadataLine,
  oldDetailHref,
  plural,
  searched,
  type ListingKind,
} from '$core/artifacts/artifact-listings';
import type {
  ArtifactDaemon,
  ArtifactDocsSite,
  ArtifactImage,
  ArtifactMavenPackage,
  ArtifactNpmPackage,
  ArtifactRecord,
  ArtifactRepository,
} from '$core/artifacts/artifacts.consumes';
import {
  ARTIFACT_DAEMONS,
  ARTIFACT_DOCS_SITES,
  ARTIFACT_IMAGES,
  ARTIFACT_MAVEN_PACKAGES,
  ARTIFACT_NPM_PACKAGES,
  ARTIFACT_RECORDS,
  ARTIFACT_REPOSITORIES,
} from '$core/artifacts/artifacts.operations';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { formatInstant } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** A listing's read, as far as the page's state, Retry and Refresh need it. */
interface ListingRead {
  status(): string;
  hasValue(): boolean;
  reload(): boolean;
}

/**
 * One store repository of qits-artifacts (qits-2316), at `/artifacts/repositories/<repo>`: the
 * Artifacts section, a global one (no project: nothing in the store joins to one). It replaces
 * qits-artifacts-frontend's `repositories/:repo` and mirrors its tables.
 *
 * **Load budget: 1 + 1.** `ARTIFACT_REPOSITORIES` (`listRepositories`) is the only way to learn a
 * repository's type; its row then chooses exactly one listing (`listingOf`): `ARTIFACT_IMAGES`
 * (oci-images), `ARTIFACT_NPM_PACKAGES` (npm-packages), `ARTIFACT_MAVEN_PACKAGES`
 * (maven-packages), `ARTIFACT_DAEMONS` (daemon-binaries), `ARTIFACT_DOCS_SITES` (docs) or
 * `ARTIFACT_RECORDS` (ci-screenshots, ci-videos, unfiltered). A type with no listing here (today
 * `sboms`) makes no second request and says so; a name the store does not hold says that. Each
 * listing's rows carry their own counts and sizes, so nothing fans out per row, and the name search
 * narrows the one bounded answer in the page.
 *
 * The header names the repository, its type and "N <items> · <size>"; the switcher below it lists
 * every store repository from the same answer (`switch-artifacts-repository`), the old front
 * page's way between them. The reads are made in the browser only (the server render has no
 * session).
 *
 * Where it leads is declared (epic qits-2000): an image's name opens its page here
 * (`open-artifact-image`, `artifacts/repositories/:repo/images/:image`, `ArtifactsImagePage`,
 * qits-2324), and a daemon's name its page here (`open-artifact-daemon`,
 * `artifacts/repositories/:repo/daemons/:daemon`, `ArtifactsDaemonPage`, qits-2327), the name one
 * segment. Any other row's name opens its detail page in the old explorer (`open-artifacts-entry`,
 * `external('artifacts')`, same tab), at `PlatformOrigins.page('artifacts')` +
 * `/repositories/<repo>/<packages|maven-packages|docs>/<name>`, the name one segment
 * (`oldDetailHref`), until the section's own detail pages (qits-2325, qits-2326) land. The ci
 * records have no detail page, and no download here.
 *
 * Marks (qits-2141): the header's row and each switcher entry are `listRepositories`' rows by
 * name; each table is its listing's read, each row an entry by its name (a record by its id).
 *
 * Staleness (qits-1270): none can follow: qits-artifacts emits no domain event for a push, a
 * publish or a sweep, so nothing reads again by itself and nothing polls. Refresh reads the
 * repositories and the shown listing again.
 */
@Component({
  selector: 'app-artifacts-repository-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    QitsTriggers,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="repo()" [actions]="actions">
        @if (repository(); as row) {
          <p
            class="mt-0 mb-4 flex flex-wrap items-center gap-2 text-sm text-fg-soft"
            [qitsEntity]="row"
            entityKey="name"
            [entitySource]="repositories"
          >
            <ui-chip [label]="row.type ?? ''" [fieldOf]="row" qitsField="type" />
            <span [fieldOf]="row" [qitsField]="ledeMark">{{ lede(row) }}</span>
          </p>
        }
        <nav
          aria-label="Store repositories"
          class="mb-6 flex flex-wrap gap-1"
          [qitsEntityList]="repositories"
          [class.hidden]="storeRepositories().length === 0"
        >
          @for (row of storeRepositories(); track row.name) {
            <span [qitsEntity]="row" entityKey="name">
              <a
                class="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft no-underline hover:bg-surface-muted aria-[current=page]:border-accent-line aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
                [qitsExit]="switching.repository"
                [exitParams]="{ repo: row.name ?? '' }"
                [exitActiveExact]="true"
                [fieldOf]="row"
                qitsField="name"
                >{{ row.name }}</a
              >
            </span>
          }
        </nav>

        <ui-load-failure
          message="The store’s repositories could not be read."
          [class.hidden]="repositoriesState() !== 'error'"
          (retry)="repositories.reload()"
        />
        <ui-spinner
          [state]="repositoriesState()"
          class="min-h-32"
          [class.hidden]="repositoriesState() === 'error'"
        >
          @if (missing()) {
            <p
              role="alert"
              class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
            >
              There is no repository called “{{ repo() }}” in this store.
            </p>
          }
          @if (repository() && !kind()) {
            <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted">
              This repository’s type has no listing here yet.
            </p>
          }
          @switch (kind()) {
            @case ('images') {
              <section aria-label="Images">
                <ui-load-failure
                  message="The images could not be read."
                  [class.hidden]="imagesState() !== 'error'"
                  (retry)="images.reload()"
                />
                <ui-spinner
                  [state]="imagesState()"
                  class="min-h-32"
                  [class.hidden]="imagesState() === 'error'"
                >
                  <input
                    type="search"
                    class="mb-3 h-8 w-full max-w-sm rounded-md border border-line bg-surface px-2 text-sm text-fg"
                    aria-label="Search images"
                    placeholder="Filter by name…"
                    [value]="search()"
                    (input)="search.set(inputValue($event))"
                  />
                  <div class="overflow-x-auto">
                    <table class="w-full border-collapse text-left text-sm" aria-label="Images">
                      <thead>
                        <tr class="border-b border-line text-xs text-fg-muted">
                          <th class="py-1.5 pr-3 font-semibold">Image</th>
                          <th class="py-1.5 pr-3 font-semibold">Contents</th>
                          <th class="py-1.5 text-right font-semibold">Size (per-image union)</th>
                        </tr>
                      </thead>
                      <tbody [qitsEntityList]="images">
                        @for (image of imageRows(); track image.name) {
                          <tr
                            class="border-b border-line-subtle align-top"
                            [qitsEntity]="image"
                            entityKey="name"
                          >
                            <td class="py-1.5 pr-3 font-medium break-all">
                              <a
                                class="text-accent no-underline hover:underline"
                                [qitsExit]="imaging.image"
                                [exitParams]="{ repo: repo(), image: image.name ?? '' }"
                                [fieldOf]="image"
                                qitsField="name"
                                >{{ image.name }}</a
                              >
                            </td>
                            <td
                              class="py-1.5 pr-3 text-fg-soft"
                              [fieldOf]="image"
                              [qitsField]="{ derived: ['tagCount', 'manifestCount'] }"
                            >
                              {{ imageContents(image) }}
                            </td>
                            <td
                              class="py-1.5 text-right whitespace-nowrap tabular-nums"
                              [fieldOf]="image"
                              [qitsField]="{ derived: ['sizeBytes'] }"
                            >
                              {{ bytes(image.sizeBytes) }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <p
                    class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                    [class]="
                      imagesState() === 'loaded' && imageList().length === 0 ? 'block' : 'hidden'
                    "
                  >
                    This repository holds no images.
                  </p>
                  <p
                    class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                    [class]="
                      imagesState() === 'loaded' &&
                      imageList().length > 0 &&
                      imageRows().length === 0
                        ? 'block'
                        : 'hidden'
                    "
                  >
                    No images match “{{ search().trim() }}”.
                  </p>
                </ui-spinner>
              </section>
            }
            @case ('npm') {
              <section aria-label="Packages">
                <ui-load-failure
                  message="The packages could not be read."
                  [class.hidden]="npmState() !== 'error'"
                  (retry)="npmPackages.reload()"
                />
                <ui-spinner
                  [state]="npmState()"
                  class="min-h-32"
                  [class.hidden]="npmState() === 'error'"
                >
                  <input
                    type="search"
                    class="mb-3 h-8 w-full max-w-sm rounded-md border border-line bg-surface px-2 text-sm text-fg"
                    aria-label="Search packages"
                    placeholder="Filter by name…"
                    [value]="search()"
                    (input)="search.set(inputValue($event))"
                  />
                  <div class="overflow-x-auto">
                    <table class="w-full border-collapse text-left text-sm" aria-label="Packages">
                      <thead>
                        <tr class="border-b border-line text-xs text-fg-muted">
                          <th class="py-1.5 pr-3 font-semibold">Package</th>
                          <th class="py-1.5 pr-3 text-right font-semibold">Versions</th>
                          <th class="py-1.5 font-semibold">Latest</th>
                        </tr>
                      </thead>
                      <tbody [qitsEntityList]="npmPackages">
                        @for (pkg of npmRows(); track pkg.name) {
                          <tr
                            class="border-b border-line-subtle align-top"
                            [qitsEntity]="pkg"
                            entityKey="name"
                          >
                            <td class="py-1.5 pr-3 font-medium break-all">
                              <a
                                class="text-accent no-underline hover:underline"
                                [attr.href]="detailHref('npm', pkg.name) || null"
                                [qitsTriggers]="triggers('npm', pkg.name, opening.npmPackage)"
                                (click)="leave($event, opening.npmPackage, 'npm', pkg.name)"
                                [fieldOf]="pkg"
                                qitsField="name"
                                >{{ pkg.name }}</a
                              >
                            </td>
                            <td
                              class="py-1.5 pr-3 text-right tabular-nums"
                              [fieldOf]="pkg"
                              qitsField="versionCount"
                            >
                              {{ pkg.versionCount }}
                            </td>
                            <td
                              class="py-1.5 font-mono text-fg-soft"
                              [fieldOf]="pkg"
                              [qitsField]="{ derived: ['latest'] }"
                            >
                              {{ pkg.latest ?? '—' }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <p
                    class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                    [class]="npmState() === 'loaded' && npmList().length === 0 ? 'block' : 'hidden'"
                  >
                    This repository holds no packages.
                  </p>
                  <p
                    class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                    [class]="
                      npmState() === 'loaded' && npmList().length > 0 && npmRows().length === 0
                        ? 'block'
                        : 'hidden'
                    "
                  >
                    No packages match “{{ search().trim() }}”.
                  </p>
                </ui-spinner>
              </section>
            }
            @case ('maven') {
              <section aria-label="Maven coordinates">
                <ui-load-failure
                  message="The Maven coordinates could not be read."
                  [class.hidden]="mavenState() !== 'error'"
                  (retry)="mavenPackages.reload()"
                />
                <ui-spinner
                  [state]="mavenState()"
                  class="min-h-32"
                  [class.hidden]="mavenState() === 'error'"
                >
                  <input
                    type="search"
                    class="mb-3 h-8 w-full max-w-sm rounded-md border border-line bg-surface px-2 text-sm text-fg"
                    aria-label="Search Maven coordinates"
                    placeholder="Filter by name…"
                    [value]="search()"
                    (input)="search.set(inputValue($event))"
                  />
                  <div class="overflow-x-auto">
                    <table
                      class="w-full border-collapse text-left text-sm"
                      aria-label="Maven coordinates"
                    >
                      <thead>
                        <tr class="border-b border-line text-xs text-fg-muted">
                          <th class="py-1.5 pr-3 font-semibold">Coordinate</th>
                          <th class="py-1.5 pr-3 text-right font-semibold">Versions</th>
                          <th class="py-1.5 text-right font-semibold">Published size</th>
                        </tr>
                      </thead>
                      <tbody [qitsEntityList]="mavenPackages">
                        @for (pkg of mavenRows(); track pkg.name) {
                          <tr
                            class="border-b border-line-subtle align-top"
                            [qitsEntity]="pkg"
                            entityKey="name"
                          >
                            <td class="py-1.5 pr-3 font-mono break-all">
                              <a
                                class="text-accent no-underline hover:underline"
                                [attr.href]="detailHref('maven', pkg.name) || null"
                                [qitsTriggers]="triggers('maven', pkg.name, opening.mavenPackage)"
                                (click)="leave($event, opening.mavenPackage, 'maven', pkg.name)"
                                [fieldOf]="pkg"
                                qitsField="name"
                                >{{ pkg.name }}</a
                              >
                            </td>
                            <td
                              class="py-1.5 pr-3 text-right tabular-nums"
                              [fieldOf]="pkg"
                              qitsField="versionCount"
                            >
                              {{ pkg.versionCount }}
                            </td>
                            <td
                              class="py-1.5 text-right whitespace-nowrap tabular-nums"
                              [fieldOf]="pkg"
                              [qitsField]="{ derived: ['sizeBytes'] }"
                            >
                              {{ bytes(pkg.sizeBytes) }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <p
                    class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                    [class]="
                      mavenState() === 'loaded' && mavenList().length === 0 ? 'block' : 'hidden'
                    "
                  >
                    This repository holds no Maven coordinates.
                  </p>
                  <p
                    class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                    [class]="
                      mavenState() === 'loaded' &&
                      mavenList().length > 0 &&
                      mavenRows().length === 0
                        ? 'block'
                        : 'hidden'
                    "
                  >
                    No Maven coordinates match “{{ search().trim() }}”.
                  </p>
                </ui-spinner>
              </section>
            }
            @case ('daemons') {
              <section aria-label="Daemons">
                <ui-load-failure
                  message="The daemons could not be read."
                  [class.hidden]="daemonsState() !== 'error'"
                  (retry)="daemons.reload()"
                />
                <ui-spinner
                  [state]="daemonsState()"
                  class="min-h-32"
                  [class.hidden]="daemonsState() === 'error'"
                >
                  <input
                    type="search"
                    class="mb-3 h-8 w-full max-w-sm rounded-md border border-line bg-surface px-2 text-sm text-fg"
                    aria-label="Search daemons"
                    placeholder="Filter by name…"
                    [value]="search()"
                    (input)="search.set(inputValue($event))"
                  />
                  <div class="overflow-x-auto">
                    <table class="w-full border-collapse text-left text-sm" aria-label="Daemons">
                      <thead>
                        <tr class="border-b border-line text-xs text-fg-muted">
                          <th class="py-1.5 pr-3 font-semibold">Daemon</th>
                          <th class="py-1.5 pr-3 text-right font-semibold">Versions</th>
                          <th class="py-1.5 pr-3 font-semibold">Latest</th>
                          <th class="py-1.5 text-right font-semibold">Size (per-daemon union)</th>
                        </tr>
                      </thead>
                      <tbody [qitsEntityList]="daemons">
                        @for (daemon of daemonRows(); track daemon.name) {
                          <tr
                            class="border-b border-line-subtle align-top"
                            [qitsEntity]="daemon"
                            entityKey="name"
                          >
                            <td class="py-1.5 pr-3 font-medium break-all">
                              <a
                                class="text-accent no-underline hover:underline"
                                [qitsExit]="daemoning.daemon"
                                [exitParams]="{ repo: repo(), daemon: daemon.name ?? '' }"
                                [fieldOf]="daemon"
                                qitsField="name"
                                >{{ daemon.name }}</a
                              >
                            </td>
                            <td
                              class="py-1.5 pr-3 text-right tabular-nums"
                              [fieldOf]="daemon"
                              qitsField="versionCount"
                            >
                              {{ daemon.versionCount }}
                            </td>
                            <td
                              class="py-1.5 pr-3 font-mono"
                              [fieldOf]="daemon"
                              [qitsField]="{ derived: ['latestVersion', 'latestPublishedAt'] }"
                            >
                              {{ daemon.latestVersion }}
                              <span class="font-sans whitespace-nowrap text-fg-muted"
                                >· {{ instant(daemon.latestPublishedAt) }}</span
                              >
                            </td>
                            <td
                              class="py-1.5 text-right whitespace-nowrap tabular-nums"
                              [fieldOf]="daemon"
                              [qitsField]="{ derived: ['sizeBytes'] }"
                            >
                              {{ bytes(daemon.sizeBytes) }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <p
                    class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                    [class]="
                      daemonsState() === 'loaded' && daemonList().length === 0 ? 'block' : 'hidden'
                    "
                  >
                    This repository holds no daemons.
                  </p>
                  <p
                    class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                    [class]="
                      daemonsState() === 'loaded' &&
                      daemonList().length > 0 &&
                      daemonRows().length === 0
                        ? 'block'
                        : 'hidden'
                    "
                  >
                    No daemons match “{{ search().trim() }}”.
                  </p>
                </ui-spinner>
              </section>
            }
            @case ('docs') {
              <section aria-label="Documentation sites">
                <ui-load-failure
                  message="The documentation sites could not be read."
                  [class.hidden]="docsState() !== 'error'"
                  (retry)="docsSites.reload()"
                />
                <ui-spinner
                  [state]="docsState()"
                  class="min-h-32"
                  [class.hidden]="docsState() === 'error'"
                >
                  <input
                    type="search"
                    class="mb-3 h-8 w-full max-w-sm rounded-md border border-line bg-surface px-2 text-sm text-fg"
                    aria-label="Search documentation sites"
                    placeholder="Filter by name…"
                    [value]="search()"
                    (input)="search.set(inputValue($event))"
                  />
                  <div class="overflow-x-auto">
                    <table
                      class="w-full border-collapse text-left text-sm"
                      aria-label="Documentation sites"
                    >
                      <thead>
                        <tr class="border-b border-line text-xs text-fg-muted">
                          <th class="py-1.5 pr-3 font-semibold">Site</th>
                          <th class="py-1.5 pr-3 text-right font-semibold">Versions</th>
                          <th class="py-1.5 pr-3 font-semibold">Latest</th>
                          <th class="py-1.5 text-right font-semibold">
                            Published size (per-site union)
                          </th>
                        </tr>
                      </thead>
                      <tbody [qitsEntityList]="docsSites">
                        @for (site of docsRows(); track site.name) {
                          <tr
                            class="border-b border-line-subtle align-top"
                            [qitsEntity]="site"
                            entityKey="name"
                          >
                            <td class="py-1.5 pr-3 font-mono break-all">
                              <a
                                class="text-accent no-underline hover:underline"
                                [attr.href]="detailHref('docs', site.name) || null"
                                [qitsTriggers]="triggers('docs', site.name, opening.docsSite)"
                                (click)="leave($event, opening.docsSite, 'docs', site.name)"
                                [fieldOf]="site"
                                qitsField="name"
                                >{{ site.name }}</a
                              >
                            </td>
                            <td
                              class="py-1.5 pr-3 text-right tabular-nums"
                              [fieldOf]="site"
                              qitsField="versionCount"
                            >
                              {{ site.versionCount }}
                            </td>
                            <td
                              class="py-1.5 pr-3 font-mono"
                              [fieldOf]="site"
                              [qitsField]="{ derived: ['latestVersion', 'latestPublishedAt'] }"
                            >
                              {{ site.latestVersion }}
                              <span class="font-sans whitespace-nowrap text-fg-muted"
                                >· {{ instant(site.latestPublishedAt) }}</span
                              >
                            </td>
                            <td
                              class="py-1.5 text-right whitespace-nowrap tabular-nums"
                              [fieldOf]="site"
                              [qitsField]="{ derived: ['sizeBytes'] }"
                            >
                              {{ bytes(site.sizeBytes) }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <p
                    class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                    [class]="
                      docsState() === 'loaded' && docsList().length === 0 ? 'block' : 'hidden'
                    "
                  >
                    This repository holds no documentation sites.
                  </p>
                  <p
                    class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                    [class]="
                      docsState() === 'loaded' && docsList().length > 0 && docsRows().length === 0
                        ? 'block'
                        : 'hidden'
                    "
                  >
                    No documentation sites match “{{ search().trim() }}”.
                  </p>
                </ui-spinner>
              </section>
            }
            @case ('records') {
              <section aria-label="Records">
                <ui-load-failure
                  message="The records could not be read."
                  [class.hidden]="recordsState() !== 'error'"
                  (retry)="records.reload()"
                />
                <ui-spinner
                  [state]="recordsState()"
                  class="min-h-32"
                  [class.hidden]="recordsState() === 'error'"
                >
                  <input
                    type="search"
                    class="mb-3 h-8 w-full max-w-sm rounded-md border border-line bg-surface px-2 text-sm text-fg"
                    aria-label="Search records"
                    placeholder="Filter by name…"
                    [value]="search()"
                    (input)="search.set(inputValue($event))"
                  />
                  <div class="overflow-x-auto">
                    <table class="w-full border-collapse text-left text-sm" aria-label="Records">
                      <thead>
                        <tr class="border-b border-line text-xs text-fg-muted">
                          <th class="py-1.5 pr-3 font-semibold">Media type</th>
                          <th class="py-1.5 pr-3 font-semibold">Metadata</th>
                          <th class="py-1.5 pr-3 text-right font-semibold">Size</th>
                          <th class="py-1.5 pr-3 font-semibold">Created</th>
                          <th class="py-1.5 font-semibold">Last accessed</th>
                        </tr>
                      </thead>
                      <tbody [qitsEntityList]="records">
                        @for (record of recordRows(); track record.id) {
                          <tr
                            class="border-b border-line-subtle align-top"
                            [qitsEntity]="record"
                            entityKey="id"
                          >
                            <td
                              class="py-1.5 pr-3 text-fg-soft"
                              [fieldOf]="record"
                              qitsField="mediatype"
                            >
                              {{ record.mediatype }}
                            </td>
                            <td
                              class="py-1.5 pr-3 break-all text-fg-soft"
                              [fieldOf]="record"
                              [qitsField]="{ derived: ['metadata'] }"
                            >
                              {{ metadata(record) }}
                            </td>
                            <td
                              class="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums"
                              [fieldOf]="record"
                              [qitsField]="{ derived: ['size'] }"
                            >
                              {{ bytes(record.size) }}
                            </td>
                            <td
                              class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                              [fieldOf]="record"
                              [qitsField]="{ derived: ['createdAt'] }"
                            >
                              {{ instant(record.createdAt) }}
                            </td>
                            <td
                              class="py-1.5 whitespace-nowrap text-fg-soft"
                              [fieldOf]="record"
                              [qitsField]="{ derived: ['accessedAt'] }"
                            >
                              {{ record.accessedAt ? instant(record.accessedAt) : 'Never' }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <p
                    class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                    [class]="
                      recordsState() === 'loaded' && recordList().length === 0 ? 'block' : 'hidden'
                    "
                  >
                    This repository holds no records.
                  </p>
                  <p
                    class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                    [class]="
                      recordsState() === 'loaded' &&
                      recordList().length > 0 &&
                      recordRows().length === 0
                        ? 'block'
                        : 'hidden'
                    "
                  >
                    No records match “{{ search().trim() }}”.
                  </p>
                </ui-spinner>
              </section>
            }
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ArtifactsRepositoryPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly origin = inject(PlatformOrigins).page('artifacts');

  /** Another store repository, from the switcher. */
  protected readonly switching = outcomes('switch-artifacts-repository', {
    repository: exit('artifacts/repositories/:repo'),
  });

  /**
   * An image row's name: the image's page here (qits-2324), the name one segment (the exit encodes
   * it, so a slash rides as `%2F`).
   */
  protected readonly imaging = outcomes('open-artifact-image', {
    image: exit('artifacts/repositories/:repo/images/:image'),
  });

  /** A daemon row's name: the daemon's page here (qits-2327), the name one segment. */
  protected readonly daemoning = outcomes('open-artifact-daemon', {
    daemon: exit('artifacts/repositories/:repo/daemons/:daemon'),
  });

  /**
   * Any other row's name: its detail page in the old explorer (qits-artifacts-frontend), same tab,
   * until the section's own detail pages land (qits-2325, qits-2326).
   */
  protected readonly opening = outcomes('open-artifacts-entry', {
    npmPackage: external('artifacts'),
    mavenPackage: external('artifacts'),
    docsSite: external('artifacts'),
  });

  /** The header line's mark: derived from the row's type, count and size. */
  protected readonly ledeMark = { derived: ['type', 'itemCount', 'sizeBytes'] } as const;

  /** The URL's store repository name. */
  protected readonly repo = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('repo') ?? '')),
    { initialValue: '' },
  );

  /** Every store repository: the only way to learn this one's type. */
  protected readonly repositories = qitsResource(ARTIFACT_REPOSITORIES, () =>
    this.browser ? {} : undefined,
  );

  /** Every store repository, for the switcher; none until the list answered. */
  protected readonly storeRepositories = computed(
    (): readonly ArtifactRepository[] =>
      (this.repositories.hasValue() ? this.repositories.value()?.repositories : undefined) ?? [],
  );

  /** This repository's own row, once the list answered. */
  protected readonly repository = computed(() =>
    this.storeRepositories().find((row) => row.name === this.repo()),
  );

  /** The list answered and this name is not in it. */
  protected readonly missing = computed(
    () => this.repositories.hasValue() && this.repo() !== '' && !this.repository(),
  );

  /** The listing this repository's type has; none for an unknown name or a type without one. */
  protected readonly kind = computed((): ListingKind | undefined =>
    listingOf(this.repository()?.type),
  );

  /** The params of the one listing `kind` reads; undefined keeps every other listing idle. */
  private readonly listingParams = (kind: ListingKind) => () =>
    this.kind() === kind ? { path: { repo: this.repo() } } : undefined;

  protected readonly images = qitsResource(ARTIFACT_IMAGES, this.listingParams('images'));
  protected readonly npmPackages = qitsResource(ARTIFACT_NPM_PACKAGES, this.listingParams('npm'));
  protected readonly mavenPackages = qitsResource(
    ARTIFACT_MAVEN_PACKAGES,
    this.listingParams('maven'),
  );
  protected readonly daemons = qitsResource(ARTIFACT_DAEMONS, this.listingParams('daemons'));
  protected readonly docsSites = qitsResource(ARTIFACT_DOCS_SITES, this.listingParams('docs'));
  protected readonly records = qitsResource(ARTIFACT_RECORDS, this.listingParams('records'));

  /** The name search; cleared when another repository opens. */
  protected readonly search = linkedSignal({ source: this.repo, computation: () => '' });

  private readonly imageList = computed(
    (): readonly ArtifactImage[] =>
      (this.images.hasValue() ? this.images.value()?.images : undefined) ?? [],
  );
  private readonly npmList = computed(
    (): readonly ArtifactNpmPackage[] =>
      (this.npmPackages.hasValue() ? this.npmPackages.value()?.packages : undefined) ?? [],
  );
  private readonly mavenList = computed(
    (): readonly ArtifactMavenPackage[] =>
      (this.mavenPackages.hasValue() ? this.mavenPackages.value()?.packages : undefined) ?? [],
  );
  private readonly daemonList = computed(
    (): readonly ArtifactDaemon[] =>
      (this.daemons.hasValue() ? this.daemons.value()?.daemons : undefined) ?? [],
  );
  private readonly docsList = computed(
    (): readonly ArtifactDocsSite[] =>
      (this.docsSites.hasValue() ? this.docsSites.value()?.sites : undefined) ?? [],
  );
  private readonly recordList = computed(
    (): readonly ArtifactRecord[] =>
      (this.records.hasValue() ? this.records.value()?.records : undefined) ?? [],
  );

  private readonly byName = <T extends { readonly name?: string }>(rows: readonly T[]) =>
    searched(rows, this.search(), (row) => row.name ?? '');

  protected readonly imageRows = computed(() => this.byName(this.imageList()));
  protected readonly npmRows = computed(() => this.byName(this.npmList()));
  protected readonly mavenRows = computed(() => this.byName(this.mavenList()));
  protected readonly daemonRows = computed(() => this.byName(this.daemonList()));
  protected readonly docsRows = computed(() => this.byName(this.docsList()));
  /** The ci records have no name: the search reads their media type and metadata. */
  protected readonly recordRows = computed(() =>
    searched(
      this.recordList(),
      this.search(),
      (record) => `${record.mediatype ?? ''} ${metadataLine(record.metadata)}`,
    ),
  );

  protected readonly imagesState = computed((): LoadState => loadState(this.images));
  protected readonly npmState = computed((): LoadState => loadState(this.npmPackages));
  protected readonly mavenState = computed((): LoadState => loadState(this.mavenPackages));
  protected readonly daemonsState = computed((): LoadState => loadState(this.daemons));
  protected readonly docsState = computed((): LoadState => loadState(this.docsSites));
  protected readonly recordsState = computed((): LoadState => loadState(this.records));

  /** The shown listing's read. */
  protected readonly listing = computed((): ListingRead | undefined => {
    switch (this.kind()) {
      case 'images':
        return this.images;
      case 'npm':
        return this.npmPackages;
      case 'maven':
        return this.mavenPackages;
      case 'daemons':
        return this.daemons;
      case 'docs':
        return this.docsSites;
      case 'records':
        return this.records;
      default:
        return undefined;
    }
  });

  protected readonly repositoriesState = computed((): LoadState => loadState(this.repositories));
  /** Refresh: the repositories and the shown listing, read again (no event follows the store). */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.repositories.reload();
        this.listing()?.reload();
      },
    },
  ];

  /** `46 images · 4.04 GiB`: what the repository holds, under its name. */
  protected lede(row: ArtifactRepository): string {
    return `${plural(row.itemCount, itemNoun(row.type))} · ${formatBytes(row.sizeBytes)}`;
  }

  /** `22 tags · 22 manifests`: what an image row carries beside its size. */
  protected imageContents(image: ArtifactImage): string {
    return `${plural(image.tagCount, 'tag')} · ${plural(image.manifestCount, 'manifest')}`;
  }

  protected bytes(value: number | undefined): string {
    return formatBytes(value);
  }

  protected instant(iso: string | undefined): string {
    return formatInstant(iso);
  }

  protected metadata(record: ArtifactRecord): string {
    return metadataLine(record.metadata);
  }

  /** A row's detail page in the old explorer; `''` while the origin is not known. */
  protected detailHref(kind: ListingKind, name: string | undefined): string {
    return oldDetailHref(this.origin, this.repo(), kind, name ?? '');
  }

  /** The row link's outcome, only while it has an address. */
  protected triggers(
    kind: ListingKind,
    name: string | undefined,
    outcome: ExternalOutcome,
  ): readonly ExternalOutcome[] {
    return this.detailHref(kind, name) ? [outcome] : [];
  }

  /** A row link's plain click: records the outcome and leaves for the old explorer, in this tab. */
  protected leave(
    event: MouseEvent,
    outcome: ExternalOutcome,
    kind: ListingKind,
    name: string | undefined,
  ): void {
    const href = this.detailHref(kind, name);
    if (!href || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    outcome.leave(href);
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
