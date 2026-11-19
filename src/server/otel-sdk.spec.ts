import { trace } from '@opentelemetry/api';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { telemetryTarget } from './otel-config';
import { startTelemetry } from './otel-sdk';

/**
 * The SDK's exporters carry the headers they are given (qits-2360): a local receiver records what
 * reaches `/observability/api/otel/v1/<signal>` when the SDK flushes on stop.
 */
describe('startTelemetry', () => {
  let server: Server;
  let receiver: string;
  let received: { signal: string; authorization: string | undefined }[];

  beforeEach(async () => {
    received = [];
    const app = express();
    app.post(
      '/observability/api/otel/v1/:signal',
      express.raw({ type: () => true }),
      (req, res) => {
        received.push({
          signal: String(req.params['signal']),
          authorization: req.get('Authorization'),
        });
        res.status(200).type('application/x-protobuf').send(Buffer.alloc(0));
      },
    );
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    receiver = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('signs every export with the bearer it is handed', async () => {
    const headers = vi.fn(async () => ({ Authorization: 'Bearer server-token' }));
    const stop = startTelemetry(telemetryTarget({ QITS_OBSERVABILITY_URL: receiver })!, headers, [
      'https://idp.qits.example.com',
    ]);
    trace.getTracer('spec').startSpan('render').end();
    console.info('a log record');
    await stop();

    const signals = new Set(received.map(({ signal }) => signal));
    expect(signals.has('traces')).toBe(true);
    expect(signals.has('logs')).toBe(true);
    expect(received.every(({ authorization }) => authorization === 'Bearer server-token')).toBe(
      true,
    );
    expect(headers).toHaveBeenCalled();
  });
});
