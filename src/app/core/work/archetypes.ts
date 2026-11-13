import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { qitsResource } from '@qits/angular';
import type { ArchetypeEntry } from './archetypes.consumes';
import { WORK_ARCHETYPES } from './archetypes.operations';

/**
 * qits-projects' archetype registry (qits-2146, in place of `ArchetypesStore`): one root
 * `qitsResource` over `WORK_ARCHETYPES` (`listWorkArchetypes`), one request for the whole app, read
 * in the browser once something wants it (`want()`: the work item page). Which moves each archetype
 * has out of each status, and what a dispatch press runs from it: the work item page builds its
 * Agent and Status actions from it (`work-actions.ts`), so the app holds no status model of its own.
 * `of(archetype)`: that archetype's entry, or undefined until the registry is in (or when it does
 * not name the archetype). A failed read is read again on the next `want()`.
 *
 * Staleness (qits-1270): none. The registry is qits-projects' static configuration (its archetype
 * definitions, changed only by a release of the service), so no event can change it.
 */
@Injectable({ providedIn: 'root' })
export class Archetypes {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly wanted = signal(false);

  readonly resource = qitsResource(WORK_ARCHETYPES, () =>
    this.browser && this.wanted() ? {} : undefined,
  );

  private readonly byArchetype = computed(
    () =>
      new Map<string, ArchetypeEntry>(
        (this.resource.hasValue() ? (this.resource.value()?.archetypes ?? []) : []).flatMap((e) =>
          e.archetype ? [[e.archetype, e] as const] : [],
        ),
      ),
  );

  /** Reads the registry, once; again after a failed read. */
  want(): void {
    if (this.wanted() && this.resource.status() === 'error') this.resource.reload();
    this.wanted.set(true);
  }

  of(archetype: string | undefined): ArchetypeEntry | undefined {
    return archetype ? this.byArchetype().get(archetype) : undefined;
  }
}
