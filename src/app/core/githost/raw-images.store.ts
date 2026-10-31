import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { getRaw } from '../../api/githost';
import { GET_RAW } from './raw-images.consumes';
import {
  imageSideOf,
  NO_IMAGE,
  type ImageRead,
  type ImageSide,
  type RawImage,
  type RawImageFailure,
} from './raw-image';

/** The key a raw read is held under: the repository, the commit and the path at it. */
export const rawImageKey = (repoId: string, sha: string, path: string) =>
  `${repoId}@${sha}#${path}`;

/**
 * Asks Angular's `HttpRequest` for the body as a Blob. The generated options do not name
 * `responseType`, but the client hands every option to the request's init, which reads it.
 */
const AS_BLOB = { responseType: 'blob' } as const;

interface RawImagesState {
  /** Every read, by `rawImageKey`. */
  readonly reads: Readonly<Record<string, RawImage>>;
}

/**
 * Images at a revision, from qits-githost's raw read (`GET /githost/api/repositories/{repoId}/raw`,
 * qits-734): the Changes tab and a commit's changeset show a changed image as the image, before and
 * after. The bytes come through the generated client as a Blob, so they carry the session cookie
 * (deployed) or the dev bearer (`ng serve`) like every other call; a bare `<img src>` would carry
 * neither under `ng serve`.
 *
 * Each read is a fact about a commit, so it is read once per key and kept; a read that failed is
 * read again when asked again. `image(...)` starts the read if it is not held and answers its key;
 * `read(key)` gives what is held, and `side(read)` the same as `ui-image-diff` draws it (a side no
 * commit holds says so). A failure says why: past the size cap (`too-large`, with the
 * blob's size), not at that revision (`missing`, a 404), or anything else (`failed`).
 *
 * Staleness (qits-1270): no event can change an answer: each is keyed by a full commit sha, and a
 * re-fold is a new sha, so a new key.
 */
export const RawImagesStore = signalStore(
  { providedIn: 'root' },
  withState<RawImagesState>({ reads: {} }),
  withMethods((store) => {
    function set(key: string, value: RawImage): void {
      patchState(store, { reads: { ...store.reads(), [key]: value } });
    }

    async function fetchImage(key: string, repoId: string, sha: string, path: string) {
      const { data, error, response } = await consume(
        getRaw({ path: { repoId }, query: { rev: sha, path }, ...AS_BLOB }),
        GET_RAW,
      );
      if (error === undefined && data instanceof Blob) {
        set(key, { status: 'loaded', blob: data });
        return;
      }
      set(key, { status: 'error', ...(await failureOf(response?.status, error)) });
    }

    return {
      read(key: string): RawImage | undefined {
        return store.reads()[key];
      },
      /** What is held for `read`, as the side it draws; a side with nothing to read says so. */
      side(read: ImageRead | null): ImageSide {
        return read
          ? imageSideOf(store.reads()[rawImageKey(read.repoId, read.rev, read.path)])
          : NO_IMAGE;
      },
      /** Starts reading `path` at commit `sha` of `repoId`, unless held; answers the read's key. */
      image(repoId: string, sha: string, path: string): string {
        const key = rawImageKey(repoId, sha, path);
        const current = store.reads()[key];
        if (!current || current.status === 'error') {
          set(key, { status: 'loading' });
          void fetchImage(key, repoId, sha, path);
        }
        return key;
      },
    };
  }),
);

/** Why a read failed, from its status; a 413 names the blob's size in its body. */
async function failureOf(status: number | undefined, error: unknown): Promise<RawImageFailure> {
  if (status === 404) return { reason: 'missing' };
  if (status === 413) return { reason: 'too-large', size: await sizeOf(error) };
  return { reason: 'failed' };
}

/**
 * The `size` of a 413's body, `{"error":"too-large","size":N}`. The call asks for a Blob, so the
 * error body arrives as one too, and `consume`'s typing cannot reach into it; no recording holds a
 * 413, so the pact binds no refusal either.
 */
async function sizeOf(error: unknown): Promise<number | undefined> {
  try {
    const body: unknown = error instanceof Blob ? JSON.parse(await error.text()) : error;
    const size = (body as { size?: unknown } | null)?.size;
    return typeof size === 'number' ? size : undefined;
  } catch {
    return undefined;
  }
}
