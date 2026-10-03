# AGENTS.md

Notes for agents working in this repository. `README.md` covers what the app is and how to run it.
This file covers the rules that are easy to break.

## Where code lives

- `src/app/ui/components/<component>/`: dumb, presentational components (`stat`, `spinner`,
  `card`, …). Inputs and projected content only; they know nothing about projects, statuses or
  stores. Each has its own plain spec and a screenshot spec with inline data.
- `src/app/routes/`: the routed components, on a tree that mirrors the URL (`:param` is a
  directory `[param]`). A route's full path (parents joined, `''` skipped) is the directory of its
  component: `projects/:slug/work/archive` is
  `routes/projects/[slug]/work/archive/work-archive.page.ts`. A routed component is a page,
  `<name>.page.ts` with class `<Name>Page`; one with child routes is a layout, `<name>.layout.ts`
  with class `<Name>Layout` (`routes/projects/[slug]/work/work.layout.ts`). Nothing else
  that is a component lives here. `app.routes.ts` loads every page lazily (`loadComponent`). The
  `@qits/angular` lint rules `qits/page-location`, `qits/page-suffix` and
  `qits/route-matches-directory` check this.
- `src/app/layout/` (`$layout/…`): the page frame. A layout shared by many routes lives here
  instead of under `routes/` (the shell: `layout/shell/shell.layout.ts`); the lint rules allow it
  only because `tsconfig.json` defines the `$layout` alias. Also the non-routed page structure
  (`layout/page-layout/`: header, pinned actions, content).
- `src/app/patterns/<domain>/<component>/`: smart components that are not routed (menus, cards,
  board nodes, toasts, such as `patterns/projects/project-card/`). They read stores and map the
  data onto `ui/components`. Specs sit beside each component.
- `src/app/core/<domain>/`: state, services and pure functions (stores and their `*.consumes.ts`
  and pact specs, `selected-project.ts`, `work-statuses.ts`, the session guard in `core/auth/`).

## Live domain events

`core/events/domain-events.ts` (`DomainEvents`) is the app's ONE live connection to qits-events:
an `EventSource` on qits-events' origin, `/events/api/stream?names=…` (`*` is every event). Stores and menus call
`on(names)` instead of opening a stream of their own; the service keeps the union of the names its
subscribers want, reopens the stream when that changes (debounced), reopens a stream the browser
gave up on with a doubling wait (1–30 s), closes it when nobody listens, and never connects on the
server. The stream is live only: no replay. An event is the same envelope as the list's entries, so
its shape is bound by the list's pact (`LIST_EVENTS`, which reads `payload` for that reason;
`payloadProjectId` reads the `projectId` most project-scoped events carry).

Users today: the lightning menu fetches the open project's release requests when the project opens
and again (at most once a second) after `RELEASE_REQUEST_EVENTS` about that project
(`core/projects/release-request-events.ts`; deployment events name no project, and count only while
a request is RELEASED; a rollback is `DeploymentFailed` with `status: ROLLED_BACK`). The
notifications menu puts every new event at the top of its list once it is loaded. The bumps menu
(the lighthouse, `patterns/maintenance/bumps-menu/`) fetches qits-maintenance's pending bumps
(`listPendingBumps`) on its first opening and again after `BUMP_EVENTS`, at most once a second.

The top bar's menus are built on `ui/components/dropdown/` (`ui-dropdown`): the trigger and the
panel are projected, `opened` fires on each opening.

## Backend origins

Where each platform application answers comes from code, not from the network: inject
`PlatformOrigins` (`core/platform/platform-origins.ts`). The app does not read `/main-navigation`.

- `api(app)`: the origin of calls, the event stream and the idp's sign-in pages. `app.config.ts`
  gives each generated client its `baseUrl` from it, synchronously, and, deployed,
  `credentials: 'include'` when it is cross-origin.
- `page(app)`: the origin of an application opened as its own page (the Editor frame, a link).

Deployed, both are `https://<label>.<this page's hostname>` (the app lives at the apex); on the
server both are `''`, and the server calls nothing. Under `ng serve` (`environment.development.ts`,
`platformDomain`) both are `https://<label>.<platformDomain>`: there is no dev proxy. The labels
are `HOST_LABELS`, the one place a hostname is composed; a new application gets an entry there
(and in `CLIENTS` when it has a generated client). Specs provide `provideTestPlatformOrigins`
(`src/testing/`); pact specs keep setting each client's `baseUrl` to their mock server.

