/**
 * Pure rules for showing a changed image (qits-734): which paths are images, which sides of a
 * change there are, where each side is read from, and what a failed read says.
 */

/** The extensions qits-githost's raw read serves inline as an image. SVG is text, and keeps its diff. */
const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/** Whether `path` names an image: its lower-cased extension is png, jpg, jpeg, gif or webp. */
export function isImagePath(path: string | undefined): boolean {
  const name = path?.slice(path.lastIndexOf('/') + 1) ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** Why a raw read gave no image: past qits-githost's size cap, not at that revision, or anything else. */
export type RawImageFailure =
  | { readonly reason: 'too-large'; readonly size?: number }
  | { readonly reason: 'missing' }
  | { readonly reason: 'failed' };

/** One raw read, as the store holds it. */
export type RawImage =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly blob: Blob }
  | ({ readonly status: 'error' } & RawImageFailure);

const MIB = 1024 * 1024;

/** A failed read, as a sentence: `The image is too large to show (17 MiB).` */
export function rawImageMessage(failure: RawImageFailure): string {
  switch (failure.reason) {
    case 'too-large':
      return failure.size === undefined
        ? 'The image is too large to show.'
        : `The image is too large to show (${Number((failure.size / MIB).toFixed(1))} MiB).`;
    case 'missing':
      return 'The image is not in the repository at this revision.';
    default:
      return 'The image could not be loaded.';
  }
}

/** One side of an image change, as `ui-image-diff` draws it. */
export type ImageSide =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly blob: Blob }
  | { readonly status: 'error'; readonly message: string };

/** A read as the side it draws; a read not started yet is loading. */
export function imageSideOf(read: RawImage | undefined): ImageSide {
  if (!read || read.status === 'loading') return { status: 'loading' };
  if (read.status === 'loaded') return read;
  return { status: 'error', message: rawImageMessage(read) };
}

/** A side no revision holds: there is nothing to read. */
export const NO_IMAGE: ImageSide = {
  status: 'error',
  message: rawImageMessage({ reason: 'missing' }),
};

/** A changed file, as far as its image sides go. */
export interface ImageChange {
  readonly path?: string;
  readonly oldPath?: string;
  readonly changeType?: string;
  /** The blob before the change; null when there is none (an added file). */
  readonly oldSha?: string | null;
  /** The blob after the change; null when there is none (a deleted file). */
  readonly newSha?: string | null;
}

/** Where one side is read from: the repository, a full commit sha, and the path at that commit. */
export interface ImageRead {
  readonly repoId: string;
  readonly rev: string;
  readonly path: string;
}

/**
 * Where each side of `file` is read from, given the repository and the commits before and after
 * the change; null for a side the change does not have (an added file has no before, a deleted one
 * no after) or no commit holds (`before` is null for a repository that never released, or a root
 * commit). The before side reads `oldPath`, so a renamed image shows where it came from.
 */
export function imageReads(
  file: ImageChange,
  repoId: string | undefined,
  before: string | null | undefined,
  after: string | null | undefined,
): { readonly before: ImageRead | null; readonly after: ImageRead | null } {
  const at = (rev: string | null | undefined, path: string | undefined): ImageRead | null =>
    repoId && rev && path ? { repoId, rev, path } : null;
  return {
    before: hasBefore(file) ? at(before, file.oldPath ?? file.path) : null,
    after: hasAfter(file) ? at(after, file.path) : null,
  };
}

/** Whether the change has a before side: not added, and its old blob is not a recorded null. */
export const hasBefore = (file: ImageChange) => file.changeType !== 'ADDED' && file.oldSha !== null;

/** Whether the change has an after side: not deleted, and its new blob is not a recorded null. */
export const hasAfter = (file: ImageChange) =>
  file.changeType !== 'DELETED' && file.newSha !== null;
