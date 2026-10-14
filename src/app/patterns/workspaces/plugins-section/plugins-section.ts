import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AgentPluginsStore } from '$core/workspaces/agent-plugins.store';
import { pluginRows, type PluginRow } from '$core/workspaces/plugin-catalogue';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Chip } from '$ui/components/chip/chip';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The plugins section (epic qits-1230), ported from qits-workspaces-frontend: what the shared agent
 * home has (`AgentPluginsStore`, from the slot's daemon), the curated plugins with Install on those
 * not installed yet, then anything installed that the catalogue does not name. The home is the
 * shared credential volume's, so an install here turns the plugin on in every workspace; the copy
 * says so. An install's answer is the refreshed list. Why one failed is said in the daemon's words.
 * (The microfrontend floated the plugins a checkout's detected frameworks would use to the top;
 * this section lists the catalogue in its own order.)
 */
@Component({
  selector: 'app-plugins-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, Chip, Spinner],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-2 text-sm" aria-labelledby="agent-plugins">
      <h3 id="agent-plugins" class="m-0 text-sm font-semibold text-charcoal-brown-900">Plugins</h3>
      <ui-spinner [state]="state()" class="min-h-12">
        <ul class="m-0 flex list-none flex-col p-0">
          @for (row of rows(); track row.pluginId) {
            <li
              class="flex items-center gap-3 border-t border-charcoal-brown-100 py-1.5 first:border-t-0"
            >
              <div class="flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span class="font-semibold text-charcoal-brown-900">{{ row.name }}</span>
                @if (row.installed && row.enabled) {
                  <ui-chip label="installed" tone="ok" />
                } @else if (row.installed) {
                  <ui-chip label="installed, switched off" />
                }
                <span class="text-charcoal-brown-600">{{ row.summary }}</span>
              </div>
              @if (!row.installed) {
                <ui-action-button [action]="install(row)" />
              }
            </li>
          }
        </ul>
        <p class="m-0 mt-1 text-xs text-charcoal-brown-600">
          The plugin store is the shared agent home, so installing one here turns it on in every
          workspace on this platform. There is no uninstall here.
        </p>
      </ui-spinner>
      @if (plugins()?.problem; as problem) {
        <p class="m-0 text-cinnabar-700" role="alert">
          {{ problem }} The agent has to be signed in and its container running for an install.
        </p>
      }
    </section>
  `,
})
export class PluginsSection {
  private readonly store = inject(AgentPluginsStore);

  /** The slot whose daemon reads and writes the shared agent home. */
  readonly workspaceRowId = input.required<number>();

  protected readonly plugins = computed(() => this.store.pluginsOf(this.workspaceRowId()));

  protected readonly state = computed((): LoadState => this.plugins()?.status ?? 'loading');

  protected readonly rows = computed(() => pluginRows(this.plugins()?.installed ?? []));

  protected install(row: PluginRow): Action {
    const pending = this.plugins()?.pending;
    return {
      label: pending === row.pluginId ? 'Installing…' : 'Install',
      variant: 'muted',
      disabled: !!pending,
      callback: () => void this.store.install(this.workspaceRowId(), row.pluginId),
    };
  }
}
