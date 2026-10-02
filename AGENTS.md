# AGENTS.md

Notes for agents working in this repository. `README.md` covers what the app is and how to run it.
This file covers the rules that are easy to break.

## Pact contracts with qits-projects (epic qits-546)

This app is a consumer of qits-projects. What it relies on from qits-projects is written down as a
Pact V4 file, `pacts/qits-landing-qits-projects.json`, and published as a jar that qits-projects
verifies.

- **The answers come from qits-projects' golden masters, never from a hand-written body.**
  `@qits/projects-golden-masters` is a devDependency, so qits-maintenance bumps it.
  `src/testing/golden-masters.ts` reads it from `node_modules`. `goldenMaster(state, operationId)`
  returns the recorded body for a spec to `flush(...)`. A spec that needs a different answer derives
  it from a golden master (another id, an entry removed) and says so in a comment. The derived
  answers today:
  - `projects.store.spec.ts`: a copy of the recorded project without its `id`, to keep the "only
    projects with an id" assertion; the recorded list under another id, so that `refresh()` and
    `refresh(id)` have something to replace or fetch.
  - `app.spec.ts`: a second project (another id, name and slug) whose repositories answer is the
    recorded one cut to one entry, to keep the plural and the singular.
- **The interaction catalog is `src/app/interactions.ts`.** It lists every UI interaction that calls
  a backend, as stable slugs with a one-line title. A pact's `qits-trigger` names a slug, and
  `interaction(...)` only accepts a slug from the catalog, so a slug that is not there does not
  compile. A slug is never reused for a different interaction. A new call site means a new slug, or
  an existing slug if it is the same interaction.
- **`src/testing/qits-projects.pact.spec.ts` is the pact.** It has one test per (UI interaction,
  call), listed in its `PAIRS` table. Each test drives the real code (the guard, the store, the
  card), asserts the request with `expectOne`, answers with the golden master, asserts the outcome,
  and then records `interaction(state, operationId, trigger)`. `afterAll` builds the file from what
  was recorded and **compares it byte for byte with the committed one**. A difference fails the run.
  If the change is intended, regenerate the file in the same change:

      QITS_GOLDEN_UPDATE=true npm test

  If a pair did not record (because a test failed or was filtered out), it fails instead of writing
  a partial pact. `pacts/` is in `.prettierignore` because its layout belongs to the generator.

- **Matchers come from the index's `frozen` lists, never from a value's shape.** `frozen.ids` gets
  pact-jvm's uuid regex. `frozen.instants` gets an ISO-8601 regex. `frozen.listFilteredTo` gets
  `type` with `min` = the recorded length. Every other array gets `min` = `max` = the length, with
  ONE merged template, so element order never matters. Every other leaf gets `type`, widened to
  `type OR null` where a sibling element was null. A field that is null in every recorded element
  (`backupUrl`, `lastBackup`) has no rule, so it is compared as exactly `null`. That is the same
  choice the JVM consumer in qits-workspaces makes, and its output for the same (state, operation)
  is identical to this file's. If qits-projects starts filling such a field, its golden master
  changes and the bump regenerates the pact.

### Why the pact is written by hand, not by `@pact-foundation/pact`

The native core would load: `@pact-foundation/pact-core` 20.2.0 ships
`@pact-foundation/pact-core-linux-x64-musl`, and the CI step image is `node:24-alpine`. We do not
use it anyway, for three reasons:

- **The specs never reach a network.** They answer through `HttpTestingController`. The mock server
  would need a real HTTP client in jsdom, which is a second way of testing beside the one every spec
  already uses.
- **The file is compared byte for byte.** A writer we own is deterministic: sorted keys, sorted
  interactions, no library version in `metadata`. The JSON layout is the one pact-jvm writes for
  qits-workspaces, because pact-jvm 4.6.21 is what verifies it at qits-projects.
- **No binary in `npm ci`**, on the QA image or on a workstation.

The file was checked with pact-jvm 4.6.21's own reader and matchers: it loads as a `V4Pact`, the
`ProviderState` path generators and `comments.references` survive, and every response matches its
golden master even with every array reversed. It carries no `key`. pact-jvm reads that field as
optional, and its provider modules never read it.

### Publishing: only when the pact changed

`release.yml` declares
`contracts: { application: qits-landing, pacts: { qits-projects: { from: pacts/, packages: [maven] } } }`
and carries no `release:` override anymore — the `app` archetype's release step runs as is. qits-ci
derives the coordinate (`eu.wohlben.qits:qits-landing-pacts-qits-projects`), packages `pacts/` as the
jar and publishes it itself, only when the tree differs from the newest published jar's. There is no
repository-side gate, jar builder or PUT sequence left to maintain: `.config/qits/pacts.sh`,
`.config/qits/pacts-jar.mjs` and `.config/qits/published-tree-changed.sh` are gone.
