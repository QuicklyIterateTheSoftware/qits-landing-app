import { idpClient, IdpTokens, NO_AUTH, type IdpClient } from './idp-token';

const CLIENT: IdpClient = {
  tokenUrl: 'https://idp.qits.example.com/idp/token',
  clientId: 'dev-qits-landing',
  clientSecret: 's3cr+t&=',
};

/** A token answer as qits-idp's `IdpTokenController` writes it. */
function answer(token: string, expiresIn = 3600) {
  return new Response(
    JSON.stringify({ access_token: token, token_type: 'Bearer', expires_in: expiresIn }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('idpClient', () => {
  it('reads what qits-deployments injects for idp:client', () => {
    expect(
      idpClient({
        QITS_RESOURCE_IDP_URL: 'https://idp.qits.example.com/idp/',
        QITS_RESOURCE_IDP_CLIENT_ID: 'dev-qits-landing',
        QITS_RESOURCE_IDP_CLIENT_SECRET: 'secret',
      }),
    ).toEqual({
      tokenUrl: 'https://idp.qits.example.com/idp/token',
      clientId: 'dev-qits-landing',
      clientSecret: 'secret',
    });
  });

  it('is null unless all three are there', () => {
    expect(idpClient({})).toBeNull();
    expect(
      idpClient({
        QITS_RESOURCE_IDP_URL: 'https://idp.qits.example.com/idp',
        QITS_RESOURCE_IDP_CLIENT_ID: 'dev-qits-landing',
        QITS_RESOURCE_IDP_CLIENT_SECRET: ' ',
      }),
    ).toBeNull();
  });
});

describe('IdpTokens', () => {
  let now: number;
  let fetchFn: ReturnType<typeof vi.fn>;
  let log: ReturnType<typeof vi.fn>;
  let tokens: IdpTokens;

  beforeEach(() => {
    now = 1_000_000;
    fetchFn = vi.fn(async () => answer('t1'));
    log = vi.fn();
    tokens = new IdpTokens(CLIENT, {
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => now,
      log: log as unknown as (level: 'info' | 'warn', message: string) => void,
      skewMs: 30_000,
      retryMs: 15_000,
    });
  });

  it('asks the token endpoint for a client_credentials token, the client in the form', async () => {
    expect(await tokens.token()).toBe('t1');
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://idp.qits.example.com/idp/token');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      grant_type: 'client_credentials',
      client_id: 'dev-qits-landing',
      client_secret: 's3cr+t&=',
    });
  });

  it('keeps the token until shortly before it expires, then takes another', async () => {
    await tokens.token();
    now += 3600_000 - 30_001;
    expect(await tokens.token()).toBe('t1');
    expect(fetchFn).toHaveBeenCalledOnce();

    fetchFn.mockResolvedValueOnce(answer('t2'));
    now += 2;
    expect(await tokens.token()).toBe('t2');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('refreshes a short-lived token at half its lifetime, not on every export', async () => {
    fetchFn.mockResolvedValueOnce(answer('short', 20));
    await tokens.token();
    now += 9_000;
    expect(await tokens.token()).toBe('short');
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('shares one request between concurrent callers', async () => {
    const [a, b] = await Promise.all([tokens.token(), tokens.token()]);
    expect([a, b]).toEqual(['t1', 't1']);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('gives no token on a refusal, logs once, and waits before asking again', async () => {
    fetchFn.mockImplementation(
      async () => new Response('{"error":"invalid_client"}', { status: 401 }),
    );
    expect(await tokens.token()).toBeUndefined();
    expect(await tokens.token()).toBeUndefined();
    expect(fetchFn).toHaveBeenCalledOnce();

    now += 15_000;
    expect(await tokens.token()).toBeUndefined();
    expect(fetchFn).toHaveBeenCalledTimes(2);

    expect(log).toHaveBeenCalledOnce();
    const [level, message] = log.mock.calls[0] as [string, string];
    expect(level).toBe('warn');
    expect(message).toContain('401');
    expect(message).not.toContain(CLIENT.clientSecret);
  });

  it('never throws: a network error or a malformed answer is no token', async () => {
    fetchFn.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await tokens.token()).toBeUndefined();
    now += 15_000;
    fetchFn.mockResolvedValueOnce(new Response('not json', { status: 200 }));
    expect(await tokens.token()).toBeUndefined();
    now += 15_000;
    fetchFn.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    expect(await tokens.token()).toBeUndefined();
    expect(log).toHaveBeenCalledOnce();
  });

  it('logs once per change of state: down, back, down again', async () => {
    fetchFn.mockRejectedValueOnce(new TypeError('fetch failed'));
    await tokens.token();
    now += 15_000;
    await tokens.token();
    now += 3600_000;
    fetchFn.mockRejectedValueOnce(new TypeError('fetch failed'));
    await tokens.token();
    expect(log.mock.calls.map(([level]) => level)).toEqual(['warn', 'info', 'warn']);
  });

  it('still sends a token past its refresh point while the idp is down, until it expires', async () => {
    await tokens.token();
    fetchFn.mockRejectedValue(new TypeError('fetch failed'));
    now += 3600_000 - 10_000;
    expect(await tokens.token()).toBe('t1');
    now += 10_000;
    expect(await tokens.token()).toBeUndefined();
  });

  it('headers: the bearer when there is a token, nothing when there is none', async () => {
    expect(await tokens.headers()).toEqual({ Authorization: 'Bearer t1' });
    const down = new IdpTokens(CLIENT, {
      fetchFn: (async () => {
        throw new Error('down');
      }) as unknown as typeof fetch,
      log: () => undefined,
    });
    expect(await down.headers()).toEqual({});
    expect(await NO_AUTH()).toEqual({});
  });

  it('names the token endpoint’s origin, and none for an address that is not a URL', () => {
    expect(tokens.origin).toBe('https://idp.qits.example.com');
    expect(new IdpTokens({ ...CLIENT, tokenUrl: 'not a url/token' }).origin).toBe('');
  });
});
