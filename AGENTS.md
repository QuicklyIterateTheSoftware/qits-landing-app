# AGENTS.md

Notes for agents working in this repository. `README.md` covers what the app is and how to run it.
This file covers the rules that are easy to break.

## Pact contracts with qits-projects-service (epic qits-546)

This app is a consumer of qits-projects-service. What it relies on is written down as a Pact V4
file, `pacts/qits-landing-app_qits-projects-service.json`, and published as a jar that
qits-projects-service verifies in its own gate.

- **Pacts name both sides by repository name**, never by application name, so a component's
  frontend and backend stay distinct: consumer `qits-landing-app`, provider
  `qits-projects-service`, file `pacts/<consumer>_<provider>.json`. The same names go into
  `comments.references` (`qits-call.app`, `qits-trigger.app`).
- **Stores are the only users of a generated client.** A guard or component asks a store; it never
  calls `src/app/api/` itself. So the pact spec next to the store is the whole of what this app
  relies on from that provider: `src/app/core/projects/projects.store.pact.spec.ts`.
- **The pact spec uses `@pact-foundation/pact` (PactV4).** Each test drives one store method against
  the pact mock server, through a real `HttpClient` (`withFetch()`), and checks what the store made
  of the answer. The mock server answers with qits-projects' golden master and fails the test when
  the store's request does not match.
- **Answers come from the golden masters, never from a hand-written body.**
  `@qits/projects-golden-masters` is a devDependency, so qits-maintenance bumps it.
  `src/testing/golden-masters.ts` reads it. Plain specs (`projects.store.spec.ts`, `app.spec.ts`,
  `session.guard.spec.ts`) keep `HttpTestingController` and `flush(goldenMaster(...))`. A spec that
  needs a different answer derives it from a golden master and says how in a comment.
- **`src/testing/golden-master-pact.ts` is the generic part**: the golden-master reader, the
  matcher wrapper (`addGoldenInteraction`) and the committed-file compare (`assertPactFile`). It
  knows no provider, consumer or package by name and imports nothing from `src/app`, so it can move
  into a shared library as it is.
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

`release.yml` declares
`contracts: { application: qits-landing, pacts: { qits-projects: { from: pacts/, packages: [maven] } } }`
and carries no `release:` override anymore — the `app` archetype's release step runs as is. qits-ci
derives the coordinate (`eu.wohlben.qits:qits-landing-pacts-qits-projects`; it still uses application
names), packages `pacts/` as the
jar and publishes it itself, only when the tree differs from the newest published jar's. There is no
repository-side gate, jar builder or PUT sequence left to maintain: `.config/qits/pacts.sh`,
`.config/qits/pacts-jar.mjs` and `.config/qits/published-tree-changed.sh` are gone.
