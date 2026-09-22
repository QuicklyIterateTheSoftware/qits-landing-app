# qits-landing-app

The platform's landing page: an **Angular SSR application that serves itself**, shipped as one
container image and deployed as the application `qits-landing` at `landing.<env>.<domain>`.

It is the estate's first `-app`. The role is defined by what a repository PUBLISHES, not by how it
is written:

| role       | publishes                                      | release recipe     |
| ---------- | ---------------------------------------------- | ------------------ |
| `jslib`    | a package on the `@qits` scope                 | `npm-library.yml`  |
| `frontend` | a bundle a service carries at `src/main/webui` | `spa-frontend.yml` |
| `app`      | **an image the platform deploys on its own**   | `app.yml`          |

## The one claim this repository exists to keep

**The page's visible text is in the SERVER-RENDERED html.** Not prerendered at build time, not
filled in by the browser: rendered by the node process, per request.

```
curl -s http://localhost:8080/ | grep -o 'The qits platform'
```

Three things make that true and each is easy to undo:

- `src/app/app.routes.server.ts` says `RenderMode.Server`, where the Angular scaffold says
  `RenderMode.Prerender`. Prerender writes the html during `ng build` and serves it as a static
  file — the text would be in the response and would prove nothing about the server.
- every string on the page lives in `landing.html`, not behind a fetch. A page that renders its
  content from an HTTP call server-renders an empty shell.
- `app.spec.ts` asserts on the rendered DOM rather than on a string, so the claim fails in CI
  rather than in a deployment.

## Running it

```
npm ci
npm run lint          # prettier --check .
npm test              # vitest, jsdom target
npm run build
npm run serve:ssr     # node dist/qits-landing-app/server/server.mjs, on :8080
```

`npm ci` is the gate qits-ci runs (`.config/qits/release.yml`'s QA slot runs exactly these four).

**Generate the lockfile with npm 11 or newer.** npm 10.9.8 — the version on the current workstation
image — crashes with `Cannot read properties of null (reading 'edgesOut')` while resolving the
vitest peer graph (`@vitest/browser-playwright` → `jsdom` → the optional `canvas` peer); it is an
arborist bug, not a dependency conflict. `npm ci` is unaffected, because it installs the lockfile
rather than resolving one. The committed lockfile was produced by `npx npm@11 install`.

## The port, the health path, and where they are spelled

**8080, three times, on purpose.** `DeploymentSpecParser.DEFAULT_UPSTREAM_PORT` is 8080, so
`.config/qits/deployments.yml` states no `upstream_port:`; `src/server.ts` defaults to 8080 (the
Angular scaffold's default is 4000, and that is what was changed); `docker/Dockerfile` states
`ENV PORT=8080`. `process.env['PORT']` still wins where anything sets it.

**`health_path: /landing/health`, served by express rather than by Angular.** The deployer curls it
inside the container and rolls a deployment back when it does not answer. The derived default would
have been `/landing/q/health/ready`, a Quarkus shape nothing here serves. It is an express route
because a readiness answer must not depend on the renderer being able to render — which is the
thing it exists to notice.

## `security.allowedHosts: ["*"]`, and why

Angular 22 validates the `Host` and `X-Forwarded-Host` headers of every SSR request against
`projects.*.architect.build.options.security.allowedHosts` and answers `400 Bad Request` to anything
unlisted. The scaffold ships `[]`, which refuses **every** host — measured: a fresh build 400s
`curl http://127.0.0.1:8080/`.

The set of hostnames this application legitimately answers on is unbounded by design: its own vhost
per tier, plus `/landing` path-routed on **every** other vhost the edge serves, plus the per-project
domains a later epic adds. There is no list to write. The edge is the trust boundary — nothing
reaches this container except through it — so the check is delegated there and `*` is the honest
value.

`trustProxyHeaders` is deliberately left at its default (`false`). The application routes on the
literal path and needs nothing out of `X-Forwarded-*`; enabling it would make
`X-Forwarded-Prefix` reshape routing based on a header this repository has not verified the edge
sends. The cost is a `console.warn` per request if the edge does send proxy headers — worth
revisiting once that is measured, and not worth guessing at now.

## The image

`docker/Dockerfile`, two stages, no JVM.

**The build is self-contained.** `.config/qits/release.yml`'s release slot runs `buildctl` and
nothing else, so the `npm ci` and the `npm run build` happen inside the image build — which is what
makes the image a person builds on a workstation and the image CI builds the same image. The
registry ORIGINS arrive as build args (`QITS_NPM_REGISTRY_URL`, `QITS_NPM_PROXY_URL`) and the
credential as a buildkit SECRET (`id=qits-npm-token`, mounted at `/run/secrets/qits-npm-token`); an
absent or empty secret leaves the install anonymous rather than broken.

```
docker build -f docker/Dockerfile -t qits/qits-landing:dev .
docker run --rm -p 8080:8080 qits/qits-landing:dev
```

Two things about it that are decisions:

- **`.npmrc` is `.dockerignore`d.** npm ranks a project `.npmrc` above `~/.npmrc`, and the build
  writes `~/.npmrc` from the build args. Copied into the context, the committed file — which names
  the developer's edge vhosts — would win and send every request to an address the builder cannot
  resolve.
- **The runtime stage installs nothing.** `outputMode: server` bundles every third-party dependency,
  express and `@angular/ssr` included, into `server/server.mjs`; the only bare specifiers left are
  node builtins. Measured by running the built server from a directory with no `node_modules`
  anywhere above it. An `npm ci --omit=dev` here would install a tree nothing imports.
- **Base image `node:24-alpine`.** Angular 22 needs `^22.22.3 || ^24.15.0 || >=26.0.0`; the
  workstation's node 22 is irrelevant to the image and nothing in the build may depend on it.

## `.config/qits/release.yml` names no archetype **yet**

It inlines both slots as a verbatim copy of the wrapper's `app` recipe, because that recipe is not
on qits-qits' `main` yet — the wrapper gets this epic's content only when the workspace is resolved,
which is the last step of the epic. `archetype: app` today would compose to `ARCHETYPE_UNREADABLE`:
no CI run at all, and a release request behind a gate nobody can satisfy.

**The follow-up is one edit**: once `app.yml` is on the wrapper's `main`, delete both slots and
write `archetype: app`. `artifacts:` stays — qits-projects reads it out of this repository at the
tag, so an archetype default is invisible to it. The file's own header carries the whole argument.

## Layout

```
.config/qits/release.yml        the release cycle: QA slot, publish slot, one docker artifact
.config/qits/deployments.yml    application: qits-landing, host: landing, routes: /landing
docker/Dockerfile               build stage (npm ci + ng build) -> slim non-root runtime
src/server.ts                   express + AngularNodeAppEngine, :8080, /landing/health
src/app/landing/               the page
src/app/app.routes.ts          '' and a '**' catch-all, so /landing renders too
src/app/app.routes.server.ts   RenderMode.Server
```
