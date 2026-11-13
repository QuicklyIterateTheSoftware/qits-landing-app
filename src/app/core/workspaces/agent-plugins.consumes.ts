import type { Consumed } from '@qits/angular';
import type { InstallPluginResponses, ListPluginsResponses } from '../../api/workspace-daemon';

/**
 * What the operations in `agent-plugins.operations.ts` read from qits-workspace-daemon's answers,
 * through qits-workspaces' container proxy (epic qits-1230). Each operation declares its list as
 * its `consumes`, so a page cannot read any other field, and its pact spec binds the same lists. To
 * read another field, add it here.
 */

/**
 * `HOME_PLUGINS`: the plugins on the shared agent home
 * (`listPlugins`), each marketplace-qualified, and whether it is switched on.
 */
export const LIST_PLUGINS = ['installed[].pluginId', 'installed[].enabled'] as const;

/** The installed set, cut to what the page reads. */
export type InstalledPlugins = Consumed<ListPluginsResponses[200], typeof LIST_PLUGINS>;

/** One installed plugin, cut to what the page reads. */
export type InstalledPlugin = InstalledPlugins['installed'][number];

/**
 * `PLUGIN_INSTALL`: the installed set, refreshed
 * (`installPlugin` answers the listing's envelope, so no read follows).
 */
export const INSTALL_PLUGIN = LIST_PLUGINS;

/** The refreshed set, cut to what the page reads. */
export type RefreshedPlugins = Consumed<InstallPluginResponses[200], typeof INSTALL_PLUGIN>;
