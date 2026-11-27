import express from 'express';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { noSourceMaps } from './no-source-maps';

/** The order `server.ts` uses: `noSourceMaps`, then the static files, then the renderer (a stub). */
describe('noSourceMaps', () => {
  let dir: string;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'no-source-maps-'));
    writeFileSync(join(dir, 'main-PRESENT.js'), 'export const a = 1;\n');
    writeFileSync(join(dir, 'main-PRESENT.js.map'), '{"version":3,"sources":[],"mappings":""}');
    const app = express();
    app.use(noSourceMaps());
    app.use(express.static(dir, { index: false, redirect: false }));
    app.use((_req, res) => {
      res.status(200).type('html').send('<!doctype html><app-root></app-root>');
    });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers 404 for a map the static files hold', async () => {
    const response = await fetch(`${base}/main-PRESENT.js.map`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('mappings');
  });

  it('answers 404 for a missing map, never the html', async () => {
    const response = await fetch(`${base}/chunk-GONE.js.map`);
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).not.toContain('text/html');
  });

  it('answers 404 whatever the case or directory', async () => {
    expect((await fetch(`${base}/media/x.MAP`)).status).toBe(404);
  });

  it('still serves the script itself', async () => {
    expect((await fetch(`${base}/main-PRESENT.js`)).status).toBe(200);
  });

  it('keeps the app for a deep link', async () => {
    const response = await fetch(`${base}/projects/qits/work`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<app-root>');
  });
});
