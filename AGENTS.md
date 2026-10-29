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

It is also the app's one basis for staleness (qits-1270). The rule: one stream. Every store, menu
or page holding platform state reads it again after the domain events that can change it, through
`DomainEvents`; no polling, no timers, no second stream for staleness. A subscriber narrows by
event name and by the ids the payload names (`payloadIds`: project, repository, request, run, work
item, agent, slot; `payload` is a JSON string), and reads again only what the event can change:
the one row it names, or the whole list when it can move the list (`changesReleaseRequestList`,
`releaseRequestRefresh` in `core/projects/release-request-events.ts`). It subscribes with
`refreshOn({ names, when?, debounceMs?, refresh })` (`core/events/refresh-on.ts`) from a
constructor, or with `injectRefreshOn()` in a signalStore's `withMethods`, called later with the
page's `DestroyRef`. A burst is debounced (a second by default) and `refresh` gets its events; the
debounce timer lives in `core/events/`, the only place a refresh timer may. Each subscriber records
its mapping, "store → events → what it reads again", in a doc comment beside it ("Staleness
(qits-1270): …"). The lint rule (`eslint.config.mjs`, `stalenessBans`) refuses `EventSource`,
importing `EVENT_SOURCE`, `setInterval`, rxjs `interval`/`timer` and a `setTimeout` whose callback
calls a `refresh*`/`reload*`/`load*`/`fetch*`/`poll*`/`tick*` outside `core/events/`. Allowed by
name: `ProcessLog` (a container start's byte stream), `dev-bearer.ts` and `dev-tokens.ts` (the
`ng serve` bearer, not staleness), specs and `src/testing/`. Temporarily allowed (qits-1270):
`WorkspaceHints` (the slot's hint channel, which no qits-events event replaces yet) and the agent
chat's 3 s transcript poll (the daemon offers no transcript stream). The terminal and chat sockets
are `WEB_SOCKET`, outside the rule.

What follows what (each store's comment has the detail). A release request's page follows only
events about that request (`affectsReleaseRequest`: its `releaseRequestId`; a `SoftwareRelease` or
build of its repository at its version or fold; a deployment of its version while RELEASED). The
Repositories page and the project cards read a project's repositories again after a
`SCMPublishCommit` to the wrapper's main branch (`RepositoriesStore.follow`). The work pages read the
open project's work again after `EntityTransitioned` naming it (`entities[].projectId`), and the work
item page its own data when the event names the item (`entities[].entityId`), and again after
`EntityCommented` naming it (`entityId`; qits-1660). A request's CI runs and
each run's reports follow qits-ci's `BUILD_EVENTS` (`core/ci/build-events.ts`) by `repoId` and
`runId` (`CiRunsStore.follow`, `CiReportsStore.followRun`). `WorkspacesStore` follows
qits-workspaces' agent events (`ACTIVE_AGENT_EVENTS`), not `EntityTransitioned`. Known gaps, where
no event exists yet (qits-1270's thread lists them): project and repository creation, work item
edits, a comment's edit, dossier and membership, a submitted CI report, a backup outcome, lines-of-code
counts.

Users today: the lightning menu fetches the open project's release requests when the project opens
and again (at most once a second) after `RELEASE_REQUEST_EVENTS` about that project
(`core/projects/release-request-events.ts`; `ReleaseRequestStateChanged` is the only event a
wrapper's READY → RELEASED → FINALIZED sends; deployment events name no project, and count only
while a request is RELEASED; a rollback is `DeploymentFailed` with `status: ROLLED_BACK`). The
notifications menu puts every new event at the top of its list once it is loaded. The bumps menu
(the lighthouse, `patterns/maintenance/bumps-menu/`) fetches qits-maintenance's pending bumps
(`listPendingBumps`) on its first opening and again after `BUMP_EVENTS` (`ReleaseRequestStateChanged`
among them), at most once a second.
The lightning menu's top line (`patterns/system/runner-slots/`, `TargetsStore`) reads qits-system's
targets on each opening until it loads, and again after `TARGET_EVENTS` (`TargetLeaseChanged`,
`TargetLoginChanged`). qits-system sends no event when a runner connects or drops. A person whose
roles may not read the targets gets a refusal, and the line stays hidden.
The lightning menu's active-run chips (`patterns/release-requests/active-runs/`, `activeRunsOf`)
read qits-ci's active runs (`CiRunsStore.loadActive`, `/ci/api/runs/active`) on each opening until
they load, and again after `BUILD_EVENTS` of a pending request's repository (`followActive`). The
release request page draws the same chips from its repository's runs.
The agents menu (the robot beside the lightning, `patterns/agents/agents-menu/`; epic qits-1681)
reads the open project's ACTIVE agents when the project opens and on each opening, and again after
`AGENT_STATUS_EVENTS` about the project (`AgentsStore.followProject`, debounced 1 s); its waits'
requests and items come from what `ProjectsStore` and `WorkStore` already hold.
The agent pages (epic qits-1681; the sidebar's Agents, `AGENTS = 'agents'`, was Workspaces):
`projects/<slug>/agents` (`ProjectAgentsPage`) lists the ACTIVE agents, each linking
`agents/<agent id>` with its waits and attention (`patterns/agents/agent-status/`), then the slots
under a Workspaces heading with the Targets link; `agents/<agent id>` (`AgentLayout`) reads the
agent by id (`AgentsStore.loadAgent`, `getAgent`, and its slot's start by the agent,
`getAgentActiveProcess`), its waits and attention from the project's list, shows its item (linked),
its verbs, a Workspace field (`ws-<slot id>` → `workspaces/<slot id>`) and the tabs (`AGENT_TABS`:
`chat`, `files`, `terminal`, which resolve the agent by `:agentId` too). Redirects:
`workspaces` → `agents`; an item's old address `work/detail/<id>/agent[/<tab>]` (`WorkAgentLayout`,
still where the Workspace links on cards and the item page lead, as they know no agent id) finds
the item's ACTIVE agent (`AgentsStore.loadItem`) and replaces itself with its page on the same tab,
or with the item. `workspaces/<slot id>` stays, its agents linking `agents/<agent id>`.
The workspace pages (the Agents page's slots, a slot, an agent; epic qits-1230) read again after
qits-workspaces' lifecycle events (`WORKSPACE_EVENTS`, `core/workspaces/workspace-events.ts`) that
name their wrapper, slot, item or agent, at most once a second (`AgentsStore.follow`). A project's
ACTIVE agents with their waits and attention (epic qits-1681, `AgentsStore.loadProjectAgents`,
`listAgents?projectId=&state=ACTIVE`; the pure `core/workspaces/agent-attention.ts` turns a wait into
its subject's line and an attention into its action) read again after `AGENT_STATUS_EVENTS` (the
wait, activity and attention events, `AgentNudged` and `ACTIVE_AGENT_EVENTS`) whose `projectId` is
the open project, or, for those naming no project, an agent or repository already listed
(`AgentsStore.followProject`). A container
start's log is not a domain event: `ProcessLog` reads that one process's own stream on
qits-workspaces' origin (`/workspaces/api/technical-processes/{id}/events`), through `EVENT_SOURCE`.

**The agent page uses agent doors (epic qits-1667) and calls no `/workspaces/container/` URL.**
Everything it asks is addressed by the agent, never by its slot: the REST doors under
`/workspaces/api/agents/{id}` (`getAgent`, `getAgentActiveProcess`, the prompt draft,
`promptAgent`, `interruptAgent`, `stopAgent`, `restartAgent`, `discardAgent`), and qits-workspaces'
agent proxy, `/workspaces/agent/<agent id>/…` (`core/workspaces/agent-proxy.ts`), which reaches the
daemon of whichever slot the agent is placed in now: `terminal` and `chat` (WebSockets the service
joins to the agent's running harness command), `log` (its command's log), `files[/…]` and
`detection` (the daemon's `agent-worktrees/<agent id>/…`), and `prompt-refinements`; `agentRoute`
gives the daemon's generated call that address. How the agent runs is its own `getAgent`
(`runState`, `harness`, `activity`); nothing looks the harness command up. The slot's status
strip, its container verbs and its harness install (sign-in, plugins) are the workspace page's.
The slot's hint channel (`WorkspaceHints`, `/workspaces/api/workspaces/{id}/events`) stays: it is a
REST door of qits-workspaces, not the container proxy. `agent-doors.spec.ts` beside the layout
holds it: it walks the imports of every source under `routes/projects/[slug]/agents/[agentId]/`
(the app's own, not `api/`) and fails on `workspaces/container`, `WorkspaceContainer`,
`container-proxy` or `containerBase` in any of them, and it runs every store call the page makes and
fails on any request not to the agent's doors. The container proxy's addresses live in
`core/workspaces/container-proxy.ts`, which only the workspace page's code imports.

An agent's terminal (`agents/<agent id>/terminal`, `AgentTerminalPage`) is a WebSocket, not a domain event:
while the agent is RUNNING, its harness through qits-workspaces' agent proxy, at
`wss://workspaces.<domain>/workspaces/agent/<agent id>/terminal` (`agentTerminalSocketUrl`), opened
through `WEB_SOCKET` (`core/platform/web-socket.ts`; specs fake it); a harness started again
(`AgentStarted`) is a new socket. `TerminalSocket` sends `{"type":"data"}` and `{"type":"resize"}`
frames. Its reconnects are `ReconnectingSocket`'s (`core/workspaces/reconnecting-socket.ts`): a
server close with 1000 is final, any other reconnects (0.5, 1, 2, 4, 4 s, then `lost` until a
button, `visibilitychange` or `online`). The screen is xterm.js (`ui/components/terminal-screen/`),
loaded lazily in the browser only; its stylesheet is imported in `src/styles.css`. The tab links the
workspace's page for the harness install.

A slot's harness install is the container's, shared by every agent it hosts, so it is on the
workspace page (`patterns/workspaces/harness-setup/`, epic qits-1667; it was the Terminal tab's):
the sign-in notice (`AgentSignInStore`: the daemon's `availableAgents`, `authenticated: false`;
Open the sign-in terminal is `openSignInTerminal`, whose command the screen attaches to until it
ends, at `…/workspaces/container/<slot row id>/terminal/commands/<command id>`,
`containerTerminalSocketUrl`) and the plugins on the shared agent home (`AgentPluginsStore`:
`listPlugins`, `installPlugin`), through the container proxy.

The Repositories page's backup sign-in (qits-1268, from qits-projects-frontend's backup panel) is
the same `TerminalSocket` and `ui-terminal-screen` on another socket: qits-projects'
`wss://projects.<domain>/projects/api/repositories/<repo id>/remote-login` (`remoteLoginSocketUrl`,
`core/repositories/remote-login.ts`), drawn by `patterns/repositories/remote-login-panel/`. An
`AUTH_REQUIRED` last backup on any repository puts an alert with "Sign in to backup remote" above
the tree; otherwise the action sits in the page header. It signs in through the wrapper when that
has a backup remote, else through a repository that asked for it (the credential store is shared).
When the session ends (a clean close, or Close) the page does what the old panel did: it reads the
repositories again (`RepositoriesStore.refresh`), nudges every backup (`RepositoriesStore.syncBackups`,
`POST /projects/api/projects/{projectId}/repositories/backup-sync`, `backupSyncProject` in the pact)
and says how many were scheduled. It does not read again on a timer (qits-1270 forbids refresh
timers, and qits-projects emits no event for a backup's outcome), so an "Auth needed" turns into
an outcome on the next read. A refused sync is a quiet note under the terminal and nothing more.

An agent's chat (`agents/<agent id>/chat`, `AgentChatPage`) shows the agent's transcript and a
prompt box. The transcript is the agent proxy's `log` (`AgentChatStore.loadTranscript`, `GET
…/workspaces/agent/<agent id>/log?channel=TRANSCRIPT`, the daemon's `getCommandLog` of the agent's
command), read again every 3 s while the agent is RUNNING and once more when it stops; the lines
become items in `core/workspaces/chat-model.ts`, drawn by `patterns/workspaces/conversation/`. The
live screen is the Terminal tab; Interrupt and Stop are the agent page's verbs (the old chat
Terminate is gone). The agent's own chat socket (`agentChatSocketUrl`, `ChatSocket`: it replays the
whole conversation on open and takes `{"type":"user","text":…}`) is kept in `core/`, but the tab
does not open it: `getAgent` does not say whether a harness runs as a chat, and the service starts
every agent in a terminal. `patterns/workspaces/prompt-composer/` keeps the prompt as the agent's
draft on qits-workspaces (`AgentPromptStore`: `GET|PUT|DELETE /workspaces/api/agents/{id}/prompt-draft`,
a 404 is no draft; saved 750 ms after typing stops), refines rough notes in the agent's container
(`AgentChatStore.refine`, `POST …/workspaces/agent/<agent id>/prompt-refinements`, the daemon's
`refinePrompt`) and sends the prompt to the agent by its id (`AgentPromptStore.prompt`, `POST
/workspaces/api/agents/{id}/prompt`, `promptAgent`), which resumes a yielded or stopped agent to
hear it. The tab also reads the slot's hint channel (`WorkspaceHints`,
`/workspaces/api/workspaces/{id}/events` through `EVENT_SOURCE`): `prompt-draft` adopts another
device's draft. There is no speech input. The chat store's pact spec makes its calls at the
daemon's own address, where the agent proxy forwards them, and binds what the daemon answers there.

An agent's files (`agents/<agent id>/files`, `AgentFilesPage`) are its worktree on the slot's daemon, through
the agent proxy (`AgentFilesStore`: `listFiles`, `readFile`, `detect` at `…/workspaces/agent/<agent
id>/files`, `/files/content`, `/detection`; its pact spec makes the same calls at the daemon's own
address, where the service forwards them, and binds what the daemon answers there): the whole eager tree in one
read, every gitignored directory as a dimmed stub opened one level per read, and the detection
(frameworks, the source-to-test graph), applied only while its `generation` is the tree's. The open
file is the URL's `path` (and `lines`, the anchored range). The tree model and the filters are pure
functions in `core/workspaces/file-*.ts` (search and manual rules open the tree fully, a framework
narrows to its members; rules run framework → ignore list → manual, last match wins; an ignore list
reads the tree's own `.gitignore`/`.dockerignore` files, each scoped to its directory; a test one
link from its source leaves the tree except while searching, and the viewer links them both ways).
The slot's `files` hint reads the tree, the detection and the open file again. Lines picked in the
viewer go to `PickedContext` (`core/workspaces/picked-context.ts`), which the Chat tab's prompt
composer lists, inserts, saves in the draft (`{"text":…,"picked":[…]}`) and appends to what it
sends when not pressed in.

The workspace pages' writes (qits-1243) go through `ContainerActionsStore`
(`core/workspaces/container-actions.store.ts`) and `AgentActionsStore`
(`core/workspaces/agent-actions.store.ts`): a slot's container verbs on the slot's page only
(`ContainerActionsStore`, `patterns/workspaces/container-actions/`: `ensure-`, `stop-`, `recreate-container`; Stop and
Recreate are confirmed naming the slot's agents, from `listWorkspaceAgents`, and afterwards name the
agents the answer's `affectedAgentIds` lists), the agent's own verbs on the agent page
(`AgentActionsStore`, `patterns/workspaces/agent-run-actions/`, epic qits-1667: Interrupt while RUNNING, Stop unless
STOPPED and Restart while RUNNING, YIELDED or STOPPED, the last two confirmed; `interruptAgent`,
`stopAgent`, `restartAgent`) and Discard on the agent page (`patterns/workspaces/agent-discard/`:
confirmed, then `force` after the service's 409). A STOPPED agent says so wherever its status shows
(`app-agent-status`, `runStateLabel`). A
refusal is shown in the service's words: the store reads the error body's `message` and `code`
(`consume`'s error paths, `REFUSAL`), and the pact binds them on each recorded refusal. After a
write the page reads its data again. No recording holds a
successful recreate or a forced discard, so their success paths are covered by plain specs only.

**Calls waiting for their recordings (epic qits-1667).** qits-workspaces records `promptAgent`,
`getAgentActiveProcess`, `stopAgent`, `restartAgent`, `interruptAgent` and `listWorkspaceAgents`,
and `affectedAgentIds` on a stopped slot, but the `@qits/workspaces-golden-masters` this app pins
predates them, and `addGoldenInteraction` needs the recording. Until qits-maintenance bumps the
package, those calls have no pact row (the stop's row binds what its recording holds, `heldBy`), and
the specs answer them with the recording of the call they replace, which has the same shape, saying
so where they do. Once the bump lands: add their interactions to the stores' pact specs
(`agents`, `agent-prompt`, `agent-actions`, `container-actions`; states "a workspace slot hosting agents", "an agent
working on a ticket", "a stopped workspace slot", "an agent in the middle of a turn"), switch those
specs to the new recordings, and regenerate the pact.

This app has no runners page of its own (epic qits-1481, ahead of qits-workspaces-service dropping
its runner doors in qits-1532): `WorkspaceRunnersPage`, `RunnersStore` and the
`patterns/workspaces/{runner-card,register-runner-form,install-line-panel}/` it used are retired.
Beside the Agents page's Workspaces heading, Targets links to qits-system's Targets page
(`PlatformOrigins.page('system')` + `/system/targets`) instead, where execution targets are now
managed. A slot's status strip no longer names which runner it is placed on
(`patterns/workspaces/slot-status/`, `placementNote` in `core/workspaces/agent-labels.ts`): the
field it read, `workspace.runner`, is gone from what this app consumes, ahead of the service
dropping it.

The top bar's menus are built on `ui/components/dropdown/` (`ui-dropdown`): the trigger and the
panel are projected, `opened` fires on each opening.

## Backend origins

Where each platform application answers comes from code, not from the network: inject
`PlatformOrigins` (`core/platform/platform-origins.ts`). The app does not read `/main-navigation`.

- `api(app)`: the origin of calls, the event stream and the idp's sign-in pages. `app.config.ts`
  gives each generated client its `baseUrl` from it, synchronously, and, deployed,
  `credentials: 'include'` when it is cross-origin.
- `page(app)`: the origin of an application opened as its own page (a link).

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
- `WEB_SOCKET` (`core/platform/web-socket.ts`; deployed, the browser's `WebSocket`, with the
  cookie) becomes `DevWebSocket` (`dev-web-socket.ts`): a browser WebSocket cannot send a header
  either, so it offers the bearer as a subprotocol, `new WebSocket(url, ['qits.bearer', <access
token>, ...protocols])`, with the token from `DevTokens.accessToken()` (refreshed first when it
  is about to end); the socket opens once the token is at hand. qits-edge (qits-1246) takes that
  offer only from `http://localhost[:port]` or `http://127.0.0.1[:port]` (not https, not `[::1]`):
  it moves the token into `Authorization: Bearer`, forwards neither entry, and answers the
  handshake with `Sec-WebSocket-Protocol: qits.bearer`. Any other origin is a 403; a missing or
  bad token a 401. Specs fake `WEB_SOCKET`.

The environment file is the ONLY importer of this code, so the deployed bundle holds none of it.
Keep it that way: never import `dev-bearer.ts`, `dev-tokens.ts`, `dev-web-socket.ts` or `fetch-event-source.ts`
from anywhere else. `npm run build` then `grep -r qits-landing-dev dist/qits-landing-app/browser` and
`grep -r qits.bearer dist/qits-landing-app/browser` must find nothing.

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

| Provider                | Store and pact spec                                                                          | Pact file                                             | Golden masters                          |
| ----------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| qits-projects-service   | `core/projects/projects.store*.ts`                                                           | `pacts/qits-landing-app_qits-projects-service.json`   | `@qits/projects-golden-masters`         |
| qits-githost-service    | `core/loc/loc.store*.ts`                                                                     | `pacts/qits-landing-app_qits-githost-service.json`    | `@qits/githost-golden-masters`          |
| qits-workspaces-service | `core/workspaces/{workspaces,agents,agent-prompt,agent-actions,container-actions}.store*.ts` | `pacts/qits-landing-app_qits-workspaces-service.json` | `@qits/workspaces-golden-masters`       |
| qits-workspace-daemon   | `core/workspaces/{agent-chat,agent-files,agent-sign-in,agent-plugins}.store*.ts`             | `pacts/qits-landing-app_qits-workspace-daemon.json`   | `@qits/workspace-daemon-golden-masters` |
| qits-system-service     | `core/system/targets.store*.ts`                                                              | `pacts/qits-landing-app_qits-system-service.json`     | `@qits/system-golden-masters`           |

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
  are committed. QA checks them (qits-1179, qits-1178): the QA step of qits-ci's packaged `app`
  recipe declares `check-outputs: [screenshot-baselines]`, so after its script it runs the platform's own baselines job (`UPDATE_SNAPSHOT=all` on
  `test:browser`, then `screenshots:prune`). When that changes, adds or deletes any reference or
  `renderer.txt`, QA fails with one line, `qits-ci: stale outputs: screenshot-baselines`, and the
  command to regenerate. A failing spec still fails QA as a test failure. Locally, a mismatch writes
  the actual image and the diff to `.vitest-attachments/` (ignored).
- **References are made by the platform, never by hand.** Regenerate them for your release request
  with `qits release-request regenerate --kind screenshot-baselines` (plus `--project qits` and
  `--repository qits-landing-app`), or "run again" on the request page. The automation renders them
  (with `renderer.txt`) in the renderer image and commits them to `maintenance/automations/…`; the
  request folds again, and QA runs again. Do not commit reference screenshots made anywhere else.
- **No reference without a test.** Vitest never deletes a reference, so a deleted spec or a renamed
  screenshot leaves an orphan. `screenshotReferences()` (`@qits/angular/screenshots`, in
  `vitest-browser.config.ts`) records every reference each spec asks for during the run, and
  `qits-angular screenshots --check` fails on a reference no test uses after the run in
  `test:browser` (judged by name, for every spec whose tests all passed; in an update run it only
  lists them). The fix is never a hand deletion: the baselines job runs `npm run screenshots:prune`
  after its update run, so QA reports an orphan as stale and its regeneration deletes it. Trigger it
  as for a changed screenshot.
