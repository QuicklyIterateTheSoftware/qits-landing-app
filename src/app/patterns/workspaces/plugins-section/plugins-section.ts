import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { QitsEntity, QitsEntityList, QitsField, qitsMutation, qitsResource } from '@qits/angular';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { loadState } from '$core/resources/load-state';
import type { InstalledPlugins } from '$core/workspaces/agent-plugins.consumes';
import { HOME_PLUGINS, PLUGIN_INSTALL } from '$core/workspaces/agent-plugins.operations';
import { containerBase } from '$core/workspaces/container-proxy';
import { installPluginParams, pluginRows, type PluginRow } from '$core/workspaces/plugin-catalogue';
import { describeRefusal, runRefusal, sentence } from '$core/workspaces/refusals';
import { concerns, WORKSPACE_REFRESH_DEBOUNCE_MS } from '$core/workspaces/workspace-events';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Chip } from '$ui/components/chip/chip';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The installed set before it is read: none. */
const NOTHING_INSTALLED: InstalledPlugins = { installed: [] };

/**
 * The plugins section (epic qits-1230), ported from qits-workspaces-frontend: what the shared agent
 * home has (its own `qitsResource` over `HOME_PLUGINS`, qits-2146, from the slot's daemon through
 * qits-workspaces' container proxy), the curated plugins with Install on those not installed yet,
 * then anything installed that the catalogue does not name. The home is the shared credential
 * volume's, so an install here turns the plugin on in every workspace; the copy says so. An install
 * (`qitsMutation(PLUGIN_INSTALL)`) answers the refreshed list, which replaces the read's value
 * without a read. Why one failed is said in the daemon's words. (The microfrontend floated the
 * plugins a checkout's detected frameworks would use to the top; this section lists the catalogue
 * in its own order.)
 *
 * It marks what it shows (qits-2141): the list names the read as its source, each row is a plugin
 * (`qitsEntity`, by `pluginId`; `pluginRows` joins the catalogue to the installed set), its name
 * and summary its fields, its chips and Install derived from whether it is installed and on.
 *
 * Staleness (qits-1270): `WorkspaceStarted` naming the slot (`workspaceId`: a new container, a new
 * daemon) → the installed set (the resource's `refreshOn`). Not announced: an install from another
 * page or slot. In the browser only.
 */
@Component({
  selector: 'app-plugins-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, Chip, QitsEntity, QitsEntityList, QitsField, Spinner],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-2 text-sm" aria-labelledby="agent-plugins">
      <h3 id="agent-plugins" class="m-0 text-sm font-semibold text-fg">Plugins</h3>
      <ui-spinner [state]="state()" class="min-h-12">
        <ul class="m-0 flex list-none flex-col p-0" [qitsEntityList]="plugins">
          @for (row of rows(); track row.pluginId) {
            <li
              class="flex items-center gap-3 border-t border-line-subtle py-1.5 first:border-t-0"
              [qitsEntity]="row"
              entityKey="pluginId"
            >
              <div class="flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span class="font-semibold text-fg" [fieldOf]="row" qitsField="name">{{
                  row.name
                }}</span>
                @if (row.installed && row.enabled) {
                  <ui-chip
                    label="installed"
                    tone="ok"
                    [fieldOf]="row"
                    [qitsField]="{ derived: ['installed', 'enabled'] }"
                  />
                } @else if (row.installed) {
                  <ui-chip
                    label="installed, switched off"
                    [fieldOf]="row"
                    [qitsField]="{ derived: ['installed', 'enabled'] }"
                  />
                }
                <span class="text-fg-muted" [fieldOf]="row" qitsField="summary">{{
                  row.summary
                }}</span>
              </div>
              @if (!row.installed) {
                <ui-action-button
                  [action]="install(row)"
                  [fieldOf]="row"
                  [qitsField]="{ derived: ['pluginId', 'installed'] }"
                />
              }
            </li>
          }
        </ul>
        <p class="m-0 mt-1 text-xs text-fg-muted">
          The plugin store is the shared agent home, so installing one here turns it on in every
          workspace on this platform. There is no uninstall here.
        </p>
      </ui-spinner>
      @if (problem(); as problem) {
        <p class="m-0 text-danger" role="alert">
          {{ problem }} The agent has to be signed in and its container running for an install.
        </p>
      }
    </section>
  `,
})
export class PluginsSection {
  private readonly origins = inject(PlatformOrigins);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly installing = qitsMutation(PLUGIN_INSTALL);

  /** The slot whose daemon reads and writes the shared agent home. */
  readonly workspaceRowId = input.required<number>();

  /** The slot daemon's base, through the container proxy; none for no slot. */
  private readonly base = computed(() => {
    const rowId = this.workspaceRowId();
    return Number.isInteger(rowId) && rowId > 0
      ? containerBase(this.origins.api('workspaces'), rowId)
      : undefined;
  });

  /** The installed set, in the browser only; again once the slot's container started anew. */
  protected readonly plugins = qitsResource(
    HOME_PLUGINS,
    () => {
      const baseUrl = this.base();
      return this.browser && baseUrl ? { baseUrl } : undefined;
    },
    {
      refreshOn: {
        names: ['WorkspaceStarted'],
        when: (event) => concerns(event, { workspaceId: String(this.workspaceRowId()) }),
        debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
      },
    },
  );

  /** The installed set; none until it answered. */
  protected readonly answer = computed(
    () => (this.plugins.hasValue() ? this.plugins.value() : undefined) ?? NOTHING_INSTALLED,
  );

  protected readonly state = computed((): LoadState => loadState(this.plugins));

  protected readonly rows = computed(() => pluginRows(this.answer().installed));

  /** The bare id of the plugin being installed. */
  protected readonly pending = signal<string | null>(null);
  /** Why the last install failed, in the daemon's words where it gave any. */
  protected readonly problem = signal<string | null>(null);

  protected install(row: PluginRow): Action {
    const pending = this.pending();
    return {
      label: pending === row.pluginId ? 'Installing…' : 'Install',
      variant: 'muted',
      disabled: !!pending,
      callback: () => void this.installOne(row.pluginId),
    };
  }

  private async installOne(pluginId: string): Promise<void> {
    const baseUrl = this.base();
    if (!baseUrl || this.pending()) return;
    this.pending.set(pluginId);
    this.problem.set(null);
    try {
      const refreshed = await this.installing.run(installPluginParams(baseUrl, pluginId));
      if (!refreshed) throw new Error('no answer');
      this.plugins.set(refreshed);
    } catch (error) {
      this.problem.set(
        sentence(`${pluginId} was not installed — ${describeRefusal(runRefusal(error))}`),
      );
    } finally {
      this.pending.set(null);
    }
  }
}
