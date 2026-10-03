import express, { type Router } from 'express';
import { configRelay, type TelemetryTarget } from './otel-config';

/**
 * The two routes `@qits/angular` needs from the app's own backend (its README, "The backend
 * contract"). Both are relative to the page's base, which is `/`:
 *
 * - `GET /api/config.json`: the relay. It reports this server's telemetry target, so the browser
 *   library is on exactly when the server's own telemetry is on.
 * - `POST /api/otel/v1/{traces|logs}`: the passthrough. It forwards the browser's OTLP protobuf
 *   body unchanged to `<endpoint>/v1/<signal>` on qits-observability, which the browser cannot
 *   reach itself (the address is in-network).
 */

export const CONFIG_PATH = '/api/config.json';
export const PASSTHROUGH_PATH = '/api/otel/v1/:signal';

/** The signals the browser library exports. */
const SIGNALS = new Set(['traces', 'logs']);

/** An export is a batch; the browser flushes every second, so this is far above a real one. */
const BODY_LIMIT = '8mb';

/**
 * `target()` is read on every request: the server decides about telemetry only after this router
 * exists (it starts telemetry when it runs as the main module), and until then the answer is "off".
 */
export function otelRoutes(
  target: () => TelemetryTarget | null,
  fetchFn: typeof fetch = fetch,
): Router {
  const router = express.Router();

  router.get(CONFIG_PATH, (_req, res) => {
    res.set('Cache-Control', 'no-store').json(configRelay(target()));
  });

  router.post(
    PASSTHROUGH_PATH,
    express.raw({ type: () => true, limit: BODY_LIMIT }),
    async (req, res) => {
      const signal = String(req.params['signal']);
      const current = target();
      if (!current || !SIGNALS.has(signal)) {
        res.sendStatus(404);
        return;
      }
      const body: unknown = req.body;
      try {
        const upstream = await fetchFn(`${current.endpoint}/v1/${signal}`, {
          method: 'POST',
          headers: { 'Content-Type': req.get('Content-Type') ?? 'application/x-protobuf' },
          body: Buffer.isBuffer(body) ? new Uint8Array(body) : new Uint8Array(),
        });
        const answer = Buffer.from(await upstream.arrayBuffer());
        const type = upstream.headers.get('Content-Type');
        if (type) res.set('Content-Type', type);
        res.status(upstream.status).send(answer);
      } catch {
        // Never log here: a log record is itself exported, so a receiver that is down would turn
        // every failed browser export into another export.
        res.sendStatus(502);
      }
    },
  );

  return router;
}
