import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { listArchetypes } from '../../api/projects';
import { LIST_ARCHETYPES, type ArchetypeEntry } from './archetypes.consumes';

interface ArchetypesState {
  readonly status: 'idle' | 'loading' | 'loaded' | 'error';
  /** Each archetype's entry, by archetype (EPIC, TICKET, FEATURE, TASK, CAMPAIGN). */
  readonly byArchetype: Readonly<Record<string, ArchetypeEntry>>;
}

/**
 * qits-projects' archetype registry (`listArchetypes`), one request for the whole app: which
 * moves each archetype has out of each status, and what a dispatch press runs from it. The work
 * item page builds its Agent and Status actions from it (`work-actions.ts`), so the app holds no
 * status model of its own.
 *
 * - `load()` fetches once, and again after an error. Nothing calls it on its own: the work item
 *   page does, in the browser.
 * - `of(archetype)`: that archetype's entry, or undefined until the registry is in (or when it
 *   does not name the archetype).
 */
export const ArchetypesStore = signalStore(
  { providedIn: 'root' },
  withState<ArchetypesState>({ status: 'idle', byArchetype: {} }),
  withMethods((store) => ({
    async load(): Promise<void> {
      if (store.status() !== 'idle' && store.status() !== 'error') return;
      patchState(store, { status: 'loading' });
      const { data, error } = await consume(listArchetypes(), LIST_ARCHETYPES);
      if (error !== undefined || !data) {
        patchState(store, { status: 'error' });
        return;
      }
      const byArchetype: Record<string, ArchetypeEntry> = {};
      for (const entry of data.archetypes ?? []) {
        if (entry.archetype) byArchetype[entry.archetype] = entry;
      }
      patchState(store, { status: 'loaded', byArchetype });
    },
    of(archetype: string | undefined): ArchetypeEntry | undefined {
      return archetype ? store.byArchetype()[archetype] : undefined;
    },
  })),
);
