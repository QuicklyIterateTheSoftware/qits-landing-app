import {
  findItem,
  markOf,
  parseItem,
  readDataMarks,
  recordFor,
  valueAt,
  type Responses,
} from './data-marks';
import { asManifest, type Freeze, type FreezeRecord } from './routes-manifest';

const AGENTS = 'qits-workspaces-service#listAgents';
const WORKSPACES = 'qits-workspaces-service#listWorkspaces';

/** A page shaped like the Agents route's marked shot (qits-2143), its joins and nested items. */
const HTML = `
  <ul data-qits-source="${AGENTS}">
    <li data-qits-item="agentId=a6">
      <a href="/x" data-qits-derived="entityId agentId"><span class="inner">open</span></a>
      <span data-qits-field="entityTitle">Fix it</span>
      <p data-qits-item="id=w1" data-qits-field="label">waits on qits-1</p>
      <div data-qits-source="qits-projects-service#getWork" data-qits-item="id=7">
        <span data-qits-field="title" entitykey="x" qitsfield="nope">Joined</span>
      </div>
    </li>
  </ul>
  <p class="copy">Design copy</p>
  <span data-qits-item="agentId=a9" data-qits-field="state">running</span>
`;

function doc(): Document {
  const d = document.implementation.createHTMLDocument('freeze');
  d.body.innerHTML = HTML;
  return d;
}

describe('markOf (qits-2144)', () => {
  it('takes the source and item from an ancestor, the field from the element itself', () => {
    const field = doc().querySelector('[data-qits-field="entityTitle"]')!;
    expect(markOf(field)).toEqual({
      source: AGENTS,
      item: 'agentId=a6',
      field: 'entityTitle',
      derived: [],
      outerItem: null,
      joinedFrom: null,
    });
  });

  it('splits derived paths, and never inherits a field or derived paths', () => {
    const d = doc();
    expect(markOf(d.querySelector('a')!).derived).toEqual(['entityId', 'agentId']);
    const inner = markOf(d.querySelector('.inner')!);
    expect(inner).toMatchObject({ source: AGENTS, item: 'agentId=a6', field: null, derived: [] });
  });

  it('takes the element’s own source and item (closest includes itself), naming a join', () => {
    const joined = markOf(doc().querySelector('[data-qits-field="title"]')!);
    expect(joined).toEqual({
      source: 'qits-projects-service#getWork',
      item: 'id=7',
      field: 'title',
      derived: [],
      outerItem: 'agentId=a6',
      joinedFrom: AGENTS,
    });
  });

  it('names the item around a nested item', () => {
    const wait = markOf(doc().querySelector('p[data-qits-item]')!);
    expect(wait).toMatchObject({ item: 'id=w1', field: 'label', outerItem: 'agentId=a6' });
  });

  it('skips an ancestor marking the same record: a component root inside the page row', () => {
    const d = document.implementation.createHTMLDocument('freeze');
    d.body.innerHTML = `
      <ul data-qits-source="${AGENTS}">
        <li data-qits-item="agentId=a6">
          <div data-qits-item="agentId=a6">
            <span data-qits-field="entityTitle">Fix it</span>
            <p data-qits-item="id=w1" data-qits-field="label">waits</p>
          </div>
        </li>
      </ul>`;
    expect(markOf(d.querySelector('[data-qits-field="entityTitle"]')!).outerItem).toBeNull();
    expect(markOf(d.querySelector('p')!).outerItem).toBe('agentId=a6');
  });

  it('resolves no source and no item where none is marked, ignoring leaked attributes', () => {
    const d = doc();
    expect(markOf(d.querySelector('.copy')!)).toEqual({
      source: null,
      item: null,
      field: null,
      derived: [],
      outerItem: null,
      joinedFrom: null,
    });
    expect(markOf(d.querySelector('[data-qits-item="agentId=a9"]')!)).toMatchObject({
      source: null,
      item: 'agentId=a9',
      field: 'state',
    });
  });
});

