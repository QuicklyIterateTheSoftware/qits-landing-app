/**
 * A target's last settled health check (qits-2351), read off `getTargetHealth`'s body, which the
 * OpenAPI document types `unknown` (`{at, ok, detail, requestId, checks[]}`): only what
 * `GET_TARGET_HEALTH` binds, each field checked rather than trusted.
 */
export interface TargetHealth {
  readonly at?: string;
  readonly ok: boolean;
  readonly detail?: string;
  readonly checks: readonly TargetHealthCheck[];
}

/** One check of a health check: its name, verdict and why. */
export interface TargetHealthCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

/** The health check `body` holds; undefined for none (a 204, or a body that is no object). */
export function targetHealthOf(body: unknown): TargetHealth | undefined {
  const health = record(body);
  if (!health) return undefined;
  const checks = Array.isArray(health['checks']) ? health['checks'] : [];
  return {
    at: text(health['at']),
    ok: health['ok'] === true,
    detail: text(health['detail']),
    checks: checks.flatMap((entry) => {
      const check = record(entry);
      return check
        ? [
            {
              name: text(check['name']) ?? '—',
              ok: check['ok'] === true,
              detail: text(check['detail']),
            },
          ]
        : [];
    }),
  };
}
