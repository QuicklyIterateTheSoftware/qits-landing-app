import { qitsOperation } from '@qits/angular';
import { installPlugin, listPlugins } from '../../api/workspace-daemon';
import { INSTALL_PLUGIN, LIST_PLUGINS } from './agent-plugins.consumes';
import { DAEMON_REFUSAL } from './agent-sign-in.consumes';

/**
 * The plugins on the shared agent home (epic qits-1230), read from a slot's daemon through
 * qits-workspaces' container proxy (`containerBase`, in the params), declared as operations
 * (qits-2145) the workspace page's plugins section reads through `qitsResource` and writes through
 * `qitsMutation`, in place of the former `AgentPluginsStore` (qits-2146). The store is the shared
 * credential volume's, so an install in one slot installs it in every one.
 * `agent-plugins.operations.pact.spec.ts` binds each.
 */

/** The installed set (`listPlugins`), each marketplace-qualified, and whether it is on. */
export const HOME_PLUGINS = qitsOperation({
  provider: 'qits-workspace-daemon',
  operationId: 'listPlugins',
  method: 'GET',
  call: listPlugins,
  consumes: LIST_PLUGINS,
});

/**
 * Install one by its bare id (`installPlugin`); its answer is the refreshed set, which replaces the
 * list without a read. A refusal says why in the daemon's words.
 */
export const PLUGIN_INSTALL = qitsOperation({
  provider: 'qits-workspace-daemon',
  operationId: 'installPlugin',
  method: 'POST',
  call: installPlugin,
  consumes: INSTALL_PLUGIN,
  errorConsumes: DAEMON_REFUSAL,
});
