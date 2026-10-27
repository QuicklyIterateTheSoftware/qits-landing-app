import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, provideEnvironmentInitializer } from '@angular/core';
import { NavigationEnd, Router, type NavigationError } from '@angular/router';
import { filter } from 'rxjs';

/** The `sessionStorage` key holding the URL this tab last reloaded for a failed import. */
export const CHUNK_RELOAD_KEY = 'qits-chunk-reload';

/**
 * A lazy page's file did not load: Chromium "Failed to fetch dynamically imported module",
 * Firefox "error loading dynamically imported module", Safari "Importing a module script failed".
 */
const FAILED_IMPORT = /dynamically imported module|importing a module script failed/i;

/** Whether `error` is a dynamic import that failed. */
export function isFailedImport(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return FAILED_IMPORT.test(message);
}

function storage(document: Document): Storage | undefined {
  try {
    return document.defaultView?.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * The router's navigation error handler (`withNavigationErrorHandler`), the safety net of
 * qits-1686: when a lazy page's file failed to load (a release replaced it), loads the target URL
 * as a full page, once. `sessionStorage` remembers the URL, so a second failure at the same URL
 * stays an error instead of a reload loop. {@link provideChunkReloadReset} clears it after a navigation
 * that worked.
 */
export function reloadOnFailedImport(error: NavigationError): void {
  if (!isPlatformBrowser(inject(PLATFORM_ID)) || !isFailedImport(error.error)) return;
  const document = inject(DOCUMENT);
  const store = storage(document);
  if (!store) return;
  try {
    if (store.getItem(CHUNK_RELOAD_KEY) === error.url) return;
    store.setItem(CHUNK_RELOAD_KEY, error.url);
  } catch {
    return;
  }
  document.location.assign(error.url);
}

/** After a navigation that worked, a later failure may reload again: clears the remembered URL. */
export function provideChunkReloadReset() {
  return provideEnvironmentInitializer(() => {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const document = inject(DOCUMENT);
    inject(Router)
      .events.pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        try {
          storage(document)?.removeItem(CHUNK_RELOAD_KEY);
        } catch {
          // Storage blocked: nothing was stored either.
        }
      });
  });
}
