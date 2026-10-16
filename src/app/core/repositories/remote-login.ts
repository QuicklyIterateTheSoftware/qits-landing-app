import type { RepositoryEntry } from './repositories.consumes';

/**
 * qits-projects' sign-in terminal for a repository's backup remote, `WS
 * /projects/api/repositories/{repoId}/remote-login`, on qits-projects' origin
 * (`wss://projects.<domain>/…`; `ws:` when that origin is `http:`). Opening it spawns the
 * interactive `git push` that fills the platform's shared credential store, or re-attaches to the
 * live one and replays its scrollback; closing only detaches. The wire is `TerminalSocket`'s.
 */
export function remoteLoginSocketUrl(origin: string, repoId: string): string {
  const base = origin.replace(/\/+$/, '').replace(/^http(s?):/, 'ws$1:');
  return `${base}/projects/api/repositories/${encodeURIComponent(repoId)}/remote-login`;
}

/** Whether any repository's last backup was refused for want of credentials. */
export function needsBackupSignIn(entries: readonly RepositoryEntry[]): boolean {
  return entries.some((entry) => entry.repository?.lastBackup?.outcome === 'AUTH_REQUIRED');
}

/**
 * The repository the sign-in pushes through, or null when none can.
 *
 * The credential store is shared, so what a sign-in authenticates is the host, not the repository:
 * one sign-in clears every repository's `AUTH_REQUIRED`. The project repository (the wrapper) goes
 * first, as in qits-projects-frontend, being the one repository every project has. The server
 * refuses a repository without a backup remote, so a wrapper without one gives way to the first
 * repository whose backup asked for a sign-in, then to any with a backup remote.
 */
export function signInRepositoryId(
  entries: readonly RepositoryEntry[],
  wrapperId: string | undefined,
): string | null {
  const twinned = entries.filter((entry) => entry.repository?.backupUrl);
  const pick =
    twinned.find((entry) => entry.repository?.id === wrapperId) ??
    twinned.find((entry) => entry.repository?.lastBackup?.outcome === 'AUTH_REQUIRED') ??
    twinned[0];
  return pick?.repository?.id ?? null;
}
