import { isPlatformBrowser } from '@angular/common';
import { computed, inject, PLATFORM_ID } from '@angular/core';
import { loadState } from '$core/resources/load-state';
import type { LoadState } from '$ui/components/spinner/spinner';
import { SelectedProject } from './selected-project';

/**
 * The params of the open project's own read (`PROJECT_DETAIL`, `getProject` by its id) for a
 * project page's `qitsResource` (qits-2146), and how the page's spinner reads with it: the open
 * project's id once `SelectedProject`'s list holds it, in the browser only (the server render has
 * no session to send). Called in a page's injection context.
 */
export function openProjectDetail() {
  const selected = inject(SelectedProject);
  const browser = isPlatformBrowser(inject(PLATFORM_ID));
  const id = computed(() => (browser ? selected.project()?.id : undefined));
  return {
    /** `PROJECT_DETAIL`'s params: the open project's id, once known. */
    params: () => {
      const projectId = id();
      return projectId ? { path: { id: projectId } } : undefined;
    },
    /**
     * The page's spinner: the list's failure, or a slug it does not hold, is an error; then the
     * detail's own read.
     */
    state: (detail: { status(): string; hasValue(): boolean }) =>
      computed((): LoadState => {
        const list = selected.listState();
        if (list !== 'loaded') return list;
        if (!selected.project()) return 'error';
        return loadState(detail);
      }),
  };
}
