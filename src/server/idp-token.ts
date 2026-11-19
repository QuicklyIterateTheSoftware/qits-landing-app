import type { Env } from './otel-config';

/**
 * The bearer the server's telemetry exports carry (qits-2360): a `client_credentials` token of this
 * application's own qits-idp service client.
 *
 * WHY. The landing is private (`exposure: private`), so its container sits on qits-private only and
 * exports to qits-observability through the edge, `https://observability.qits.<domain>`, which
 * refuses an anonymous POST. The private Java services do the same with their `qits` oidc client
 * (qits-telemetry-core's header supplier); this is that client for a node server.
 *
 * THE CLIENT. `resources: idp:client` in `.config/qits/deployments.yml` makes qits-deployments
 * provision it and inject `QITS_RESOURCE_IDP_URL` (`https://idp.qits.<domain>/idp`, the idp's edge
 * host), `QITS_RESOURCE_IDP_CLIENT_ID` and `QITS_RESOURCE_IDP_CLIENT_SECRET`. The token endpoint is
 * `<url>/token` (qits-idp's `IdpTokenController`, under `quarkus.rest.path=/idp`): a form POST with
 * `grant_type=client_credentials`, the client authenticated in the form (`client_secret_post`).
 *
 * THE CACHE. One token at a time, taken again `skewMs` before its `expires_in` runs out, as the
 * Java services' `refresh-token-time-skew=PT30S` does: a resource server refuses at `exp`, so the
 * last seconds of a token are not worth sending. Concurrent exports share one request.
 *
 * FAILURE NEVER STOPS AN EXPORT, AND NEVER THROWS. Without a token the export goes out without the
 * header (the edge refuses it, and the console output stays the fallback); the next attempt waits
 * `retryMs`, so a down idp is not asked on every batch. It logs once per change of state, never per
 * attempt: a log record is itself exported, so logging every failure would feed itself.
 */

/** A service client's credentials and where to exchange them. */
export interface IdpClient {
  /** `<QITS_RESOURCE_IDP_URL>/token`. */
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

/** The headers an export carries: `Authorization` when there is a token, nothing otherwise. */
export type AuthHeaders = () => Promise<Record<string, string>>;

/** No client: every export goes out as it did before qits-2360. */
export const NO_AUTH: AuthHeaders = async () => ({});

/** The client the deployer injected, or `null` when any of the three values is missing. */
export function idpClient(env: Env): IdpClient | null {
  const url = env['QITS_RESOURCE_IDP_URL']?.trim().replace(/\/+$/, '');
  const clientId = env['QITS_RESOURCE_IDP_CLIENT_ID']?.trim();
  const clientSecret = env['QITS_RESOURCE_IDP_CLIENT_SECRET']?.trim();
  if (!url || !clientId || !clientSecret) return null;
  return { tokenUrl: `${url}/token`, clientId, clientSecret };
}

export interface IdpTokensOptions {
  readonly fetchFn?: typeof fetch;
  /** Milliseconds since the epoch. */
  readonly now?: () => number;
  /** Where the state changes are told; never given the secret or the token. */
  readonly log?: (level: 'info' | 'warn', message: string) => void;
  /** How long before its expiry a token is taken again. */
  readonly skewMs?: number;
  /** How long after a failure the next attempt waits. */
  readonly retryMs?: number;
  /** How long one token request may take. */
  readonly timeoutMs?: number;
}

/** A token's lifetime when the answer names none; the idp always does (one hour). */
const DEFAULT_LIFETIME_S = 300;

export class IdpTokens {
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly log: (level: 'info' | 'warn', message: string) => void;
  private readonly skewMs: number;
  private readonly retryMs: number;
  private readonly timeoutMs: number;

  private cached: {
    readonly token: string;
    readonly refreshAt: number;
    readonly expiresAt: number;
  } | null = null;
  private pending: Promise<string | undefined> | null = null;
  private retryAt = 0;
  /** `null` until the first attempt, so the first success is told too. */
  private failing: boolean | null = null;

  constructor(
    private readonly client: IdpClient,
    options: IdpTokensOptions = {},
  ) {
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? Date.now;
    this.log = options.log ?? ((level, message) => console[level](message));
    this.skewMs = options.skewMs ?? 30_000;
    this.retryMs = options.retryMs ?? 15_000;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  /**
   * The origin of the token endpoint, which the outbound-call instrumentation leaves alone; `''`
   * for an address that is not a URL, whose requests then fail like any other.
   */
  get origin(): string {
    return URL.canParse(this.client.tokenUrl) ? new URL(this.client.tokenUrl).origin : '';
  }

  /** The current token, taken or taken again when due; `undefined` when there is none. */
  token(): Promise<string | undefined> {
    const now = this.now();
    if (this.cached && now < this.cached.refreshAt) {
      return Promise.resolve(this.cached.token);
    }
    if (this.pending) return this.pending;
    if (now < this.retryAt) return Promise.resolve(this.stillValid(now));
    this.pending = this.request().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  /** {@link AuthHeaders} for the exporters and the relay. */
  readonly headers: AuthHeaders = async (): Promise<Record<string, string>> => {
    const token = await this.token();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  private async request(): Promise<string | undefined> {
    try {
      const response = await this.fetchFn(this.client.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.client.clientId,
          client_secret: this.client.clientSecret,
        }).toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        // Drain the body, but never log it: an OAuth error names the client, nothing more useful.
        await response.arrayBuffer().catch(() => undefined);
        return this.failed(`the idp answered ${response.status}`);
      }
      const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
      if (typeof body.access_token !== 'string' || !body.access_token) {
        return this.failed('the idp answered without an access_token');
      }
      const lifetime =
        typeof body.expires_in === 'number' && body.expires_in > 0
          ? body.expires_in
          : DEFAULT_LIFETIME_S;
      const takenAt = this.now();
      // Never more than half the lifetime early, so a short-lived token is not asked for per export.
      const early = Math.min(this.skewMs, (lifetime * 1000) / 2);
      this.cached = {
        token: body.access_token,
        refreshAt: takenAt + lifetime * 1000 - early,
        expiresAt: takenAt + lifetime * 1000,
      };
      this.retryAt = 0;
      if (this.failing !== false) {
        this.log(
          'info',
          `qits-landing telemetry: took a token for ${this.client.clientId} from ${this.client.tokenUrl}`,
        );
      }
      this.failing = false;
      return body.access_token;
    } catch (error) {
      return this.failed(error instanceof Error ? error.message : String(error));
    }
  }

  private failed(reason: string): string | undefined {
    const now = this.now();
    this.retryAt = now + this.retryMs;
    if (this.failing !== true) {
      this.log(
        'warn',
        `qits-landing telemetry: no token for ${this.client.clientId} from ${this.client.tokenUrl} ` +
          `(${reason}); exporting without one until the idp answers`,
      );
    }
    this.failing = true;
    return this.stillValid(now);
  }

  /** A token past its refresh point is still worth sending until it actually expires. */
  private stillValid(now: number): string | undefined {
    return this.cached && now < this.cached.expiresAt ? this.cached.token : undefined;
  }
}
