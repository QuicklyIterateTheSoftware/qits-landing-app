import {
  currentPrivateOrigins,
  localNetworkFetch,
  setPrivateOrigins,
  type LocalNetworkRequestInit,
} from './local-network';

const PRIVATE = 'https://projects.qits.example.test';
const PUBLIC = 'https://events.qits.example.test';

/** The Local Network Access marking of calls to private apps (qits-2297). */
describe('localNetworkFetch', () => {
  let original: ReturnType<typeof vi.fn<typeof fetch>>;
  let wrapped: typeof fetch;

  beforeEach(() => {
    original = vi.fn<typeof fetch>(async () => new Response('{}'));
    wrapped = localNetworkFetch(original);
    setPrivateOrigins([PRIVATE]);
  });

  afterEach(() => setPrivateOrigins([]));

  it('marks a call to a private origin, from a string, keeping the init', async () => {
    const init: RequestInit = { method: 'POST', headers: { a: 'b' }, body: 'x' };
    await wrapped(`${PRIVATE}/projects/api/projects`, init);
    const expected: LocalNetworkRequestInit = { ...init, targetAddressSpace: 'local' };
    expect(original).toHaveBeenCalledExactlyOnceWith(`${PRIVATE}/projects/api/projects`, expected);
  });

  it('marks a call from a URL, with no init', async () => {
    const url = new URL(`${PRIVATE}/projects/api/projects`);
    await wrapped(url);
    expect(original).toHaveBeenCalledExactlyOnceWith(url, { targetAddressSpace: 'local' });
  });

  it('passes a Request on as it is, its method, headers and body kept', async () => {
    const request = new Request(`${PRIVATE}/projects/api/x`, {
      method: 'PUT',
      headers: { authorization: 'Bearer T' },
      body: 'payload',
    });
    await wrapped(request);
    const [input, init] = original.mock.calls[0];
    expect(input).toBe(request);
    expect(init).toEqual({ targetAddressSpace: 'local' });
    expect(request.method).toBe('PUT');
    expect(request.headers.get('authorization')).toBe('Bearer T');
    expect(await request.text()).toBe('payload');
  });

  it('passes a call to any other origin with exactly its own arguments', async () => {
    await wrapped(`${PUBLIC}/events/api/stream`);
    expect(original.mock.calls[0]).toEqual([`${PUBLIC}/events/api/stream`]);
    const init = { method: 'GET' };
    await wrapped(`${PUBLIC}/x`, init);
    expect(original.mock.calls[1][0]).toBe(`${PUBLIC}/x`);
    expect(original.mock.calls[1][1]).toBe(init);
  });

  it('reads a relative URL against the page, which is not private', async () => {
    await wrapped('/main-navigation');
    expect(original.mock.calls[0]).toEqual(['/main-navigation']);
    setPrivateOrigins([location.origin]);
    await wrapped('/main-navigation');
    expect(original.mock.calls[1]).toEqual(['/main-navigation', { targetAddressSpace: 'local' }]);
  });

  it('marks nothing until the origins are set, and follows each new set', async () => {
    setPrivateOrigins([]);
    await wrapped(`${PRIVATE}/a`);
    expect(original.mock.calls[0]).toEqual([`${PRIVATE}/a`]);
    setPrivateOrigins([PRIVATE]);
    expect(currentPrivateOrigins()).toEqual(new Set([PRIVATE]));
    await wrapped(`${PRIVATE}/a`);
    expect(original.mock.calls[1]).toEqual([`${PRIVATE}/a`, { targetAddressSpace: 'local' }]);
  });
});
