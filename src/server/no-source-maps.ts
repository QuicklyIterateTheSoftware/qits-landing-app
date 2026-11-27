import type { RequestHandler } from 'express';

/** A path that names a source map: `.map` at its end. */
const SOURCE_MAP = /\.map$/i;

/**
 * Answers 404 for every `.map` path, present or not (qits-2767). Goes BEFORE `express.static`.
 *
 * The production build writes hidden source maps (`angular.json`, `sourceMap.hidden`): no bundle
 * names one, and the Dockerfile moves them out of `browser/` into its `sourcemaps` stage, which the
 * release publishes as the docs site `@sourcemaps/qits-landing` for qits-observability to read with
 * a bearer. The runtime image holds none. This is the second wall: should a map ever reach
 * `browser/` again, the static files would hand the app's source to anyone who asks, so the answer
 * is decided by the name before the file system is looked at.
 */
export function noSourceMaps(): RequestHandler {
  return (req, res, next) => {
    if (!SOURCE_MAP.test(req.path)) {
      next();
      return;
    }
    res.status(404).type('text/plain').send('Not found\n');
  };
}