describe('parseItem (qits-2144)', () => {
  it('splits at the first =', () => {
    expect(parseItem('agentId=a6')).toEqual({ key: 'agentId', value: 'a6' });
    expect(parseItem('ref=a=b')).toEqual({ key: 'ref', value: 'a=b' });
    expect(parseItem('id=')).toEqual({ key: 'id', value: '' });
    expect(parseItem('nothing')).toBeNull();
  });
});

describe('findItem (qits-2144)', () => {
  const BODY = {
    entries: [
      { workspace: { id: 'w0', agents: [] } },
      {
        workspace: { id: 'w1' },
        agents: [{ agentId: 'a6', waits: [{ id: 1, label: 'outer' }] }],
      },
    ],
    waits: [{ id: 1, label: 'top' }],
  };

  it('searches a wrapped body depth first', () => {
    expect(findItem(BODY, 'id', 'w1')).toEqual({ id: 'w1' });
    expect(findItem(BODY, 'agentId', 'a6')).toMatchObject({ agentId: 'a6' });
    expect(findItem(BODY, 'agentId', 'a7')).toBeUndefined();
  });

  it('compares as strings, so a numeric key matches', () => {
    expect(findItem([{ id: 7, name: 'seven' }], 'id', '7')).toEqual({ id: 7, name: 'seven' });
    expect(findItem([{ id: { nested: 1 } }], 'id', '[object Object]')).toBeUndefined();
  });

  it('searches a nested item inside its outer item first, then the whole body', () => {
    const outer = { key: 'agentId', value: 'a6' };
    expect(findItem({ ...BODY, entries: BODY.entries.reverse() }, 'id', '1', outer)).toEqual({
      id: 1,
      label: 'outer',
    });
    expect(findItem(BODY, 'id', '1', { key: 'agentId', value: 'gone' })).toMatchObject({
      label: 'outer',
    });
    expect(findItem({ waits: BODY.waits }, 'id', '1', outer)).toEqual({ id: 1, label: 'top' });
  });

  it('ignores an outer item naming the item itself, so a nested object sharing the key loses', () => {
    const body = { agents: [{ agentId: 'a6', entityTitle: 'Fix', waits: [{ agentId: 'a6' }] }] };
    const self = { key: 'agentId', value: 'a6' };
    expect(findItem(body, 'agentId', 'a6', self)).toMatchObject({ entityTitle: 'Fix' });
  });
});

describe('valueAt (qits-2144)', () => {
  const ITEM = { title: 'Fix', attention: { code: 'ASK', waitId: null }, tags: ['a'], n: 2 };

  it('reads a dot path, compact JSON for a list or an object', () => {
    expect(valueAt(ITEM, 'title')).toEqual({ found: true, text: 'Fix' });
    expect(valueAt(ITEM, 'attention.code')).toEqual({ found: true, text: 'ASK' });
    expect(valueAt(ITEM, 'attention.waitId')).toEqual({ found: true, text: 'null' });
    expect(valueAt(ITEM, 'n')).toEqual({ found: true, text: '2' });
    expect(valueAt(ITEM, 'tags')).toEqual({ found: true, text: '["a"]' });
    expect(valueAt(ITEM, 'attention')).toEqual({
      found: true,
      text: '{"code":"ASK","waitId":null}',
    });
  });

  it('says a path the answer lacks is not in it', () => {
    expect(valueAt(ITEM, 'waits')).toEqual({ found: false, text: 'not in the recorded answer' });
    expect(valueAt(ITEM, 'title.length')).toEqual({
      found: false,
      text: 'not in the recorded answer',
    });
  });
});

