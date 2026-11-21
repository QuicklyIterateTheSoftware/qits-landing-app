import { systemGoldenMasters } from '../../../testing/golden-masters';
import type { NodeImage } from './node-images.consumes';
import { imageShortId, inUse, totalBytes } from './node-images';

/** The recorded node's images: one, `qits-ci:3e501b6`, 325 MB, three containers using it. */
const recorded = () =>
  systemGoldenMasters.body<NodeImage[]>('a single-node swarm', 'listNodeImages');

describe('node images (qits-2353)', () => {
  it('shortens an id to docker’s 12 hex digits after sha256:', () => {
    expect(imageShortId(recorded()[0].id)).toBe('14beaf669b73');
    expect(
      imageShortId('sha256:4c17a0f1e2d3c4b5a6978877665544332211ffeeddccbbaa0099887766554433'),
    ).toBe('4c17a0f1e2d3');
    // An id without the prefix is shortened as it is.
    expect(imageShortId('4c17a0f1e2d3c4b5')).toBe('4c17a0f1e2d3');
    expect(imageShortId(undefined)).toBe('');
  });

  it('reads docker’s container count as a number, and nothing else', () => {
    expect(inUse(recorded()[0].containers)).toBe(3);
    expect(inUse('0')).toBe(0);
    expect(inUse('12')).toBe(12);
    expect(inUse('N/A')).toBeUndefined();
    expect(inUse('')).toBeUndefined();
    expect(inUse(undefined)).toBeUndefined();
    expect(inUse('-1')).toBeUndefined();
  });

  it('adds up the images’ sizes', () => {
    expect(totalBytes(recorded())).toBe(325_000_000);
    expect(totalBytes([])).toBe(0);
    expect(totalBytes([{ sizeBytes: 1_000 }, { sizeBytes: 2_500 }, {}])).toBe(3_500);
  });
});
