import { DOCUMENT } from '@angular/common';
import { inject, InjectionToken } from '@angular/core';

/**
 * The name Chrome's Local Network Access permission is queried by (qits-2297): the split name
 * `local-network` (with `loopback-network` beside it), as Chrome's guide says. Never the legacy
 * `local-network-access`, which crashes the renderer of an older Chrome when queried.
 */
export const LOCAL_NETWORK_PERMISSION = 'local-network';

/**
 * The page's Local Network Access permission (`navigator.permissions.query`), or null where the
 * browser has none: no Permissions API (the server, an old browser), or a name it does not know
 * (every browser but Chrome), which rejects the query. Never throws.
 */
export async function queryLocalNetwork(
  navigator: Navigator | undefined = globalThis.navigator,
): Promise<PermissionStatus | null> {
  const permissions = navigator?.permissions;
  if (!permissions) return null;
  try {
    // The DOM types do not know the name yet.
    const descriptor = { name: LOCAL_NETWORK_PERMISSION } as unknown as PermissionDescriptor;
    return await permissions.query(descriptor);
  } catch {
    return null;
  }
}

/**
 * Loads the page again (`location.reload()`), as a token so a spec can see it without reloading
 * (qits-2297: the shell's notice reloads once the permission is granted).
 */
export const PAGE_RELOAD = new InjectionToken<() => void>('PAGE_RELOAD', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.location.reload();
  },
});
