import {
  chainCaption,
  DOWN_DEPTH_CAP,
  DOWN_NODE_CAP,
  UP_HOP_CAP,
  walkChain,
  type ChainEvent,
  type ChainReader,
} from './event-chain';

/** An event `id` caused by `parentId`, at `at` (seconds into the day). */
const ev = (id: string, parentId?: string, at = 0): ChainEvent => ({
  id,
  name: 'BuildStatusChanged',
  parentId,
  occurredAt: `2026-01-01T00:00:${String(at).padStart(2, '0')}Z`,
});

/** A reader over `events`, counting its requests; `fail` ids reject, `gone` ids are 404s. */
function readerOf(
  events: readonly ChainEvent[],
  { fail = [], gone = [] }: { fail?: string[]; gone?: string[] } = {},
) {
  const calls: string[] = [];
  const reader: ChainReader = {
    async event(id) {
      calls.push(`get ${id}`);
      if (fail.includes(id)) throw new Error('500');
      if (gone.includes(id)) return null;
      return events.find((e) => e.id === id) ?? null;
    },
    async children(id) {
      calls.push(`children ${id}`);
      if (fail.includes(id)) throw new Error('500');
      return events.filter((e) => e.parentId === id);
    },
  };
  return { reader, calls };
}

/** The drawn rows as `<depth>:<kind>[:<id>][*]`, `*` marking the current event. */
const drawn = (rows: Awaited<ReturnType<typeof walkChain>>['rows']) =>
  rows.map((row) =>
    row.kind === 'event'
      ? `${row.depth}:${row.event.id}${row.current ? '*' : ''}`
      : row.kind === 'loop'
        ? `${row.depth}:loop:${row.id}`
        : `${row.depth}:bound`,
  );

describe('walkChain', () => {
  it('walks up to the root, then down from it, newest sibling first', async () => {
    const events = [
      ev('a'),
      ev('b', 'a'),
      ev('c', 'b', 1),
      ev('d', 'b', 1),
      ev('e', 'b', 0),
      ev('f', 'c'),
    ];
    const { reader, calls } = readerOf(events);
    const chain = await walkChain(events[1], reader);
    expect(chain.start).toEqual({ kind: 'root' });
    // c and d share an instant: the id breaks the tie, descending.
    expect(drawn(chain.rows)).toEqual(['0:a', '1:b*', '2:d', '2:c', '3:f', '2:e']);
    expect(chain.capped).toBe(false);
    // One hop up; a, b, then d, c, e, then f expanded.
    expect(calls.filter((c) => c.startsWith('get'))).toEqual(['get a']);
    expect(chain.requests).toBe(1 + 6);
    expect(chainCaption(chain)).toBe('6 events · 8 requests');
  });

  it('starts at the event itself when it has no cause, and costs one request for a leaf', async () => {
    const { reader } = readerOf([ev('a')]);
    const chain = await walkChain(ev('a'), reader);
    expect(drawn(chain.rows)).toEqual(['0:a*']);
    expect(chain.requests).toBe(1);
    expect(chainCaption(chain)).toBe('1 event · 2 requests');
  });

  it('reads a cause that is a 404 as the start, not an error', async () => {
    const { reader } = readerOf([ev('b', 'gone'), ev('c', 'b')], { gone: ['gone'] });
    const chain = await walkChain(ev('b', 'gone'), reader);
    expect(chain.start).toEqual({ kind: 'dangling', parentId: 'gone' });
    expect(drawn(chain.rows)).toEqual(['0:b*', '1:c']);
  });

  it('stops walking up at a cycle and says so', async () => {
    const events = [ev('a', 'b'), ev('b', 'a')];
    const { reader } = readerOf(events);
    const chain = await walkChain(events[0], reader);
    expect(chain.start).toEqual({ kind: 'cycle', parentId: 'a' });
    // Down from b: a is its child, then a's child b is already drawn: a loop.
    expect(drawn(chain.rows)).toEqual(['0:b', '1:a*', '2:loop:b']);
  });

  it(`stops walking up after ${UP_HOP_CAP} hops`, async () => {
    const events = Array.from({ length: UP_HOP_CAP + 5 }, (_, i) =>
      ev(`n${i}`, i === 0 ? undefined : `n${i - 1}`),
    );
    const last = events[events.length - 1];
    const { reader, calls } = readerOf(events);
    const chain = await walkChain(last, reader);
    expect(chain.start.kind).toBe('capped');
    expect(calls.filter((c) => c.startsWith('get'))).toHaveLength(UP_HOP_CAP);
  });

  it(`draws the depth cap below ${DOWN_DEPTH_CAP} levels`, async () => {
    const events = Array.from({ length: DOWN_DEPTH_CAP + 3 }, (_, i) =>
      ev(`n${i}`, i === 0 ? undefined : `n${i - 1}`),
    );
    const { reader } = readerOf(events);
    const chain = await walkChain(events[0], reader);
    const rows = drawn(chain.rows);
    expect(rows).toHaveLength(DOWN_DEPTH_CAP + 2);
    expect(rows.at(-1)).toBe(`${DOWN_DEPTH_CAP + 1}:bound`);
  });

  it(`stops at ${DOWN_NODE_CAP} events and says the walk was capped`, async () => {
    const events = [
      ev('root'),
      ...Array.from({ length: DOWN_NODE_CAP + 10 }, (_, i) => ev(`c${i}`, 'root')),
    ];
    const { reader } = readerOf(events);
    const chain = await walkChain(events[0], reader);
    expect(chain.capped).toBe(true);
    expect(chain.rows.filter((row) => row.kind === 'event')).toHaveLength(DOWN_NODE_CAP);
  });

  it('fails the whole walk when a read fails', async () => {
    const { reader } = readerOf([ev('a'), ev('b', 'a')], { fail: ['b'] });
    await expect(walkChain(ev('b', 'a'), reader)).rejects.toThrow('500');
    const up = readerOf([ev('b', 'a')], { fail: ['a'] });
    await expect(walkChain(ev('b', 'a'), up.reader)).rejects.toThrow('500');
  });
});
