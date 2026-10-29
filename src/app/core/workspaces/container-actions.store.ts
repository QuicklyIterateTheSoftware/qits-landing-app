import { signalStore, withMethods } from '@ngrx/signals';
import { consume } from '@qits/angular';
import {
  ensureWorkspaceContainer,
  recreateWorkspaceContainer,
  stopWorkspaceContainer,
} from '../../api/workspaces';
import { REFUSAL, REFUSAL_MESSAGE } from './agent-actions.consumes';
import { refusalOf, type ActionOutcome } from './agent-actions.store';
import {
  ENSURE_CONTAINER,
  RECREATE_CONTAINER,
  STOP_CONTAINER,
  type EnsuredContainer,
  type RecreatedContainer,
  type StoppedContainer,
} from './container-actions.consumes';

/**
 * A slot's container verbs on qits-workspaces (epic qits-1230), on the workspace page only (epic
 * qits-1667: the agent page has the agent's own verbs, `AgentActionsStore`). Each answers an
 * `ActionOutcome`; the page reads the slot again afterwards.
 *
 * - `ensureContainer(id)`, `stopContainer(id)`, `recreateContainer(id)`:
 *   `…/workspaces/{id}/ensure-container|stop-container|recreate-container`. A slot whose lease
 *   qits-system cannot be asked about is refused (409 `TARGET_UNAVAILABLE`); a recreate needs a
 *   working tree the service can prove clean (400 otherwise). A stop and a recreate name the agents
 *   they affected (`affectedAgentIds`).
 *
 * Staleness (qits-1270): holds no platform state; nothing to follow.
 */
export const ContainerActionsStore = signalStore(
  { providedIn: 'root' },
  withMethods(() => ({
    async ensureContainer(id: number): Promise<ActionOutcome<EnsuredContainer>> {
      const { data, error, response } = await consume(
        ensureWorkspaceContainer({ path: { id } }),
        ENSURE_CONTAINER,
        REFUSAL,
      );
      if (error !== undefined || !data) return refusalOf(error, response);
      return { ok: true, value: data };
    },
    async stopContainer(id: number): Promise<ActionOutcome<StoppedContainer>> {
      const { data, error, response } = await consume(
        stopWorkspaceContainer({ path: { id } }),
        STOP_CONTAINER,
        REFUSAL,
      );
      if (error !== undefined || !data) return refusalOf(error, response);
      return { ok: true, value: data };
    },
    async recreateContainer(id: number): Promise<ActionOutcome<RecreatedContainer>> {
      const { data, error, response } = await consume(
        recreateWorkspaceContainer({ path: { id } }),
        RECREATE_CONTAINER,
        REFUSAL_MESSAGE,
      );
      if (error !== undefined || !data) return refusalOf(error, response);
      return { ok: true, value: data };
    },
  })),
);
