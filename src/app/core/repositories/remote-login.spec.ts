import { goldenMaster } from '../../../testing/golden-masters';
import { needsBackupSignIn, remoteLoginSocketUrl, signInRepositoryId } from './remote-login';
import type { RepositoryEntry, WrapperView } from './repositories.consumes';

/** Every backup state, the wrapper without a backup remote, billing-daemon `AUTH_REQUIRED`. */
const ANSWER = goldenMaster<{ entries: RepositoryEntry[]; wrapper: WrapperView }>(
  'a project with repositories in components',
  'listProjectRepositories',
);
const AUTH_REQUIRED = ANSWER.entries.find(
  (entry) => entry.repository?.lastBackup?.outcome === 'AUTH_REQUIRED',
)!;

describe('remoteLoginSocketUrl', () => {
  it('is the repository’s remote-login socket on qits-projects’ origin', () => {
    expect(remoteLoginSocketUrl('https://projects.qits.example', 'r 1')).toBe(
      'wss://projects.qits.example/projects/api/repositories/r%201/remote-login',
    );
    expect(remoteLoginSocketUrl('http://localhost:8080/', 'r1')).toBe(
      'ws://localhost:8080/projects/api/repositories/r1/remote-login',
    );
  });
});

describe('needsBackupSignIn', () => {
  it('is true when any last backup is AUTH_REQUIRED, and false otherwise', () => {
    expect(needsBackupSignIn(ANSWER.entries)).toBe(true);
    expect(needsBackupSignIn(ANSWER.entries.filter((entry) => entry !== AUTH_REQUIRED))).toBe(
      false,
    );
  });
});

describe('signInRepositoryId', () => {
  it('signs in through the wrapper when it has a backup remote', () => {
    // The recording's wrapper has no backup remote; this one is given the frontend's.
    const wrapperId = ANSWER.wrapper.repositoryId;
    const entries = ANSWER.entries.map((entry) =>
      entry.repository?.id === wrapperId
        ? { ...entry, repository: { ...entry.repository, backupUrl: 'https://forge/w.git' } }
        : entry,
    );
    expect(signInRepositoryId(entries, wrapperId)).toBe(wrapperId);
  });

  it('falls back to a repository whose backup asked for a sign-in', () => {
    expect(signInRepositoryId(ANSWER.entries, ANSWER.wrapper.repositoryId)).toBe(
      AUTH_REQUIRED.repository?.id,
    );
  });

  it('is null when no repository has a backup remote', () => {
    const bare = ANSWER.entries.filter((entry) => !entry.repository?.backupUrl);
    expect(signInRepositoryId(bare, ANSWER.wrapper.repositoryId)).toBeNull();
  });
});