## Signing in: cookie deployed, bearer under `ng serve`

`sessionGuard` asks `Session` (`core/auth/session.ts`). Deployed it is `CookieSession`: a cheap
qits-projects read, and on 401 the idp's login page. The clients send the cookie
(`credentials: 'include'`, `EventSource` `withCredentials`).

Under `ng serve` the cookie never reaches localhost, so `environment.development.ts` adds
`provideDevBearer()` and `devBearerInterceptor` (`core/auth/dev-bearer.ts`):

- `DevTokens` (`dev-tokens.ts`): the idp's public PKCE client `qits-landing-dev`. Login sends the tab
  to `/idp/authorize` with the verifier in `sessionStorage` under the `state`; the idp comes back to
  `/auth/callback` (`routes/auth/callback/auth-callback.page.ts`), which checks the `state` and
  swaps the code at `/idp/token` (a form POST, no credentials, no `audience`). Tokens live in
  memory and `sessionStorage`; a refresh runs ahead of expiry and only one at a time (the idp
  rotates refresh tokens and revokes the family on reuse).
- `devBearerInterceptor`: `Authorization: Bearer` on calls to a platform host only; a 401 gets one
  refresh and one retry, then the visitor goes to sign in.
- `EVENT_SOURCE` becomes `FetchEventSource` (`core/events/fetch-event-source.ts`): `fetch()` plus
  a small SSE parser, because `EventSource` cannot send a header and the edge reads no query token.
  Specs keep faking `EVENT_SOURCE` as before.

The environment file is the ONLY importer of this code, so the deployed bundle holds none of it.
Keep it that way: never import `dev-bearer.ts`, `dev-tokens.ts` or `fetch-event-source.ts` from
anywhere else. `npm run build` then `grep -r qits-landing-dev dist/qits-landing-app/browser` must
find nothing.

## Telemetry

The SSR server exports traces, logs and metrics (OTLP http/protobuf) to qits-observability:
`$QITS_OBSERVABILITY_URL` or `http://${QITS_ENVIRONMENT:-dev}-qits-observability:8080`, plus
`/observability/api/otel/v1/<signal>`. `service.name` is `qits-landing`; the rest of the resource
comes from `OTEL_RESOURCE_ATTRIBUTES`, which the deployer sets. The code is in `src/server/`. It
starts only when `server.mjs` runs as the server, never under `ng serve`, the build or the tests;
`OTEL_SDK_DISABLED=true` turns it off. Nothing patches modules (the bundle holds express): server
spans come from a middleware, fetch spans from the undici diagnostics channels, and every
`console` call is also a log record.

