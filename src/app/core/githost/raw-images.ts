import { inject, Injectable, Injector, signal } from '@angular/core';
import { QitsApiError } from '@qits/angular';
import { ResourceFamily } from '$core/resources/resource-family';
import {
  imageSideOf,
  NO_IMAGE,
  type ImageRead,
  type ImageSide,
  type RawImage,
  type RawImageFailure,
} from './raw-image';
import { RAW_FILE, rawImageParams } from './raw-images.operations';

/** The key a raw read is held under: the repository, the commit and the path at it. */
export const rawImageKey = (repoId: string, sha: string, path: string) =>
  `${repoId}@${sha}#${path}`;

/**
 * Images at a revision, from qits-githost's raw read (`RAW_FILE`, qits-734): the Changes tab and a
 * commit's changeset show a changed image as the image, before and after. The bytes come through
 * the generated client as a Blob, so they carry the bearer (`qitsBearerInterceptor`) like every
 * other call; a bare `<img src>` cannot send it.
 *
 * A root service holding one `qitsResource` per image (a `ResourceFamily`, qits-2146; it was
 * `RawImagesStore`): each read is a fact about a commit, so it is read once per key and kept, and
 * read again when asked again after it failed. `image(...)` starts the read if it is not held and
 * answers its key; `read(key)` gives what is held, and `side(read)` the same as `ui-image-diff`
 * draws it (a side no commit holds says so). A failure says why: past the size cap (`too-large`,
 * with the blob's size), not at that revision (`missing`, a 404), or anything else (`failed`).
 *
 * Staleness (qits-1270): no event can change an answer: each is keyed by a full commit sha, and a
 * re-fold is a new sha, so a new key.
 */
@Injectable({ providedIn: 'root' })
export class RawImages {
  private readonly reads = new ResourceFamily(RAW_FILE, inject(Injector));

  /** A 413's blob size, by key, once its body is read; `null` when it names none. */
  private readonly sizes = signal<ReadonlyMap<string, number | null>>(new Map());
  private readonly sizing = new Set<string>();

  /** Starts reading `path` at commit `sha` of `repoId`, unless held; answers the read's key. */
  image(repoId: string, sha: string, path: string): string {
    const key = rawImageKey(repoId, sha, path);
    this.reads.read(key, rawImageParams(repoId, sha, path), true);
    return key;
  }

  /** What is held under `key`; undefined before `image` asked for it. */
  read(key: string): RawImage | undefined {
    const read = this.reads.get(key);
    if (!read) return undefined;
    if (read.status() === 'error') return { status: 'error', ...this.failure(key, read.error()) };
    const blob = read.hasValue() ? read.value() : undefined;
    return blob instanceof Blob ? { status: 'loaded', blob } : { status: 'loading' };
  }

  /** What is held for `read`, as the side it draws; a side with nothing to read says so. */
  side(read: ImageRead | null): ImageSide {
    return read ? imageSideOf(this.read(rawImageKey(read.repoId, read.rev, read.path))) : NO_IMAGE;
  }

  /** Why a read failed, from its status; a 413 names the blob's size in its body. */
  private failure(key: string, error: unknown): RawImageFailure {
    const status = error instanceof QitsApiError ? error.status : undefined;
    if (status === 404) return { reason: 'missing' };
    if (status !== 413) return { reason: 'failed' };
    const size = this.sizes().get(key);
    if (size === undefined && !this.sizing.has(key)) {
      this.sizing.add(key);
      void sizeOf((error as QitsApiError).error).then((found) =>
        this.sizes.update((sizes) => new Map(sizes).set(key, found ?? null)),
      );
    }
    return { reason: 'too-large', size: size ?? undefined };
  }
}

/**
 * The `size` of a 413's body, `{"error":"too-large","size":N}`. The call asks for a Blob, so the
 * error body arrives as one too, and the operation's typing cannot reach into it; no recording
 * holds a 413, so the pact binds no refusal either.
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
