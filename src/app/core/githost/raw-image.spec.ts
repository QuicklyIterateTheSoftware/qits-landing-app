import {
  imageReads,
  imageSideOf,
  isImagePath,
  NO_IMAGE,
  rawImageMessage,
  type ImageChange,
} from './raw-image';

const REPO = '00000000-0000-4000-8000-000000000004';
const BASE = '5eab9635f653a85136ce4d8babd44edfa83cf1da';
const FOLD = 'bd6360a2c6b42a991c62e3418b7f6d4ac5d89f14';

describe('isImagePath', () => {
  it('takes png, jpg, jpeg, gif and webp, in any case', () => {
    for (const path of ['a.png', 'docs/b.JPG', 'c.jpeg', 'd/e.Gif', 'f.webp']) {
      expect(isImagePath(path)).toBe(true);
    }
  });

  it('leaves SVG, other files, bare names and dot files to the text diff', () => {
    for (const path of ['logo.svg', 'README.md', 'png', 'docs/png/readme', '.png', '', undefined]) {
      expect(isImagePath(path)).toBe(false);
    }
  });
});

describe('rawImageMessage', () => {
  it('says why a read gave no image', () => {
    expect(rawImageMessage({ reason: 'too-large', size: 17 * 1024 * 1024 })).toBe(
      'The image is too large to show (17 MiB).',
    );
    expect(rawImageMessage({ reason: 'too-large', size: 16.25 * 1024 * 1024 })).toBe(
      'The image is too large to show (16.3 MiB).',
    );
    expect(rawImageMessage({ reason: 'too-large' })).toBe('The image is too large to show.');
    expect(rawImageMessage({ reason: 'missing' })).toBe(
      'The image is not in the repository at this revision.',
    );
    expect(rawImageMessage({ reason: 'failed' })).toBe('The image could not be loaded.');
  });
});

describe('imageSideOf', () => {
  it('draws a read not started as loading, a loaded one as its bytes, a failure as words', () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    expect(imageSideOf(undefined)).toEqual({ status: 'loading' });
    expect(imageSideOf({ status: 'loading' })).toEqual({ status: 'loading' });
    expect(imageSideOf({ status: 'loaded', blob })).toEqual({ status: 'loaded', blob });
    expect(imageSideOf({ status: 'error', reason: 'failed' })).toEqual({
      status: 'error',
      message: 'The image could not be loaded.',
    });
  });
});

describe('imageReads', () => {
  const file = (change: Partial<ImageChange>): ImageChange => ({
    path: 'docs/shot.png',
    oldPath: undefined,
    changeType: 'MODIFIED',
    oldSha: 'dab97c3b6e97345f158d40c78e4857db8d019b59',
    newSha: '0f79179575bc37b34af3ad4aae0ff07ac39eb2af',
    ...change,
  });

  it('reads a modified image at both commits', () => {
    expect(imageReads(file({}), REPO, BASE, FOLD)).toEqual({
      before: { repoId: REPO, rev: BASE, path: 'docs/shot.png' },
      after: { repoId: REPO, rev: FOLD, path: 'docs/shot.png' },
    });
  });

  it('reads a renamed image where it came from before', () => {
    const reads = imageReads(
      file({ changeType: 'RENAMED', oldPath: 'old/shot.png' }),
      REPO,
      BASE,
      FOLD,
    );
    expect(reads.before?.path).toBe('old/shot.png');
    expect(reads.after?.path).toBe('docs/shot.png');
  });

  it('reads no before for an added image, and no after for a deleted one', () => {
    expect(imageReads(file({ changeType: 'ADDED', oldSha: null }), REPO, null, FOLD).before).toBe(
      null,
    );
    expect(imageReads(file({ changeType: 'DELETED', newSha: null }), REPO, BASE, FOLD).after).toBe(
      null,
    );
  });

  it('has nothing to read where no commit is known: a root commit has no parent', () => {
    expect(imageReads(file({}), REPO, null, FOLD).before).toBeNull();
    expect(NO_IMAGE).toEqual({ status: 'error', message: rawImageMessage({ reason: 'missing' }) });
  });
});
