import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { installPlugin, listPlugins } from '../../api/workspace-daemon';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { containerBase } from './container-proxy';
import { describeRefusal, refusalOf, sentence } from './agent-actions.store';
import { INSTALL_PLUGIN, LIST_PLUGINS, type InstalledPlugin } from './agent-plugins.consumes';
import { DAEMON_REFUSAL } from './agent-sign-in.consumes';

/** One slot's plugins, as the store left them. */
export interface SlotPlugins {
  readonly status: 'loading' | 'loaded' | 'error';
  /** The plugins on the shared agent home, marketplace-qualified. */
  readonly installed: readonly InstalledPlugin[];
  /** The bare id of the plugin being installed. */
  readonly pending: string | null;
  /** Why the last install failed, in the daemon's words where it gave any. */
  readonly problem: string | null;
}

interface PluginsState {
  /** By the slot's row id. */
  readonly slots: Readonly<Record<number, SlotPlugins>>;
}

const BLANK: SlotPlugins = { status: 'loading', installed: [], pending: null, problem: null };

/**
 * The plugins on the shared agent home (epic qits-1230), ported from qits-workspaces-frontend's
 * plugins section: read from a slot's daemon through qits-workspaces' container proxy. The store is
 * the shared credential volume's, so an install in one slot installs it in every one.
 *
 * - `load(rowId)`: the installed set (`listPlugins`), again on each call, keeping the last good
 *   answer.
 * - `install(rowId, pluginId)`: install one by its bare id (`installPlugin`); its answer is the
 *   refreshed set, which replaces the list without a read.
 *
 * Staleness (qits-1270): the Terminal tab reads the set again after `WorkspaceStarted` naming the
 * slot (a new daemon). An install from another slot or tab announces nothing on qits-events.
 */
export const AgentPluginsStore = signalStore(
  { providedIn: 'root' },
  withState<PluginsState>({ slots: {} }),
  withMethods((store) => {
    const origins = inject(PlatformOrigins);
    const base = (rowId: number) => containerBase(origins.api('workspaces'), rowId);
    const of = (rowId: number) => store.slots()[rowId] ?? BLANK;
    const update = (rowId: number, change: Partial<SlotPlugins>) =>
      patchState(store, { slots: { ...store.slots(), [rowId]: { ...of(rowId), ...change } } });

    return {
      async load(rowId: number): Promise<void> {
        if (!Number.isInteger(rowId) || rowId <= 0) return;
        if (!store.slots()[rowId]) update(rowId, {});
        const { data, error } = await consume(listPlugins({ baseUrl: base(rowId) }), LIST_PLUGINS);
        if (error !== undefined || !data) {
          if (of(rowId).status !== 'loaded') update(rowId, { status: 'error', installed: [] });
          return;
        }
        update(rowId, { status: 'loaded', installed: data.installed });
      },
      async install(rowId: number, pluginId: string): Promise<void> {
        if (rowId <= 0 || of(rowId).pending) return;
        update(rowId, { pending: pluginId, problem: null });
        const { data, error, response } = await consume(
          installPlugin({
            baseUrl: base(rowId),
            path: { pluginId },
            // An empty JSON object, as qits-workspace-daemon's recording sends (and its
            // microfrontend did); its OpenAPI document declares no body for the install.
            body: {} as never,
            headers: { 'Content-Type': 'application/json' },
          }),
          INSTALL_PLUGIN,
          DAEMON_REFUSAL,
        );
        if (error !== undefined || !data) {
          update(rowId, {
            pending: null,
            problem: sentence(
              `${pluginId} was not installed — ${describeRefusal(refusalOf(error, response))}`,
            ),
          });
          return;
        }
        update(rowId, { status: 'loaded', pending: null, installed: data.installed });
      },
      pluginsOf(rowId: number): SlotPlugins | undefined {
        return store.slots()[rowId];
      },
    };
  }),
);
