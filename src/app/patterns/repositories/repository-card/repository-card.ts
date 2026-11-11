import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { exit, outcomes, QitsExit } from '@qits/angular';
import type { RepositoryEntry } from '$core/repositories/repositories.consumes';
import { CardBody, CardExpandable, CardHeader } from '$ui/components/card/base-card';
import { CardSilent } from '$ui/components/card/card-silent';
import { Stat } from '$ui/components/stat/stat';

/** How a repository's last backup reads on its card, and the colour it reads in. */
interface Backup {
  readonly label: string;
  readonly tone: 'ok' | 'failed' | 'neutral';
}

/**
 * One repository of the Repositories page: its name, then a 50/50 row of its backup state (left,
 * mirrored) and its archetype (right); the expandable section holds its clone URL, backup URL and
 * main branch, each selectable as a whole for copying.
 *
 * - A repository without a forge twin (no backup URL) reads "No twin".
 * - A twin never backed up reads "Never".
 * - Otherwise the last outcome: Succeeded (mint-leaf), Failed / Unreachable / Auth needed
 *   (cinnabar).
 *
 * A repository whose declared archetype is FRONTEND or APP (never judged by its name) links its UI
 * builder at the bottom of the body (qits-1951). A SERVICE links its contracts (provider states)
 * and its entity map there instead (qits-1994). Each link is a declared exit of the open project
 * (`slug`): `open-repository-pages` `uiBuilder`, `contracts` and `entities` (epic qits-2000).
 */
@Component({
  selector: 'app-repository-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardSilent, CardHeader, CardBody, CardExpandable, Stat, QitsExit],
  host: { class: 'block' },
  template: `
    <ui-card-silent>
      <card-header class="bg-charcoal-brown-100 text-center font-mono text-charcoal-brown-900">{{
        name()
      }}</card-header>
      <card-body flush>
        <div class="grid grid-cols-2">
          <ui-stat class="backup w-full" label="Backup" mirrored>
            <span
              class="whitespace-nowrap"
              [class]="
                backup().tone === 'ok'
                  ? 'text-mint-leaf-700'
                  : backup().tone === 'failed'
                    ? 'text-cinnabar-600'
                    : 'text-charcoal-brown-600'
              "
              >{{ backup().label }}</span
            >
          </ui-stat>
          <ui-stat
            class="archetype w-full [&_dt]:border-l-[0.5px] [&_dt]:border-black/40"
            label="Archetype"
          >
            {{ archetype() }}
          </ui-stat>
        </div>
        @if (frontend()) {
          <div class="flex justify-end border-t-[0.5px] border-black/20 px-2 py-1">
            <a
              class="ui-builder text-xs font-semibold text-charcoal-brown-800 no-underline hover:underline"
              [qitsExit]="pages.uiBuilder"
              [exitParams]="params()"
              >UI builder →</a
            >
          </div>
        }
        @if (service()) {
          <div class="flex justify-end gap-3 border-t-[0.5px] border-black/20 px-2 py-1">
            <a
              class="contracts text-xs font-semibold text-charcoal-brown-800 no-underline hover:underline"
              [qitsExit]="pages.contracts"
              [exitParams]="params()"
              >Contracts →</a
            >
            <a
              class="entities text-xs font-semibold text-charcoal-brown-800 no-underline hover:underline"
              [qitsExit]="pages.entities"
              [exitParams]="params()"
              >Entities →</a
            >
          </div>
        }
      </card-body>
      <card-expandable>
        <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 pt-2 text-[0.8125rem]">
          <dt class="text-charcoal-brown-600">Clone</dt>
          <dd class="clone m-0 font-mono break-all select-all">
            {{ entry().repository?.cloneUrl ?? '–' }}
          </dd>
          <dt class="text-charcoal-brown-600">Backup</dt>
          <dd class="backup-url m-0 font-mono break-all select-all">
            {{ entry().repository?.backupUrl ?? '–' }}
          </dd>
          <dt class="text-charcoal-brown-600">Main branch</dt>
          <dd class="main-branch m-0 font-mono select-all">
            {{ entry().repository?.mainBranch ?? '–' }}
          </dd>
        </dl>
      </card-expandable>
    </ui-card-silent>
  `,
})
export class RepositoryCard {
  readonly entry = input.required<RepositoryEntry>();
  /** The open project's slug, for the links to the repository's pages. */
  readonly slug = input.required<string>();

  protected readonly name = computed(() => this.entry().repository?.name ?? '');

  protected readonly pages = outcomes('open-repository-pages', {
    uiBuilder: exit('projects/:slug/repositories/:repo/ui-builder'),
    contracts: exit('projects/:slug/repositories/:repo/contracts'),
    entities: exit('projects/:slug/repositories/:repo/entities'),
  });

  /** The repository's pages' exit params. */
  protected readonly params = computed(() => ({ slug: this.slug(), repo: this.name() }));

  /** The archetype, as a word: SERVICE reads "Service". */
  protected readonly archetype = computed(() => {
    const archetype = this.entry().repository?.archetype;
    return archetype ? archetype.charAt(0) + archetype.slice(1).toLowerCase() : '–';
  });

  /** Whether the repository declares itself a frontend, whose routes the UI builder shows. */
  protected readonly frontend = computed(() => {
    const archetype = this.entry().repository?.archetype;
    return archetype === 'FRONTEND' || archetype === 'APP';
  });

  /** Whether the repository declares itself a service, whose contracts and entities have pages. */
  protected readonly service = computed(() => this.entry().repository?.archetype === 'SERVICE');

  protected readonly backup = computed((): Backup => {
    const repository = this.entry().repository;
    if (!repository?.backupUrl) return { label: 'No twin', tone: 'neutral' };
    switch (repository.lastBackup?.outcome) {
      case undefined:
        return { label: 'Never', tone: 'neutral' };
      case 'SUCCEEDED':
        return { label: 'Succeeded', tone: 'ok' };
      case 'FAILED':
        return { label: 'Failed', tone: 'failed' };
      case 'UNREACHABLE':
        return { label: 'Unreachable', tone: 'failed' };
      case 'AUTH_REQUIRED':
        return { label: 'Auth needed', tone: 'failed' };
    }
  });
}
