import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { telemetryTarget, type TelemetryTarget } from './otel-config';
import { otelRoutes } from './otel-routes';

const TARGET = telemetryTarget({ QITS_OBSERVABILITY_URL: 'http://receiver:8080' })!;

describe('otelRoutes', () => {
  let server: Server;
  let base: string;
  let target: TelemetryTarget | null;
  let upstream: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    target = TARGET;
    upstream = vi.fn(async () => new Response(new Uint8Array([7]), { status: 200 }));
    const app = express();
    app.use(otelRoutes(() => target, upstream as unknown as typeof fetch));
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('relays the telemetry target', async () => {
    const response = await fetch(`${base}/api/config.json`);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      telemetry: {
        serviceName: 'qits-landing',
        resourceAttributes: { 'service.name': 'qits-landing' },
      },
      capture: null,
    });
  });

  it('relays telemetry: null when telemetry is off', async () => {
    target = null;
    expect(await (await fetch(`${base}/api/config.json`)).json()).toEqual({
      telemetry: null,
      capture: null,
    });
  });

  it('forwards an export unchanged to the receiver', async () => {
    const body = new Uint8Array([1, 2, 3, 250]);
    const response = await fetch(`${base}/api/otel/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-protobuf' },
      body,
    });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([7]));
    expect(upstream).toHaveBeenCalledOnce();
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://receiver:8080/observability/api/otel/v1/traces');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-protobuf' });
    expect(new Uint8Array(init.body as Uint8Array)).toEqual(body);
  });

  it('forwards logs too, and passes the receiver status on', async () => {
    upstream.mockResolvedValueOnce(new Response(null, { status: 400 }));
    const response = await fetch(`${base}/api/otel/v1/logs`, { method: 'POST', body: 'x' });
    expect(response.status).toBe(400);
    expect(upstream.mock.calls[0][0]).toBe('http://receiver:8080/observability/api/otel/v1/logs');
  });

  it('answers 404 for another signal or when telemetry is off', async () => {
    expect((await fetch(`${base}/api/otel/v1/metrics`, { method: 'POST', body: 'x' })).status).toBe(
      404,
    );
    target = null;
    expect((await fetch(`${base}/api/otel/v1/traces`, { method: 'POST', body: 'x' })).status).toBe(
      404,
    );
    expect(upstream).not.toHaveBeenCalled();
  });

  it('answers 502 when the receiver cannot be reached', async () => {
    upstream.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await fetch(`${base}/api/otel/v1/traces`, { method: 'POST', body: 'x' })).status).toBe(
      502,
    );
  });
});
