import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DestroyRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EVENT_SOURCE, REOPEN_DEBOUNCE_MS, type EventSourceLike } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { client as projectsClient } from '../../api/projects/client.gen';
import { goldenMaster } from '../../../testing/golden-masters';
import type { RepositoryEntry, WrapperView } from './repositories.consumes';
import { RepositoriesStore } from './repositories.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The recorded project's id: every state seeds its project under this frozen id. */
const ID = '00000000-0000-4000-8000-000000000001';
const STATE = 'a project with repositories in components';

/** A stand-in for the browser's `EventSource`, so a spec can push frames. */
class FakeSource implements EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 1;
  close(): void {
    this.readyState = 2;
  }
  push(name: string, payload: object): void {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({ name, payload: JSON.stringify(payload) }),
      }),
    );
  }
}

/** A `DestroyRef` a spec destroys by hand. */
class ManualDestroy implements DestroyRef {
  private readonly callbacks = new Set<() => void>();
  destroyed = false;
  onDestroy(callback: () => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  destroy(): void {
    this.destroyed = true;
    this.callbacks.forEach((callback) => callback());
  }
}

describe('RepositoriesStore', () => {
  let http: HttpTestingController;
  let sources: FakeSource[];

  beforeEach(() => {
    sources = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideTestPlatformOrigins({}),
        {
          provide: EVENT_SOURCE,
          useValue: () => {
            const source = new FakeSource();
            sources.push(source);
            return source;
          },
        },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests nothing until asked to load', async () => {
    TestBed.inject(RepositoriesStore);
    await settle();
    http.expectNone(`/projects/api/projects/${ID}/repositories`);
  });

  it('loads a project’s repositories and its wrapper view once', async () => {
    const store = TestBed.inject(RepositoriesStore);
    const answer = goldenMaster(STATE, 'listProjectRepositories');
    const done = store.load(ID);
    expect(store.byProject()[ID]?.status).toBe('loading');
    await settle();
    http.expectOne(`/projects/api/projects/${ID}/repositories`).flush(answer);
    await done;
    expect(store.byProject()[ID]).toEqual({
      status: 'loaded',
      entries: answer.entries,
      wrapper: answer.wrapper,
    });
    await store.load(ID);
    http.expectNone(`/projects/api/projects/${ID}/repositories`);
  });

  it('reports a failed answer, and fetches again on the next ask', async () => {
    const store = TestBed.inject(RepositoriesStore);
    const done = store.load(ID);
    await settle();
    http
      .expectOne(`/projects/api/projects/${ID}/repositories`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await done;
    expect(store.byProject()[ID]).toEqual({ status: 'error', entries: [] });
    void store.load(ID);
    await settle();
    http.expectOne(`/projects/api/projects/${ID}/repositories`);
  });

  it('refreshes a loaded project without a loading in between', async () => {
    const store = TestBed.inject(RepositoriesStore);
    const answer = goldenMaster(STATE, 'listProjectRepositories');
    const loaded = store.load(ID);
    await settle();
    http.expectOne(`/projects/api/projects/${ID}/repositories`).flush(answer);
    await loaded;
    const refreshed = store.refresh(ID);
    expect(store.byProject()[ID]?.status).toBe('loaded');
    await settle();
    // The same recording again: what changed between the two reads is the server's business.
    http.expectOne(`/projects/api/projects/${ID}/repositories`).flush(answer);
    await refreshed;
    expect(store.byProject()[ID]?.entries).toEqual(answer.entries);
  });

  it('keeps a loaded answer when a refresh fails', async () => {
    const store = TestBed.inject(RepositoriesStore);
    const answer = goldenMaster(STATE, 'listProjectRepositories');
    const loaded = store.load(ID);
    await settle();
    http.expectOne(`/projects/api/projects/${ID}/repositories`).flush(answer);
    await loaded;
    const refreshed = store.refresh(ID);
    await settle();
    http
      .expectOne(`/projects/api/projects/${ID}/repositories`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await refreshed;
    expect(store.byProject()[ID]?.status).toBe('loaded');
  });

  describe('follow', () => {
    const answer = goldenMaster(STATE, 'listProjectRepositories') as {
      readonly entries?: readonly RepositoryEntry[];
      readonly wrapper?: WrapperView;
    };
    const wrapperId = answer.wrapper!.repositoryId!;
    const mainBranch =
      answer.entries!.find((entry) => entry.repository?.id === wrapperId)?.repository?.mainBranch ||
      'main';
    const other = answer.entries!.find((entry) => entry.repository?.id !== wrapperId)!.repository!
      .id!;

    /** The store, `ID` loaded and followed; the stream opened. */
    async function followed(destroy = new ManualDestroy()) {
      const store = TestBed.inject(RepositoriesStore);
      const loaded = store.load(ID);
      await settle();
      http.expectOne(`/projects/api/projects/${ID}/repositories`).flush(answer);
      await loaded;
      vi.useFakeTimers();
      store.follow(() => ID, destroy);
      vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
      return { store, source: sources.at(-1)!, destroy };
    }

    afterEach(() => vi.useRealTimers());

    /** Lets the debounce pass, then the generated client's awaits. */
    async function after() {
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
      vi.useRealTimers();
      await settle();
    }

    it('reads the list again after a commit to the wrapper’s main branch, once per burst', async () => {
      const { store, source } = await followed();
      expect(source.readyState).toBe(1);
      const commit = { projectId: ID, repoId: wrapperId, branch: mainBranch, sha: 'abc' };
      source.push('SCMPublishCommit', commit);
      source.push('SCMPublishCommit', { ...commit, sha: 'def' });
      await after();
      http.expectOne(`/projects/api/projects/${ID}/repositories`).flush(answer);
      await settle();
      expect(store.byProject()[ID]?.status).toBe('loaded');
    });

    it('ignores a commit to another branch of the wrapper, or to another repository', async () => {
      const { source } = await followed();
      source.push('SCMPublishCommit', { projectId: ID, repoId: wrapperId, branch: 'ticket/x' });
      source.push('SCMPublishCommit', { projectId: ID, repoId: other, branch: mainBranch });
      await after();
      http.expectNone(`/projects/api/projects/${ID}/repositories`);
    });

    it('stops when its page is destroyed', async () => {
      const { source, destroy } = await followed();
      destroy.destroy();
      source.push('SCMPublishCommit', { projectId: ID, repoId: wrapperId, branch: mainBranch });
      await after();
      http.expectNone(`/projects/api/projects/${ID}/repositories`);
    });
  });
});