describe('recordFor (qits-2144)', () => {
  const ATTENTION: FreezeRecord = {
    provider: 'qits-workspaces-service',
    state: 'a project with agents needing attention',
    operationId: 'listAgents',
  };
  const SLOTS: FreezeRecord = {
    ...ATTENTION,
    state: 'a project with workspace slots hosting agents',
  };
  const LIST: FreezeRecord = { ...SLOTS, operationId: 'listWorkspaces' };
  const freeze: Freeze = {
    file: 'x.html',
    name: 'x',
    route: 'projects/:slug/agents',
    records: [ATTENTION, SLOTS, LIST, LIST],
  };
  const BODIES = new Map<FreezeRecord, unknown>([
    [ATTENTION, { agents: [{ agentId: 'a6' }] }],
    [SLOTS, { agents: [{ agentId: 'w-agent' }] }],
    [LIST, { entries: [{ workspace: { id: 'slot-1' } }] }],
  ]);
  const responses: Responses = (record) => BODIES.get(record);

  it('takes the one record its source names', () => {
    expect(recordFor(freeze, { source: WORKSPACES, item: 'id=nope' }, () => undefined)).toEqual({
      kind: 'marked',
      record: LIST,
    });
  });

  it('tells two states of one source apart by the item', () => {
    expect(recordFor(freeze, { source: AGENTS, item: 'agentId=a6' }, responses)).toEqual({
      kind: 'marked',
      record: ATTENTION,
    });
    expect(recordFor(freeze, { source: AGENTS, item: 'agentId=w-agent' }, responses)).toEqual({
      kind: 'marked',
      record: SLOTS,
    });
    expect(recordFor(freeze, { source: AGENTS, item: 'agentId=a6' }, () => undefined)).toEqual({
      kind: 'loading',
    });
  });

  it('finds a mark without a source by its item, in every record', () => {
    expect(recordFor(freeze, { source: null, item: 'id=slot-1' }, responses)).toEqual({
      kind: 'byItem',
      record: LIST,
    });
    expect(recordFor(freeze, { source: null, item: 'id=gone' }, responses)).toEqual({
      kind: 'none',
    });
    expect(recordFor(freeze, { source: null, item: null }, responses)).toEqual({ kind: 'none' });
  });

  it('shows every candidate as ambiguous when the item does not tell them apart', () => {
    const both = { ...BODIES.get(ATTENTION)!, more: [{ agentId: 'w-agent' }] };
    const ambiguous = { kind: 'ambiguous', records: [ATTENTION, SLOTS] };
    expect(
      recordFor(freeze, { source: AGENTS, item: 'agentId=w-agent' }, (r) =>
        r === ATTENTION ? both : BODIES.get(r),
      ),
    ).toEqual(ambiguous);
    expect(recordFor(freeze, { source: AGENTS, item: 'agentId=gone' }, responses)).toEqual(
      ambiguous,
    );
    expect(recordFor(freeze, { source: AGENTS, item: null }, responses)).toEqual(ambiguous);
    expect(recordFor(freeze, { source: 'x#y', item: null }, responses)).toEqual({
      kind: 'ambiguous',
      records: [],
    });
  });
});

describe('readDataMarks and the manifest’s dataMarks (qits-2144)', () => {
  const MARK = { source: AGENTS, item: 'agentId=a6', field: 'entityTitle', derived: [] };

  it('keeps each well-formed mark’s four fields, and drops a malformed one', () => {
    expect(
      readDataMarks([
        { ...MARK, extra: 1 },
        { ...MARK, derived: 'state' },
        { ...MARK, field: 3 },
        'mark',
        { source: null, item: null, field: null, derived: ['a', 'b'] },
      ]),
    ).toEqual([MARK, { source: null, item: null, field: null, derived: ['a', 'b'] }]);
    expect(readDataMarks(undefined)).toEqual([]);
    expect(readDataMarks({})).toEqual([]);
  });

  it('reads a freeze’s dataMarks through asManifest, absent staying absent', () => {
    const freeze = { file: 'a.html', name: 'a', route: null, records: [] };
    const manifest = asManifest({
      routes: [],
      byRoute: {},
      freezes: [
        { ...freeze, dataMarks: [MARK, { bad: true }] },
        { ...freeze, file: 'b.html', dataMarks: 'nope' },
        { ...freeze, file: 'c.html' },
      ],
    })!;
    expect(manifest.freezes.map((f) => f.dataMarks)).toEqual([[MARK], [], undefined]);
    expect('dataMarks' in manifest.freezes[2]).toBe(false);
  });
});
