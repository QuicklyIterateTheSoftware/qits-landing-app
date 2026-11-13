import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { QitsEntity, QitsField } from '@qits/angular';
import type {
  ConflictedPath,
  ReleaseRequest,
} from '$core/release-requests/release-request.consumes';
import {
  refName,
  releaseConflict,
  shortShaOrNone,
} from '$core/release-requests/release-request-model';

/**
 * The paths a request's sources could not be folded on (ported from qits-projects-frontend's
 * `release-conflict`): each path with the branch and commit that brought it in, or, for a
 * submodule, the two pins that disagree. Nothing is drawn while the request has no conflict.
 * Marks (qits-2141): the panel is the request's conflict, each path an entity by its path.
 */
@Component({
  selector: 'app-release-conflict',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsEntity, QitsField],
  host: { class: 'block' },
  template: `
    @if (conflict(); as conflict) {
      <section
        class="mt-3 rounded border border-warning-line bg-warning-soft px-3 py-2"
        [qitsEntity]="request()"
        entityKey="id"
      >
        <p class="m-0 text-sm font-semibold text-warning-strong">
          These sources cannot be folded onto
          <span class="font-mono" [fieldOf]="request()" [qitsField]="{ derived: ['conflict'] }">{{
            name(conflict.target)
          }}</span>
        </p>
        <ul class="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
          @for (path of conflict.conflicts ?? []; track identity(path)) {
            <li
              class="flex flex-wrap items-baseline gap-2 text-sm"
              [qitsEntity]="path"
              entityKey="path"
            >
              <span class="font-mono break-all text-fg" [fieldOf]="path" qitsField="path">{{
                path.path
              }}</span>
              @if (isGitlink(path)) {
                <span
                  class="font-mono text-warning-strong"
                  [title]="conflict.target + ' at ' + path.ours"
                  [fieldOf]="path"
                  [qitsField]="{ derived: ['ours'] }"
                  >{{ pin(conflict.target, path.ours) }}</span
                >
                <span
                  class="font-mono text-warning-strong"
                  [title]="path.head + ' at ' + path.theirs"
                  [fieldOf]="path"
                  [qitsField]="{ derived: ['head', 'theirs'] }"
                  >{{ pin(path.head, path.theirs) }}</span
                >
                <span class="text-warning-strong">submodule</span>
              } @else {
                <span
                  class="font-mono text-warning-strong"
                  [title]="path.head + ' at ' + path.headSha"
                  [fieldOf]="path"
                  [qitsField]="{ derived: ['head', 'headSha'] }"
                  >{{ pin(path.head, path.headSha) }}</span
                >
                @if (path.reason) {
                  <span class="text-warning-strong" [fieldOf]="path" qitsField="reason">{{
                    path.reason
                  }}</span>
                }
              }
            </li>
          }
        </ul>
        <p class="mt-1 mb-0 text-sm text-warning-strong">
          These are what an automatic resolution could not answer. Resolve them on the source that
          introduced them and push — the request re-folds itself and carries on.
        </p>
      </section>
    }
  `,
})
export class ReleaseConflictPanel {
  readonly request = input.required<ReleaseRequest>();

  protected readonly name = refName;

  protected readonly conflict = computed(() => releaseConflict(this.request()));

  /** A submodule conflict: both pins are known. */
  protected isGitlink(path: ConflictedPath): boolean {
    return path.kind === 'gitlink' && !!path.ours && !!path.theirs;
  }

  /** A branch and a commit, `main · 1a2b3c4`. */
  protected pin(ref: string | undefined, sha: string | undefined): string {
    return `${refName(ref)} · ${shortShaOrNone(sha)}`;
  }

  protected identity(path: ConflictedPath): string {
    return `${path.path} ${path.head}`;
  }
}
