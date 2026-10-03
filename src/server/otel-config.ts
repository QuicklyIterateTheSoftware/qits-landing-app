/**
 * Where this server sends its telemetry, and what it calls itself. Pure: everything comes from the
 * environment it is given, so a spec can state any deployment.
 *
 * It mirrors the Quarkus services (qits-ci-service's `application.properties`, "telemetry"):
 *
 * - The receiver is qits-observability. `QITS_OBSERVABILITY_URL` (scheme, host and port, no path)
 *   names it; without it the address is derived, because every application answers on qits-net
 *   at `<environment>-<application>` and qits-deployments injects `QITS_ENVIRONMENT` into every
 *   container. The fallback environment is `dev`, as in the services.
 * - The ingest path is qits-observability's own: `/observability/api/otel`. The exporters append
 *   `/v1/<signal>`, and the protocol is http/protobuf.
 * - `service.name` is the deployed application, `qits-landing` (`QITS_APPLICATION`, also injected).
 *   The deployer writes the rest of the identity (`service.version`, `deployment.environment.name`,
 *   `service.instance.id`) into `OTEL_RESOURCE_ATTRIBUTES`; this reads it from there.
 */

/** The application this repository deploys as (`.config/qits/deployments.yml`). */
export const DEFAULT_SERVICE_NAME = 'qits-landing';

/** qits-observability's ingest path. The exporters append `/v1/<signal>`. */
export const OTLP_INGEST_PATH = '/observability/api/otel';

export type Env = Readonly<Record<string, string | undefined>>;

export interface TelemetryTarget {
  /** `<receiver>/observability/api/otel`, without the `/v1/<signal>`. */
  readonly endpoint: string;
  readonly serviceName: string;
  /** The resource of every record, `service.name` included. */
  readonly resourceAttributes: Readonly<Record<string, string>>;
}

/** The receiver's address: scheme, host and port, no trailing slash. */
export function observabilityUrl(env: Env): string {
  const configured = env['QITS_OBSERVABILITY_URL']?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const environment = env['QITS_ENVIRONMENT']?.trim() || 'dev';
  return `http://${environment}-qits-observability:8080`;
}

/**
 * `OTEL_RESOURCE_ATTRIBUTES` as the OpenTelemetry spec writes it: `key=value` pairs separated by
 * commas, values percent-encoded. A pair without `=` or with an empty key is skipped.
 */
export function parseResourceAttributes(value: string | undefined): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const pair of (value ?? '').split(',')) {
    const at = pair.indexOf('=');
    if (at < 0) continue;
    const key = pair.slice(0, at).trim();
    if (!key) continue;
    const raw = pair.slice(at + 1).trim();
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // keep a value that is not valid percent-encoding as written
    }
    attributes[key] = decoded;
  }
  return attributes;
}

/**
 * The target, or `null` when telemetry is off. `OTEL_SDK_DISABLED=true` turns it off, the
 * standard OpenTelemetry switch. The other "off" is the caller's: the server starts telemetry
 * only when it runs as the main module, never under `ng serve`, the build or the unit tests.
 */
export function telemetryTarget(env: Env): TelemetryTarget | null {
  if (env['OTEL_SDK_DISABLED']?.trim().toLowerCase() === 'true') return null;
  const serviceName = env['QITS_APPLICATION']?.trim() || DEFAULT_SERVICE_NAME;
  return {
    endpoint: observabilityUrl(env) + OTLP_INGEST_PATH,
    serviceName,
    resourceAttributes: {
      ...parseResourceAttributes(env['OTEL_RESOURCE_ATTRIBUTES']),
      'service.name': serviceName,
    },
  };
}

/**
 * The body of `GET api/config.json`, the relay `@qits/angular` reads. `telemetry: null` keeps the
 * browser library dark. `capture` stays `null`: this app has no capture ingest.
 */
export function configRelay(target: TelemetryTarget | null) {
  return {
    telemetry: target
      ? { serviceName: target.serviceName, resourceAttributes: target.resourceAttributes }
      : null,
    capture: null,
  };
}
