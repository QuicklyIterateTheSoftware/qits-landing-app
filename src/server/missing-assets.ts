import type { RequestHandler } from 'express';

/** A path that names a script or a stylesheet: `.js` or `.css` at its end. */
const ASSET = /\.(?:js|css)$/i;

/**
 * Answers 404 for a `.js` or `.css` file the static files do not hold (qits-1686). Goes after
 * `express.static` and before the renderer.
 *
 * Each release replaces the hashed build files. A tab opened before it still asks for the old
 * names; the renderer would answer them with the app's html (200 `text/html`), and the browser
 * refuses that as a module, so every lazy page fails. A 404 is the true answer, and the router's
 * reload-once (`core/updates/chunk-reload.ts`) recovers from it. Every other path still reaches the
 * renderer, so deep links work as before.
 */
export function missingAssets(): RequestHandler {
  return (req, res, next) => {
    if (!ASSET.test(req.path)) {
      next();
      return;
    }
    res.status(404).type('text/plain').send('Not found\n');
  };
}