The browser half is `@qits/angular` (`initQitsIntegration()` in `main.ts`). The server serves its
contract: `GET /api/config.json` (the relay, `telemetry: null` when the server's telemetry is off)
and `POST /api/otel/v1/{traces,logs}` (forwarded unchanged to the receiver). Each rendered page
carries `<meta name="traceparent">`, so the browser's page load joins the render's trace.

## Styling

Styling uses Tailwind (v4, set up in `src/styles.css` and `.postcssrc.json`): utility classes in
the templates, and no component `styles:` or `styleUrl` blocks. A component's own host styling goes
in `host: { class: '…' }`. Colours come from Tailwind's theme, not hex literals. The app's own
palettes are in `src/theme.css` (Tailwind v4's `@theme`, imported by `src/styles.css`):
`charcoal-brown`, `sunflower-gold`, `cinnabar`, `mint-leaf` and `ocean-deep`, each 50–950
(`bg-ocean-deep-100`, `text-cinnabar-600`). Tailwind's default palette stays available. Tailwind finds the classes in the inline templates by itself; a class written as a
string built at run time is not found, so write every class out in full.

## Pact contracts (epics qits-546, qits-112)

This app is a consumer of several providers. What it relies on from each is written down as a Pact V4
file in a folder of that provider's, and published as a jar the provider verifies in its own gate:

| Provider              | Store and pact spec                | Pact file                                           | Golden masters                  |
| --------------------- | ---------------------------------- | --------------------------------------------------- | ------------------------------- |
| qits-projects-service | `core/projects/projects.store*.ts` | `pacts/qits-landing-app_qits-projects-service.json` | `@qits/projects-golden-masters` |
| qits-githost-service  | `core/loc/loc.store*.ts`           | `pacts/qits-landing-app_qits-githost-service.json`  | `@qits/githost-golden-masters`  |

The githost pact has one interaction per kind of list a card meets, each from its own provider
state: a repository counted (the card's language table), one counted at an older commit (`STALE`,
shown like a counted one), one never counted (`PENDING`, left out; "Counting lines…" when nothing
is counted), one without a commit ("No lines yet"), and a mix of counted and never counted. The
card shows CODE languages only; data (JSON, YAML, …) and docs (Markdown) are left out. The plain and
screenshot specs cover the same cases from the same golden masters.

- **Pacts name both sides by repository name**, never by application name, so a component's
  frontend and backend stay distinct: consumer `qits-landing-app`, provider
  `qits-projects-service`, file `pacts/<consumer>_<provider>.json`. The same names go into
  `comments.references` (`qits-call.app`, `qits-trigger.app`).
- **Stores are the only users of a generated client.** A guard or component asks a store; it never
  calls `src/app/api/` itself. So the pact spec next to the store is the whole of what this app
  relies on from that provider: `src/app/core/projects/projects.store.pact.spec.ts`.
- **The pact binds only what the app reads, and the compiler keeps it honest.** The golden master
  holds qits-projects' whole answer. `src/app/core/projects/projects.consumes.ts` lists, per call,
  the body paths the store reads (`as const`). The store wraps every client call in
  `consume(call, LIST)` (from `@qits/angular`), so its `data` is typed to those paths only: reading any other field, in the
  store or a template, fails the build. The pact spec passes the same lists as `consumes`, so the
  pact holds exactly those fields. To read another field, add it to the list; the pact changes
  with it. An empty list (`SESSION_CHECK`, and every error answer) binds the status only.
- **The pact spec uses `@pact-foundation/pact` (PactV4).** Each test drives one store method against
  the pact mock server, through a real `HttpClient` (`withFetch()`), and checks what the store made
  of the answer. The mock server answers with qits-projects' golden master and fails the test when
  the store's request does not match.
- **Answers come from the golden masters, never from a hand-written body.**
  `@qits/projects-golden-masters` is a devDependency, so qits-maintenance bumps it.
  `src/testing/golden-masters.ts` reads it. Plain specs (`projects.store.spec.ts`, `app.spec.ts`,
  `session.guard.spec.ts`) keep `HttpTestingController` and `flush(goldenMaster(...))`. A spec that
  needs a different answer derives it from a golden master and says how in a comment.
- **The generic part lives in `@qits/angular`**: `consume` and `Consumed` in the main entry, and
  the golden-master reader, `addGoldenInteraction` (with its required `consumes`) and
  `assertPactFile` in `@qits/angular/testing`. `src/testing/golden-masters.ts` only binds them to
  `@qits/projects-golden-masters`.
- **ESLint enforces the layout**: `eslint.config.mjs` turns on `@qits/angular/eslint`'s
  `recommended` rules (generated clients only in stores, every client call wrapped in `consume`,
  a pact spec beside every store, pact names are repository names). `npm run lint` runs prettier
  and ESLint, and the release check runs `npm run lint`.
- **Matchers come from the index's `frozen` lists**, never from a value's shape: `frozen.ids` a uuid
  regex, `frozen.instants` an ISO-8601 regex, every other leaf a type match, a recorded `null` exact
  `null`. `frozen.listFilteredTo` is "at least the recorded count"; every other array is "exactly
  the recorded count". Pact has no "type or null", so an array whose elements differ in which
  fields are null (repositories: the PROJECT one has no `component`) becomes `arrayContaining` with
  one variant per shape.
- **The interaction catalog is `src/app/interactions.ts`.** Every UI interaction that calls a
  backend has a stable slug there. `qits-trigger.interaction` names it, and a slug that is not in
  the catalog does not compile. Never reuse a slug for a different interaction.
- **Provider state params**: an id in the request path is a provider-state expression
  (`${projectId}`), but only when the path has a `{param}`. On a parameterless path pact-jvm
  resolves the expression to a path that misses the route.

### Keeping the committed pact current

The pact spec writes to a fresh temporary directory (pact-js merges into an existing file, which
would keep an interaction no test makes anymore). `afterAll` compares the result with the committed
file, ignoring `metadata` (library versions) and interaction order, and fails on any other
difference. If the change is intended, regenerate the file in the same change:

    QITS_GOLDEN_UPDATE=true npm test

The QA step runs `npm test`, so a stale committed pact fails the release request. `pacts/` is in
`.prettierignore` because pact-js owns its layout.

The lockfile holds the pact native core for glibc (workstations) and musl (the `node:24-alpine` CI
image). Keep both when you update `@pact-foundation/pact`.

### Publishing: only when the pact changed

Every pact sits flat in `pacts/`, named `<consumer>_<provider>.json` by repository name.
`release.yml` declares one `contracts.pacts` entry per provider, keyed by the provider's repository
name (`qits-projects-service: { packages: [maven] }`), and carries no `release:` override — the `app`
archetype's release step runs as is. qits-ci packs only `pacts/*_<provider>.json` into that
provider's jar (at `pacts/<file>` on the classpath), names it by the two repository names
(`eu.wohlben.qits:qits-landing-app-pacts-qits-projects-service`, `…-pacts-qits-githost-service`) and
publishes it only when those files changed. So a change to one pact does not republish, and bump,
the other provider's jar. There is no
repository-side gate, jar builder or PUT sequence left to maintain: `.config/qits/pacts.sh`,
`.config/qits/pacts-jar.mjs` and `.config/qits/published-tree-changed.sh` are gone.

## Screenshot tests (`*.browser.spec.ts`)

Components are also tested in a real browser (Chromium, through Playwright and Vitest browser mode),
and each test compares a screenshot with a committed reference. `npm run test:browser` runs them;
`npm test` (jsdom) leaves them out. The release check runs `npm run --if-present test:browser` in a
step image that has Chromium, so a changed pixel fails the release request.

- **The backend answers are the providers' golden masters, and nothing else**, in every
  screenshot spec except the dumb components' (`src/app/ui/`, synthetic inputs). The reader uses
  `node:fs`, so it runs on the Node side: `vitest-browser.config.ts` gives the browser a
  `goldenMaster` command, which reads only a (state, operation) the committed pact uses
  (`pactedGoldenMasters`), so the provider verifies every body a screenshot shows. A spec calls
  `goldenMaster(state, operationId, provider?)` from `src/testing/browser/golden-master.ts`
  (provider `qits-projects` unless named), which registers the body as a frozen recording, and
  `flush(...)`es it, or a part of it, as it is. `guardGoldenMasters()` (`setup.ts`) fails a 2xx
  answer that is not a recording; an error answer is only a status and may carry anything. No
  `useValue` for a store or a `$core` token (only `EVENT_SOURCE`, a transport seam), no
  `patchState`, no copies or spreads (lint `qits/browser-spec-data-from-golden-masters`). A case
  no recording holds gets a new provider state in the provider and a pact interaction here. The
  two providers' frozen ids are unrelated, so the card spec puts qits-githost's recorded entries
  under the project's recorded repository ids and says so.
- **The same pixels on every machine**: the font is Inter from `src/testing/browser/fonts/`, never a
  system font; animations and transitions are off (`src/testing/browser/setup.ts`); the viewport is
  800x600 (`angular.json`, target `test-browser`).
- **The renderer** is the image `qits/build-images/node-browser-base`: Node 24, Playwright's Chromium
  and a pinned font stack. CI's release check runs on it, and the workspace image is built FROM it,
  so both render the same pixels. `scripts/check-renderer.mjs` runs first and refuses a machine
  without `/etc/qits-renderer-provenance` (a workstation), a renderer that differs from
  `src/testing/browser/renderer.txt` (the one the references were made with), and a `playwright`
  package that is not the image's version. `playwright` is pinned exactly to that version.
- **References** are in `__screenshots__/` beside the spec, named `<name>-chromium-linux.png`, and
  are committed. CI only compares (`CI=true`): a mismatch or a missing reference fails, and nothing
  is written. A mismatch writes the actual image and the diff to `.vitest-attachments/` (ignored).
- **References are made by the platform, never by hand.** A qits-maintenance task, which an agent
  triggers for its release request, regenerates them (with `renderer.txt`) in the renderer image and
  joins the commit to that release request. Do not commit reference screenshots made anywhere else.
