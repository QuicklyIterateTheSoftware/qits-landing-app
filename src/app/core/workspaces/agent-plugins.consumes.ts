import type { Consumed } from '@qits/angular';
import type { InstallPluginResponses, ListPluginsResponses } from '../../api/workspace-daemon';

/**
 * What `AgentPluginsStore` reads from qits-workspace-daemon's answers, through qits-workspaces'
 * container proxy (epic qits-1230). The store passes each list to `consume(...)`, so it cannot read
 * any other field, and its pact spec passes the same lists as `consumes`. To read another field,
 * add it here.
 */

/**
 * `AgentPluginsStore.load(workspaceRowId)`: the plugins on the shared agent home
 * (`listPlugins`), each marketplace-qualified, and whether it is switched on.
 */
export const LIST_PLUGINS = ['installed[].pluginId', 'installed[].enabled'] as const;

/** The installed set, cut to what the store reads. */
export type InstalledPlugins = Consumed<ListPluginsResponses[200], typeof LIST_PLUGINS>;

/** One installed plugin, cut to what the store reads. */
export type InstalledPlugin = InstalledPlugins['installed'][number];

/**
 * `AgentPluginsStore.install(workspaceRowId, pluginId)`: the installed set, refreshed
 * (`installPlugin` answers the listing's envelope, so no read follows).
 */
export const INSTALL_PLUGIN = LIST_PLUGINS;

/** The refreshed set, cut to what the store reads. */
export type RefreshedPlugins = Consumed<InstallPluginResponses[200], typeof INSTALL_PLUGIN>;
