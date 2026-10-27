import express from 'express';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { missingAssets } from './missing-assets';

/** The order `server.ts` uses: static files, then `missingAssets`, then the renderer (here a stub). */
describe('missingAssets', () => {
  let dir: string;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'missing-assets-'));
    writeFileSync(join(dir, 'chunk-PRESENT.js'), 'export const a = 1;\n');
    const app = express();
    app.use(express.static(dir, { index: false, redirect: false }));
    app.use(missingAssets());
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

  it('answers 404 for a missing chunk, never the html', async () => {
    const response = await fetch(`${base}/chunk-GONE.js`);
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).not.toContain('text/html');
  });

  it('answers 404 for a missing stylesheet', async () => {
    expect((await fetch(`${base}/styles-GONE.css`)).status).toBe(404);
  });

  it('serves an existing chunk as JavaScript', async () => {
    const response = await fetch(`${base}/chunk-PRESENT.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toMatch(/^(text|application)\/javascript/);
  });

  it('keeps the app for a deep link', async () => {
    const response = await fetch(`${base}/projects/qits/work`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(await response.text()).toContain('<app-root>');
  });
});
