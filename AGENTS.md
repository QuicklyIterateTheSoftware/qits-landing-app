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
`DomainEvents`; no polling, no timers, no second stream for staleness. The exceptions are what no
event can announce, each while a person watches it: a running CI run's live output, read again
every 10 s while the run is RUNNING and the page visible (`pollWhile`, `core/events/poll-while.ts`,
qits-2321); the same way, a running orchestrator process run's steps, read without bodies
(qits-2359: qits-orchestrator publishes no event); and a target sign-in that has not settled, read
again every 2 s while its card is on the Targets page and the page visible (`app-target-sign-in`,
`SIGN_IN_POLL_MS`, qits-2351): qits-system publishes no sign-in event, and the flow lasts seconds
to minutes. A subscriber narrows by
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
`SCMPublishCommit` to the wrapper's main branch (their resources' `refreshOn`, `movesWrapper`). The work pages read the
open project's work again after `EntityTransitioned` naming it (`entities[].projectId`), and the work
item page its own data when the event names the item (`entities[].entityId`), and again after
`EntityCommented` naming it (`entityId`; qits-1660). A request's CI runs and
each run's reports follow qits-ci's `BUILD_EVENTS` (`core/ci/build-events.ts`) by `repoId` and
`runId` (the resources' `refreshOn`: `buildOfRepository`, `buildOfRun`; qits-2146). `WorkspaceActivity` (the work
pages' open workspaces and ACTIVE agents) follows qits-workspaces' agent events (`ACTIVE_AGENT_EVENTS`), not `EntityTransitioned`. Known gaps, where
no event exists yet (qits-1270's thread lists them): project and repository creation, work item
edits, a comment's edit, dossier and membership, a submitted CI report, a backup outcome, lines-of-code
counts, a mirror upstream registered or deleted or an image pulled through (qits-2357), a mirror
cache entry pulled through, evicted or swept (qits-2358), an orchestrator run started elsewhere
(gc's deploy trigger, another operator; qits-2359, qits-2472).

Ideas (epic qits-888): `projects/<slug>/ideas` (`ProjectIdeasPage`), `ideas/create`,
`ideas/detail/<idea id>` and its `edit` read and write qits-projects' `/ideas` doors through
`qitsResource` and `qitsMutation` over `core/ideas/ideas.operations.ts` (qits-2146; the writes'
requests built by `idea-writes.ts`); the form (`patterns/ideas/idea-form/`) counts the service's
rules live (`idea-rules.ts`: paragraphs x/3, characters x/600) and shows a 400's `message` as it is.
They read again after `IDEA_EVENTS` (`IdeaCreated`, `IdeaUpdated`, `IdeaArchived`,
`IdeaUnarchived`) whose `projectId` is the open project (each resource's `refreshOn`, narrowed by
`aboutProjectIdeas`). An idea's Create epic / Create ticket open `work/create` (`WorkCreatePage`,
`CREATE_WORK`, `work-writes.operations.ts`) filled from the query and sending `inspiredBy`; the work item page shows
and sets an item's inspiration (`patterns/ideas/work-inspiration/`, `SET_WORK_INSPIRATION` in
`core/work/work.operations.ts`, a `patchWork` of `inspiredBy` alone, which no recording holds yet,
so it has no pact interaction).

Needs (epic qits-1899): the one ordering mechanism, "item B needs item A at a status". An epic, a
ticket, a feature or a task carries `needs[]` (each need's item, the status it needs, where that
item stands now and whether it is `met`) and `unmetNeeds` on every work read; a need is met once
the needed item is at or past the status along the walk (DROPPED meets only a DROPPED need), and
qits-projects computes it on every read. Work lists, the board and the item page draw a "needs <n>"
badge while `n` needs are not met (`patterns/work/work-needs/work-needs-badge.ts`, `app-work-needs`,
ocean blue, dashed), its tooltip listing them (`qits-1897 at VERIFIED (now REFINED)`), apart from
the Blocked fact and an agent's wait; the word "waiting" is never used for a need. The item page's
Needs panel (`work-needs-panel.ts`, every archetype but ISSUE) lists them and adds or removes one;
each write is a `patchWork` of the whole `needs` list (`SET_WORK_NEEDS`, `[]` clears it),
after which the page reads the item and the project's work again (no event follows the edit, and
the answer omits the needs). A needed item's move is an `EntityTransitioned`, so the badges follow
it with the project's work. Campaigns, their members and milestones, and `dependsOn` are retired:
no tab, route, store or pact interaction reads them, and a CAMPAIGN row a read still carries
(until qits-1908 deletes them) is drawn nowhere (`WorkGraph`). The pact binds `needs[]` only in
the state that records one ("a ticket that needs another", from `@qits/projects-golden-masters`
2026.1106.140436 on; its interactions skip themselves on an older pin) and matches it at any length.

Work references in work text (qits-1898), with the same briefs and popover: `ui-markdown` takes the
project's slug as `workProject` and puts `@qits/ui-components`' `[qitsWorkRefs]` on its rendered
HTML, so every `<slug>-<n>` in the text (a code span's too, not a link's) becomes a reference after
the render; without `workProject` the HTML is exactly as rendered (dossier pages, ideas). The
detail bodies (`app-{epic,feature,task,ticket}-detail`, `SelectedProject.slug()`) pass it to the
description and to `app-work-comments` (`project`), and the Schedule tab to each acceptance
criterion. Plain-text work text renders through `<qits-commit-message>`: a ticket's impetus (a
`WorkField` with `workProject`; a field without one, an id or a name, stays text) and an open
issue's description on the Desk (`app-issue-description`, `slug`; each issue's own `WORK_ITEM`
read, qits-2146).

Work references in commit subjects (qits-1897): a release request's Commits tab (`ui-commit-graph`,
given the project's `slug` as `project`) and a pin's commits on the Changes tab
(`app-release-changes`, `slug`) draw each subject with `@qits/ui-components`' `<qits-commit-message>`,
so every `<slug>-<n>` in it is a work reference with the item's brief in a popover (hover or focus;
on a finger or a pen a tap, which neither presses the row nor follows a link around it). The briefs
come through this app's own projects client, not the library's default read (which needs a
`/main-navigation`): `workBriefSource` (`core/work/work-briefs.ts`, `listProjectWorkBriefs`,
the ids comma-separated in one `id`, `LIST_PROJECT_WORK_BRIEFS`), provided with `QITS_WORK_LINK` (`workLink`:
the exit `open-work-ref:opened` to `projects/:slug/work/detail/:id`, rendered through `QitsExit`,
so the link has a real `href`, records the outcome and carries `data-qits-outcome`; qits-2042) by
`provideWorkReferences()` in `app.config.ts`. A brief's panel
stays in the DOM for `aria-describedby`, so a row's `textContent` holds its text: read the message
element. `app-work-ref` behaves the same on a finger (`ui-popover`'s `tapToOpen`: the tap opens the
preview instead of following the tag, the id in the preview is the link).

Prioritising work (qits-753): the trees order siblings by `priority` (highest first, unranked
after every ranked one, then by number: `byPriority` in `core/work/work-tree.ts`). In the Backlog
(the roots, an epic's features, a feature's tasks) and on the board (the top-level epics and
tickets only) an open item carries a drag handle (`ui-drag-handle`, the finish button's twin on the
same corner); a drop is sent as `reprioritizeWork` with the sibling now directly below it
(`above`), or, dropped last, the one directly above it (`below`) (`reorderAnchor`, `WorkReorders`
in `core/work/work-reorder.ts`, `REPRIORITIZE_WORK`), and the answered priorities go
into `SelectedWork`'s read at once (`putPriorities`); a refusal reads the work again. Every work card, lane
and row the work patterns draw is a `uiReorderItem`, which needs a `[uiReorderList]` around it:
where the order is not the page's job (Acceptance, the Archive, the In Progress page's agents' lists, a work item's page) the
list is there and `reorderDisabled`, and a spec host drawing one item alone gives itself
`hostDirectives: [ReorderList]`.

Users today: the lightning menu shows the open project's release requests, read when the project opens
and again (at most once a second) after `RELEASE_REQUEST_EVENTS` about that project
(`core/projects/release-request-events.ts`; `ReleaseRequestStateChanged` is the only event a
wrapper's READY → RELEASED → FINALIZED sends; deployment events name no project, and count only
while a request is RELEASED; a rollback is `DeploymentFailed` with `status: ROLLED_BACK`). The
shell's own copy of the open project's requests (the sidebar's line, the trail, the agents' waits)
is `ProjectReleaseRequests` (`core/projects/`, qits-2146), a `qitsResource` over that request with
those events as its `refreshOn`; the shell hands it to the lightning menu, and the Release Requests
page reads it too, so the request is made once. The notifications menu reads the newest events through its own `qitsResource` on its first
opening and puts every new event at the top of its list once it is loaded. The bumps menu (the
lighthouse, `patterns/maintenance/bumps-menu/`) reads qits-maintenance's pending bumps
(`listPendingBumps`) through its own `qitsResource` on its first opening and again after
`BUMP_EVENTS` (`ReleaseRequestStateChanged` among them), at most once a second. Below them it
reads the edge's upstream pools (`getUpstreamPools`, `core/edge/edge.operations.ts`, on the page's
own origin; pact on qits-edge-service in state `an open upstream pool`, qits-2220) on every
opening; a refusal shows nothing.
The lightning menu's top line (`patterns/system/runner-slots/`, its own `qitsResource` over
`TARGET_LIST`, qits-2146) reads qits-system's targets on each opening until it loads, and again after `TARGET_EVENTS` (`TargetLeaseChanged`,
`TargetLoginChanged`, `TargetConnectionChanged`: a runner connecting or dropping). A person whose
roles may not read the targets gets a refusal, and the line stays hidden.
The lightning menu's active-run chips (`patterns/release-requests/active-runs/`, `activeRunsOf`)
read qits-ci's active runs (the menu's `qitsResource` over `ACTIVE_RUNS`, `/ci/api/runs/active`) on
each opening until they load, and again after `BUILD_EVENTS` of a pending request's repository
(`buildOfRepository`). The
release request page draws the same chips from its repository's runs.
The agents menu (the robot beside the lightning, `patterns/agents/agents-menu/`; epic qits-1681)
shows the open project's ACTIVE agents, read when the project opens and on each opening, and again
after `AGENT_STATUS_EVENTS` about the project (debounced 1 s): `ProjectActiveAgents`
(`core/workspaces/`, qits-2146), a root service holding that `qitsResource`, which the shell hands
the menu as an input (the trail names an agent from it too). Its waits' requests and items, like
`app-agent-status`'s, come from `OpenProjectWaits` (`ProjectReleaseRequests`, and the work
`SelectedWork`'s resource already holds once a work page wanted it, never read for the lines).
The agent pages (epic qits-1681; the sidebar's Agents, `AGENTS = 'agents'`, was Workspaces):
`projects/<slug>/agents` (`ProjectAgentsPage`) lists the ACTIVE agents, each linking
`agents/<agent id>` with its waits and attention (`patterns/agents/agent-status/`), then the slots
under a Workspaces heading with the Targets link (`open-system-targets`, the System section's
Targets page, qits-2351); `agents/<agent id>` (`AgentLayout`) reads the
agent by id through its own `qitsResource`s (qits-2146: `AGENT_DETAIL`, `getAgent`, and its slot's
start by the agent, `AGENT_START`, `getAgentActiveProcess`), its waits and attention from the
project's list (`ProjectActiveAgents`), shows its item (linked), its verbs, a Workspace field
(`ws-<slot id>` → `workspaces/<slot id>`) and the tabs (`AGENT_TABS`: `chat`, `files`,
`terminal`), which follow the layout's read through `OPEN_AGENT` (`core/workspaces/open-agent.ts`:
the layout provides itself under it, so the agent is one request for the page and its tabs). Redirects:
`workspaces` → `agents`; an item's old address `work/detail/<id>/agent[/<tab>]` (`WorkAgentLayout`,
still where the Workspace links on cards and the item page lead, as they know no agent id) finds
the item's ACTIVE agent (`ITEM_AGENTS`, `listAgents?workId=`) and replaces itself with its page on the same tab,
or with the item. `workspaces/<slot id>` stays, its agents linking `agents/<agent id>`.
The Agents page is the pilot of reading through `qitsResource` and of the data marks (qits-2143,
see "Reading through resources" below): it injects no store, and its staleness is its resources'
`refreshOn` (the same events and narrowing as below; its doc comment has the mapping).
The workspace pages (the Agents page's slots, a slot, an agent; epic qits-1230) read again after
qits-workspaces' lifecycle events (`WORKSPACE_EVENTS`, `core/workspaces/workspace-events.ts`) that
name their wrapper, slot, item or agent, at most once a second (each resource's `refreshOn`,
narrowed by `concerns`; since qits-2146 every workspace page reads through `qitsResource` over
`core/workspaces/*.operations.ts` and writes through `qitsMutation`, and no workspace store is
left). A project's
ACTIVE agents with their waits and attention (epic qits-1681, `ProjectActiveAgents`,
`listAgents?projectId=&state=ACTIVE`; the pure `core/workspaces/agent-attention.ts` turns a wait into
its subject's line and an attention into its action) read again after `AGENT_STATUS_EVENTS` (the
wait, activity and attention events, `AgentNudged` and `ACTIVE_AGENT_EVENTS`) whose `projectId` is
the open project, or, for those naming no project, an agent or repository already listed
(`aboutProjectAgents`). A container
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
`container-proxy` or `containerBase` in any of them, and it runs every operation the page calls,
addressed as the page addresses it, and fails on any request not to the agent's doors. The container proxy's addresses live in
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
the sign-in notice (`HARNESS_REPORT`, the daemon's `availableAgents`, `authenticated: false`, read
by the harness setup and handed to `app-sign-in-notice`; Open the sign-in terminal is
`SIGN_IN_TERMINAL`, `openSignInTerminal`, whose command the screen attaches to until it ends, at
`…/workspaces/container/<slot row id>/terminal/commands/<command id>`,
`containerTerminalSocketUrl`) and the plugins on the shared agent home (`app-plugins-section`'s own
`HOME_PLUGINS`, `listPlugins`, and `PLUGIN_INSTALL`, `installPlugin`), through the container proxy
(`core/workspaces/agent-sign-in.operations.ts`, `agent-plugins.operations.ts`; qits-2146).

The Repositories page's backup sign-in (qits-1268, from qits-projects-frontend's backup panel) is
the same `TerminalSocket` and `ui-terminal-screen` on another socket: qits-projects'
`wss://projects.<domain>/projects/api/repositories/<repo id>/remote-login` (`remoteLoginSocketUrl`,
`core/repositories/remote-login.ts`), drawn by `patterns/repositories/remote-login-panel/`. An
`AUTH_REQUIRED` last backup on any repository puts an alert with "Sign in to backup remote" above
the tree; otherwise the action sits in the page header. It signs in through the wrapper when that
has a backup remote, else through a repository that asked for it (the credential store is shared).
When the session ends (a clean close, or Close) the page does what the old panel did: it reads the
repositories again (the resource's `reload()`), nudges every backup (`qitsMutation(BACKUP_SYNC)`,
`POST /projects/api/projects/{projectId}/repositories/backup-sync`, `backupSyncProject` in the pact)
and says how many were scheduled. It does not read again on a timer (qits-1270 forbids refresh
timers, and qits-projects emits no event for a backup's outcome), so an "Auth needed" turns into
an outcome on the next read. A refused sync is a quiet note under the terminal and nothing more.

An agent's chat (`agents/<agent id>/chat`, `AgentChatPage`) shows the agent's transcript and a
prompt box. The transcript is the agent proxy's `log` (the tab's own `qitsResource` over
`AGENT_TRANSCRIPT`, `GET …/workspaces/agent/<agent id>/log?channel=TRANSCRIPT`, the daemon's
`getCommandLog` of the agent's command), read again (`reload()`) every 3 s while the agent is
RUNNING and once more when it stops; the lines
become items in `core/workspaces/chat-model.ts`, drawn by `patterns/workspaces/conversation/`. The
live screen is the Terminal tab; Interrupt and Stop are the agent page's verbs (the old chat
Terminate is gone). The agent's own chat socket (`agentChatSocketUrl`, `ChatSocket`: it replays the
whole conversation on open and takes `{"type":"user","text":…}`) is kept in `core/`, but the tab
does not open it: `getAgent` does not say whether a harness runs as a chat, and the service starts
every agent in a terminal. `patterns/workspaces/prompt-composer/` keeps the prompt as the agent's
draft on qits-workspaces (`core/workspaces/agent-prompt.operations.ts`: `PROMPT_DRAFT` read through
a `qitsResource`, `PROMPT_DRAFT_SAVE` and `PROMPT_DRAFT_DELETE` through `qitsMutation`, `GET|PUT|DELETE
/workspaces/api/agents/{id}/prompt-draft`, a 404 is no draft; saved 750 ms after typing stops),
refines rough notes in the agent's container (`PROMPT_REFINEMENT`, `POST …/workspaces/agent/<agent
id>/prompt-refinements`, the daemon's `refinePrompt`) and sends the prompt to the agent by its id
(`AGENT_PROMPT`, `POST /workspaces/api/agents/{id}/prompt`, `promptAgent`), which resumes a yielded or stopped agent to
hear it. The tab also reads the slot's hint channel (`WorkspaceHints`,
`/workspaces/api/workspaces/{id}/events` through `EVENT_SOURCE`): `prompt-draft` adopts another
device's draft (it reads the draft again). There is no speech input. The chat operations' pact
spec makes their calls at the daemon's own address, where the agent proxy forwards them, and binds
what the daemon answers there.

An agent's files (`agents/<agent id>/files`, `AgentFilesPage`) are its worktree on the slot's daemon, through
the agent proxy (`core/workspaces/agent-files.operations.ts`: `WORKTREE_FILES`, `WORKTREE_FILE`,
`WORKTREE_DETECTION`, `listFiles`, `readFile`, `detect` at `…/workspaces/agent/<agent id>/files`,
`/files/content`, `/detection`; their pact spec makes the same calls at the daemon's own address,
where the service forwards them, and binds what the daemon answers there): the whole eager tree in
one read (a `qitsResource`, as are the detection and the open file), every gitignored directory as
a dimmed stub opened one level per press (`WORKTREE_FILES`' `fetch`, as an ignore file is read
when its list is turned on), and the detection
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

The workspace pages' writes (qits-1243) go through `qitsMutation` (qits-2146) over
`core/workspaces/container-actions.operations.ts` and `agent-actions.operations.ts`: a slot's
container verbs on the slot's page only (`CONTAINER_ENSURE`, `CONTAINER_STOP`, `CONTAINER_RECREATE`,
`patterns/workspaces/container-actions/`: `ensure-`, `stop-`, `recreate-container`; Stop and
Recreate are confirmed naming the slot's agents, from `listWorkspaceAgents`, and afterwards name the
agents the answer's `affectedAgentIds` lists), the agent's own verbs on the agent page
(`AGENT_INTERRUPT`, `AGENT_STOP`, `AGENT_RESTART`, `patterns/workspaces/agent-run-actions/`, epic
qits-1667: Interrupt while RUNNING, Stop unless
STOPPED and Restart while RUNNING, YIELDED or STOPPED, the last two confirmed; `interruptAgent`,
`stopAgent`, `restartAgent`) and Discard on the agent page (`patterns/workspaces/agent-discard/`:
confirmed, then `force` after the service's 409). A STOPPED agent says so wherever its status shows
(`app-agent-status`, `runStateLabel`). A
refusal is shown in the service's words: each write reads the error body's `message` and `code`
(its `errorConsumes`, `REFUSAL`; `runRefusal` in `core/workspaces/refusals.ts` reads them off the
mutation's `QitsApiError`), and the pact binds them on each recorded refusal. After a
write the page reads its data again. No recording holds a
successful recreate or a forced discard, so their success paths are covered by plain specs only.

**The agent doors' recordings (epic qits-1667)** are qits-workspaces' `promptAgent`,
`getAgentActiveProcess`, `stopAgent`, `restartAgent`, `interruptAgent` and `listWorkspaceAgents`,
and `affectedAgentIds` on a stopped slot, in `@qits/workspaces-golden-masters` from 2026.1029.225748
on; the stores' pact specs bind them and the specs answer with them. The one answer still borrowed:
the agent page's screenshot of a start in flight, since `getAgentActiveProcess` is recorded only with
no start running; it shows the slot lookup's recorded live start (the same `{ technicalProcessId }`).

This app has no runners page of its own (epic qits-1481, ahead of qits-workspaces-service dropping
its runner doors in qits-1532): `WorkspaceRunnersPage`, `RunnersStore` and the
`patterns/workspaces/{runner-card,register-runner-form,install-line-panel}/` it used are retired.
Beside the Agents page's Workspaces heading, Targets opens the System section's Targets page
instead (`system/targets`, the in-app exit `open-system-targets` `open`, qits-2351), where execution
targets are now managed; its old cross-origin link (`PlatformOrigins.page('system')` +
`/system/targets`) answered 404, as `/system` is qits-system's API prefix. A slot's status strip no longer names which runner it is placed on
(`patterns/workspaces/slot-status/`, `placementNote` in `core/workspaces/agent-labels.ts`): the
field it read, `workspace.runner`, is gone from what this app consumes, ahead of the service
dropping it.

With no project open, the sidebar shows its global sections in the project's sections' place
(`globalLinks` in `layout/shell/shell.layout.ts`), above Network access: the sections that belong
to no project. A `GlobalLink` is one of two kinds. `kind: 'exit'` is a section of this app, a
router link through its declared exit (`[qitsExit]`, a `GlobalPath` with no params), current on
every page below it: Artifacts (`open-sidebar-artifacts`, `exit('artifacts')`, qits-2316), System
(`open-sidebar-system`, `exit('system')`, qits-2344), Mirror (`open-sidebar-mirror`,
`exit('mirror')`, qits-2357) and Orchestrator (`open-sidebar-orchestrator`, `exit('orchestrator')`,
qits-2359). Such a section may list its own pages below it
(`children`, qits-2346), as a project section does: rendered (not merely hidden, qits-2225) only
while the URL is within the section (`openGlobalChildren`), with the same markup, each its own
exit (a `GlobalPath`); the entry is then marked by `globalCurrentOf`, `currentOf`'s rule: `page`
on its own page, `true` while one of its pages below it is the current one (that page `page`).
System's are Services, Nodes, Configs and Targets (`open-sidebar-system-page`,
`services`/`nodes`/`configs`/`targets`, `exit('system/swarm/services')`, `exit('system/swarm/nodes')`,
`exit('system/swarm/configs')` (qits-2348), `exit('system/targets')` (qits-2351));
qits-2347…qits-2356 add one each.
Mirror lists none: its one listable page is the OCI upstreams `mirror` redirects to (qits-2358's
`mirror/repositories/<repository>` takes a param), so, as Artifacts, it is marked `page` on every
page below it; so does Orchestrator, whose one process (gc) is what `orchestrator` redirects to.
`kind: 'external'` leaves the app: IdP admin (`open-sidebar-idp-admin`, qits-2319,
`external('idp')`, same tab) for `PlatformOrigins.page('idp')` + `/idp/`, the idp's own admin
(qits-idp-frontend: clients, users, devices), standalone and not migrated here (owner, 2026-11-18);
page specs get an idp page origin from `provideAppRoute()`, so their screenshots show it; with no
idp origin (the server render) it has no address, is hidden by class and names
no outcome. With a project open the list is empty.

The Artifacts section (qits-2316) is qits-artifacts' store, which no project joins:
`artifacts/repositories/<repo>` (`ArtifactsRepositoryPage`), one of the store's repositories
(`qits` images, `npm`, `maven`, `daemons`, `docs`, `sboms`, `ci-screenshots`, `ci-videos`); `artifacts`
and `artifacts/repositories` redirect to `artifacts/repositories/qits`. It reads through
`qitsResource` over `core/artifacts/artifacts.operations.ts`: `ARTIFACT_REPOSITORIES`
(`listRepositories`: the header's type and "N items · size", and the switcher's links,
`switch-artifacts-repository`), then exactly one listing chosen by the type (`listingOf`,
`artifact-listings.ts`: `listImages`, `listNpmPackages`, `listMavenPackages`, `listDaemons`,
`listDocsSiteSummaries`, `listArtifactRecords`), none for a type without one (`sboms`). Each table
has a name search over the one answer. An image row's name opens the image's page here
(`open-artifact-image`, below), a maven row's coordinate the coordinate's page
(`open-maven-package`, below), a daemon row's name the daemon's page (`open-artifact-daemon`,
below), a docs site row's name the site's page (`open-artifact-docs-site`, below), and an npm row's
name the package's page (`open-npm-package`, below). No row leaves for the old explorer any more
(`open-artifacts-entry` is retired, qits-2326). qits-artifacts sends no domain event: Refresh reads again. The pact binds an empty
recorded listing by its status only (the shared database the provider verifies on holds other
suites' rows in the same seeded repositories), which still lets the `empty` screenshot show it.

`artifacts/repositories/<repo>/images/<image>` (`ArtifactsImagePage`, qits-2324) is one image of an
image store; `<image>` is one segment (a slashed name rides as `%2F`, which the router decodes and
the client encodes again). Three reads, nothing per row: `ARTIFACT_IMAGE_TAGS`
(`listImageTagSummaries`), `ARTIFACT_IMAGE_MANIFESTS` (`listImageManifestSummaries`) and
`ARTIFACT_IMAGES` (`listImages`, for the image's own row: "N tags · M manifests · <size> (union over
this image's blobs)"; when it fails the header says the size is unknown and the page stays up). The
tags newest push first (`newestPushFirst`), each with its manifest digest, referenced bytes (not
additive, which the caption says), pushed and last accessed ("Never" for null); the manifest
inventory with its tags ("Untagged" when none), media type, bytes, created and last accessed, and a
count of the untagged ones when there are some. Digests are shortened (`shortDigest`) until "Show
full digests" (`toggle-image-digests`, a stay: a page-local signal). "← <repo>" and a non-image
repository's note lead back (`leave-artifact-image`). A 404 on any read is "There is no repository
called <repo> in this store", a 400 "<repo> is not an image repository", and an image missing from
`listImages` with no tag and no manifest (the doors answer it with empty lists) "There is no image
called <image> in this repository". No event, no polling: Refresh reads all three again. The pact
reads both doors in "a store holding one artifact of every kind" and "an image with a manifest no
tag names" (with its `listImages`), each list at its recorded count (one image's, which no other
suite pushes), and in "a store with nothing published" by status only, as the empty listings above.

`artifacts/repositories/<repo>/cleanup` (`ArtifactsCleanupPage`, qits-2329, the old explorer's
`repositories/:repo/cleanup`) is what garbage collection would delete in one repository and what it
keeps, each identity with the rule that decided it, and the Run. The store repository page's
Cleanup leads there (`open-artifacts-cleanup`), "← <repo>" back (`leave-artifacts-cleanup`). One
read, `ARTIFACTS_CLEANUP_PLAN` (`core/artifacts/cleanup.operations.ts`, qits-orchestrator's
`planArtifactsCleanupRepository` on the `orchestrator` host: it reads the live pins and answers
qits-artifacts' plan verbatim): the type, "Plan as of `generatedAt`", the configured rule, `note`,
`error` (the type failed closed), "Not collected" for `strategy: null` (no figures, no lists), one
line per pin source (`source · N pins | did not answer · took ms`, its `outcome` beneath),
`pinFailures` when `executable` is false, the dead list with its count, reclaimable bytes and the
grace window's and the structural notes, and the kept list collapsed (`toggle-artifacts-cleanup-kept`).
The row-less pool (`untouchable`) is store-wide and not drawn. Run is drawn only when `executable`,
`error === null` and the dead list is not empty (absent, never disabled); the first press asks
(`ask-artifacts-cleanup-run`), the second sends `ARTIFACTS_CLEANUP_SWEEP` through `qitsMutation`
with `offline: 'online-only'` (never queued, never sent again by itself; a failure asks again from
the start), and the receipt (`patterns/artifacts/cleanup-receipt/`) replaces the plan
(`sweep-artifacts-repository`). A failure says what is known (`explainRun`): a 4xx did not run and
deleted nothing, in the service's words (409: a gc run is active; 403: not allowed); a 5xx or no
answer brought no receipt, so re-read the plan. Re-read the plan (header, or under a receipt,
`reread-artifacts-cleanup-plan`) drops the receipt and reads again. A 404 is "There is no repository
called <repo> in this store", a 403 names the gc roles. No event follows the store. The pact reads
both doors in "a repository the cleanup can plan" (`daemons`: one identity condemned, two kept, the
figures zeroed; its sweep withholds it, deleting nothing) and the plan in "a repository the cleanup
has nothing to delete in" (the dead list empty: no Run); the plans no recording holds (pins unread,
not collected, failed closed, withheld figures) are the plain spec's, derived.

`artifacts/repositories/<repo>/daemons/<daemon>` (`ArtifactsDaemonPage`, qits-2327) is one daemon of
a daemon store; a daemon name is bounded to `[a-z0-9][a-z0-9._-]{0,63}` by the wire, so it is one
plain segment. One read, nothing per row: `ARTIFACT_DAEMON_VERSIONS` (`listDaemonVersions`), "N
versions · newest first", the table in the wire's order: the version, its size (the version's own
blob, not totalled: the caption says the store page's figure is the union over the daemon), its
digest (`shortDigest`, the whole `sha256:` value in the cell's title), published and last accessed
("Never" for null; a note says a digest-addressed read does not move it). A version's button
downloads it (`download-artifact-daemon`, a stay reached on the press): `ARTIFACT_DAEMON_DOWNLOAD`
(`getDaemon`, `GET /artifacts/daemons/<daemon>/<version>`, the daemon wire, which carries no
repository segment, as a note says) through `HttpClient`, so `qitsBearerInterceptor` signs it, as a
Blob (`daemonDownloadParams`), saved through an object URL as `<daemon>-<version>`; a navigation
would carry no bearer. A failed download says so under the table. "← <repo>" and a non-daemon
repository's note lead back (`leave-artifact-daemon`). A 404 is "There is no repository called
<repo> in this store", a 400 "<repo> is not a daemon repository", and an empty list one sentence:
the daemon has no published versions here, and an unknown daemon answers the same (200 with no
versions). No event, no polling: Refresh reads again. The pact binds `listDaemonVersions` exactly
in "a daemon with two versions" and "a daemon nothing has published" (`contract-daemon` in
`daemons`, a contract name every state cleans up), and `getDaemon` in the first by status only (its
answer is bytes). No recording holds those bytes, so the browser spec answers the download with a
failure (`download-failed`), a status only, after checking its request.

`artifacts/repositories/<repo>/maven-packages/<coordinate>` (`ArtifactsMavenPackagePage`,
qits-2325) is one maven coordinate; `<coordinate>` is `groupId:artifactId`, one segment. Two reads
in parallel, nothing per row: `ARTIFACT_MAVEN_VERSIONS` (`listMavenVersionSummaries`) and
`ARTIFACT_SBOM_VERSIONS` (`listSbomVersions`, `maven` and the coordinate; its 404 means "no SBOMs",
not a failure, and any other failure keeps the table with its SBOM column "unknown" and a Retry).
The header shows the coordinate, its groupId and artifactId apart, and "N versions · M with an
SBOM"; the versions newest publish first (`newestPublishFirst`; the store answers oldest first),
their files sorted (`sortedFiles`) and wrapped, size, published and SBOM: `app-sbom-cell`
(`patterns/artifacts/sbom-cell/`, shared with the npm package page of qits-2326, so it takes the
package type and name and the page's two stays as inputs), "CycloneDX <specVersion> · <size>" with
Download, or "—". Download (`download-maven-sbom`, `saved` / `failed` stays, a failure said on its
row) reads `ARTIFACT_SBOM` (`getSbom`) as text through the generated client (the store wants the
bearer, so no bare link) and saves it as `<artifactId>-<version>.cdx.json`,
`application/vnd.cyclonedx+json` (`core/artifacts/sbom-download.ts`, browser only). The SBOM store
is a regex route over the raw path and 404s an encoded name (`eu.wohlben.qits%3Acontract-maven`,
`%40qits%2Fangular`), so `app.config.ts` also puts `literalSbomPaths` (`core/artifacts/sbom-paths.ts`,
qits-2325; the npm package page of qits-2326 relies on it for scoped names) on the artifacts client: `:`, `@` and `/` literal in `/artifacts/sboms/` wire URLs only (the
`/artifacts/api/` versions door takes the coordinate encoded). The specs that read SBOMs register
it as well and expect the literal URL, so an encoded one fails them. SBOMs of
versions the store no longer holds are counted under the table. A 404 is "There is no repository
called <repo> in this store", a 400 "<repo> is not a Maven repository" (linking its store page), an
empty list "There is no Maven coordinate called <coordinate> in this repository"; "← <repo>" and the
note's link lead back (`leave-maven-package`). No event, no polling: Refresh reads both again. The
pact reads the versions and the SBOM list in "a store holding one artifact of every kind" (one
version, the SBOM list a 404) and "a maven coordinate with an sbom on one of two versions" (two
versions, one SBOM, and its document by status and media type), and in "a store with nothing
published" by status only; every SBOM list's 404 by status only.

`artifacts/repositories/<repo>/docs/<site>` (`ArtifactsDocsSitePage`, qits-2328) is one docs site of
a docs store. Every site name is scoped and slashed (`@changelog/qits-qits`), and `<site>` is one
segment: `@changelog%2Fqits-qits` in the URL (the router keeps `@` literal), sent to the door as
`%40changelog%2Fqits-qits` (`literalDocsPaths` rewrites only `/artifacts/docs/` wire URLs, never
this `/artifacts/api/` door). One read, nothing per row: `ARTIFACT_DOCS_VERSIONS`
(`listDocsVersionSummaries`), "N versions · newest first" from its answer, the table in the wire's
order: the version, its file count, its size (the union of the version's own blobs; one caption
says the sizes do not add up), published, last accessed ("Never" for null), published from
(`publishedFrom`: `git.repository.name` · `git.branch.name` when present · the commit's 7
characters · `release.request.qualified-id` when present; "—" for none; plain text, the store
joins to no project) and Read (`read-artifact-docs-version`, `external('docs')`, same tab:
`PlatformOrigins.page('docs')` + `docsReadPath('/', site, version)`, qits-docs' reader, which
renders a changelog or an `openapi.yml` the old page's raw `index.html` link could not, until
qits-2337 moves the reader here). "← <repo>" and a non-docs repository's note lead back
(`leave-artifact-docs-site`). A 404 is "There is no repository called <repo> in this store", a 400
"<repo> is not a docs repository", and an empty list "There is no site called <site> in this
repository" (the door answers an unknown site 200 with no versions). No event, no polling: Refresh
reads again. The pact binds `listDocsVersionSummaries` exactly in "a store holding one artifact of
every kind" (`contract-docs-site`, one version on `main`) and "a docs site published by two
releases" (two versions whose metadata differ, the newer never read), and in "a store with nothing
published" by status only, as the empty listings above.

`artifacts/repositories/<repo>/packages/<package>` (`ArtifactsNpmPackagePage`, qits-2326) is one npm
package; `<package>` is one segment (`@qits/angular` is `@qits%2Fangular` in the URL; the router
decodes it). Two reads in parallel, nothing per row, and no `listRepositories`:
`ARTIFACT_NPM_VERSIONS` (`listNpmVersionSummaries`, the name sent encoded, as this `/artifacts/api/`
door takes it) and `ARTIFACT_SBOM_VERSIONS` (`listSbomVersions`, `npm` and the name; its 404 means
"no SBOMs", not a failure, and any other failure keeps the table with its SBOM column "unknown" and
a Retry). Both SBOM reads send the scoped name literally (`@qits/angular`) through qits-2325's
`literalSbomPaths` (above). The header shows the name in monospace, its scope and own
name apart when scoped (`splitPackageName`), and "N versions · M with an SBOM"; the versions newest
publish first (`newestPublishFirst`, a null `publishedAt` last), their dist-tags joined or "—", the
tarball's size or "not measured" (never totalled, as a caption says: each tarball is a separate
archive, and unmeasured rows cannot be summed), published or "not recorded", and the SBOM through
the shared `app-sbom-cell`. Download (`download-npm-sbom`) saves the document through
`sbom-download.ts` as `<name without its scope>-<version>.cdx.json`. SBOMs of versions the store
no longer holds are counted under the table. A 404 is "There is no repository called <repo> in
this store", a 400 "<repo> is not an npm repository" (linking its store page), an empty list
"There is no package called <package> in this repository"; "← <repo>" and the note's link lead
back (`leave-npm-package`). No event, no polling: Refresh reads both again. The pact reads the
versions in "a store holding one artifact of every kind" (`contract-package`, one version) and "a
scoped npm package with an sbom on one of two versions" (`@contract/contract-scoped`: two versions,
one SBOM, and its document by status and media type, the SBOM paths literal), and in "a store with
nothing published" by status only. Neither explorer state records the SBOM list for its npm
package (each records it once, for its maven coordinate, a 404 too), so the npm page's 404s bind
that recording's status only.

The System section (qits-2344) is qits-system's one swarm, which no project joins:
`system/swarm/services` (`SwarmServicesPage`, replacing qits-system-frontend's `swarm/services`);
`system` and `system/swarm` redirect to it, and qits-2345…qits-2356 add the section's other pages
under `system/...`, each listed below the sidebar's System while the section is open (Services,
Nodes, Configs and Targets so far, `open-sidebar-system-page`). It is an entry point (`qitsEntry`): the old page
hands off to it with a full-document load; the sidebar's System exit names `system`, which
redirects, and Services below it names it; a service's page
leads back to it by name (`leave-swarm-service`). It reads through `qitsResource` over `core/system/swarm.operations.ts`:
`SWARM_SERVICE_LIST` (`listSwarmServices`, `docker service ls` on the manager qits-system runs on,
one swarm, not per target), one table in the server's order: name (linking the service's page by
its name, `open-swarm-service`, qits-2345), state, mode, replicas, image and ports ("—" when none published); no
Updated column, as the list door answers `updatedAt: null` for every row. The state is derived
from `replicas` alone (`swarmServiceState`, `core/system/swarm-service-state.ts`): a trailing
` (…)` dropped, `R/D` with D > 0 and R = D is Running, 0 < R < D Degraded, R = 0 < D Down, D = 0
Stopped, anything else (`global`, empty) "—"; it is marked derived from `replicas`. An empty swarm
(`[]`) is one sentence; a 503 (swarm inactive, docker's socket missing or timing out: never an
empty fallback) says the swarm cannot be read right now, with Retry; a 403 names the roles.
Staleness: the resource's `refreshOn`, `DEPLOYMENT_EVENTS` (`core/updates/app-updates.ts`;
`DeploymentFailed` is also what a swarm rollback sends) → the whole list, debounced 1 s.
qits-system sends no event for a service, so a change outside a deployment (docker by hand, a
scale) is not followed: Refresh reads again. The pact reads it in "a single-node swarm" (two
replicated services, `1/1`) and "a swarm running no services" (`[]`; the interaction and the
`empty` screenshot skip themselves until the `@qits/system-golden-masters` pin records it), in its
own part of the system pact (`swarm.operations.pact.spec.ts`, `assertPactPart`).

`system/swarm/services/<id>` (`SwarmServicePage`, qits-2345, replacing qits-system-frontend's
`swarm/services/:id`, also an entry point) is one service, `<id>` its name or id (docker takes
either). One read, `SWARM_SERVICE` (`getSwarmService`, `core/system/swarm-service.operations.ts`,
its consumes in `swarm-service.consumes.ts`): "← Swarm services" (`leave-swarm-service`), the name
(else the id) with the full id in monospace; facts (mode, replicas as served, image, ports or "—",
created, updated, `formatInstant`); rollout (update order, parallelism, failure action, restart
condition, the healthcheck joined); the environment's keys only (the door never serves a value,
which the page says) and the labels as `key=value`; mounts (type, source, target, read-only; none
is "This service mounts nothing."); networks (the id shortened to 12 characters, the whole in its
title, and the VIP address); tasks in the served order, shut-down ones kept as the last rollout's
history (the caption says so): slot, node hostname (plain text: `nodeId` is always null), state,
desired state, the error (red only when non-empty), and an Image column only when some task runs
another image than the service's; no Updated column (`updatedAt` is always null). No task is "Swarm
has placed no task for this service…", a scheduling problem only when a replicated service asks for
replicas (`asksForTasks`) and "it asks for none" when scaled to 0, a 404 "No swarm service <id>.", a 403 the roles, a 503 the
swarm not answering, with Retry. Staleness: `DEPLOYMENT_EVENTS` of the application the service's
`qits.platform.deployments.app-name` label names (`concernsSwarmService`, `core/system/swarm-service.ts`;
every deployment while it has none or nothing is shown), debounced 1 s; Refresh reads again. The
pact reads it in "a single-node swarm" (`dev-qits-artifacts`, two mounts, two tasks, one Failed),
"a swarm service with no tasks" (`dev-qits-idle`, `0/0`) and "no such swarm service" (404, status
only), the last two (and their screenshots) skipping themselves until the
`@qits/system-golden-masters` pin records them, in its own part of the system pact
(`swarm-service.operations.pact.spec.ts`, `assertPactPart`).

`system/swarm/nodes` (`SwarmNodesPage`, qits-2346, replacing qits-system-frontend's `swarm/nodes`,
an entry point too) is the same swarm's nodes: `SWARM_NODE_LIST` (`listSwarmNodes`, `docker node
ls` on the manager), one table in the server's order: hostname (linking the node's page by its
id, `open-swarm-node`, qits-2347) with a neutral "this node" chip on the one qits-system runs on (`self`), docker's
12-character id (`shortSwarmId`, the whole id in `title`), role, status and availability (docker's
own words, each on a chip), manager status and engine version ("—" when empty: a worker has no
manager status). No Address column and no `address` in `LIST_SWARM_NODES`: the list door always
answers it `null`. The chips' tones are `core/system/swarm-node-tones.ts`, case-insensitive:
status Ready ok, Down failed, Unknown / Disconnected waiting, else neutral; availability Active ok,
Pause waiting, Drain and else neutral. An empty listing is one sentence ("The swarm manager lists
no nodes."), a 503 and a 403 as the services page. Staleness: no `refreshOn`. No event names a
node change (a join, a leave, a drain, a node going Down), so the page is not followed at all:
Refresh reads again; nothing polls. The pact reads it (`show-swarm-nodes`) in "a single-node swarm"
(one node, `fake-host`, the manager and Leader, `self`) and "a swarm listing no nodes" (`[]`;
the interaction and the `empty` screenshot skip themselves until the pin records it).

`system/swarm/nodes/<id>` (`SwarmNodePage`, qits-2347, replacing qits-system-frontend's
`swarm/nodes/:id`, an entry point too) is one node, `<id>` its id; the sidebar keeps System ›
Nodes current on it. Two reads in parallel, by the address's id, nothing per row: `SWARM_NODE`
(`getSwarmNode`, `docker node inspect`) and `SWARM_NODE_TASKS` (`listSwarmNodeTasks`, `docker node
ps`), both in `swarm.operations.ts`. The title is the hostname, "← Nodes" leads back
(`leave-swarm-node`); the full id in monospace with "this node" (neutral) when `self`; status and
availability on chips toned by `swarm-node-tones.ts` (the detail door answers the list's words,
`Ready`, `Active`, since qits-2347) and the manager status ("—" for a worker); facts: role, engine,
OS, architecture, CPUs (`8`, never `8.0`), memory (`formatBytes`), address ("—" when none) and
joined (`createdAt`, `formatInstant`; no `updatedAt`); the labels as `key=value` sorted by key,
none "No labels."; the tasks in the served order (newest first per slot, shut-down ones kept as
history, as the caption "N tasks …" says): name, slot ("—"), state as docker phrases it, desired
state, the error (red only when non-empty) and the image. No task is "Swarm runs no task on this
node.", a 404 "No swarm node <id>." (and nothing else), a 403 the roles, a 503 the swarm not
answering, with Retry; the tasks read fails on its own (its failure and Retry in the Tasks
section), the node's facts staying. Staleness: no `refreshOn`. No event names a node change or a
task moving, so neither is followed: Refresh reads both again; nothing polls. The pact reads both
(`show-swarm-node`) in "a single-node swarm" (`fake-host`, two labels, `self`, two tasks, the
second Failed and shut down), "a swarm node running no tasks" (its tasks `[]`) and "no such swarm
node" (`getSwarmNode` a 404, status only); its interactions and screenshots skip themselves until
the `@qits/system-golden-masters` pin records the node's tasks. Its four resource tabs
(containers, images, networks, volumes, local to the node qits-system runs on) are left to
qits-2352…qits-2355, each a child route of this page with a tab of its own.

`system/swarm/configs` (`SwarmConfigsPage`, qits-2348, replacing qits-system-frontend's
`swarm/configs`, an entry point too) is the same swarm's configs: `SWARM_CONFIG_LIST`
(`listSwarmConfigs`, `docker config ls` on the manager), one table in the server's order: name
(plain text until a config's page lands, qits-2349), docker's 12-character id (`shortSwarmId`, the
whole id in `title`), the labels (each `key=value` on a neutral chip, sorted by key, "—" when `{}`;
they say who owns a config, where the old page showed only their count), created and updated.
Created and Updated are the door's text verbatim, through no date parser or formatter: real
docker's `config ls` writes a humanized age (`2 months ago`), not an instant (only the fake docker
ever printed a timestamp); the exact instants are the config's own page's (`config inspect`). An
empty swarm is one sentence ("This swarm holds no configs.", what the estate shows today: nothing
in it creates a config), a 503 and a 403 as the services page. Staleness: no `refreshOn`. No event
names a config change, and no deployment creates or removes one, so the page is not followed at
all: Refresh reads again; nothing polls. The pact reads it (`show-swarm-configs`) in "a single-node
swarm" (one config, `qits-edge-vhosts`, labelled `qits.platform.deployments.target=platform`) and
"a swarm holding no configs" (`[]`; the interaction and the `empty` screenshot skip themselves
until the pin records it).

`system/targets` (`SystemTargetsPage`, qits-2351, replacing qits-system-frontend's `targets`, an
entry point too) is qits-system's execution targets. One read, `TARGET_ROWS` (`listTargets` with
its own consumes, `LIST_TARGET_ROWS`, beside the lightning menu's `TARGET_LIST`, whose
`show-runner-slots` row is unchanged; never `credentialVolume` or `engineId`), one card per target
in the server's order (`li[app-target-card]`, `patterns/system/target-card/`, the row as its
input): name, description and hostname; Connected / Disconnected, since when or last seen
(`formatRelativeTime`), the runner's version; a Quarantined chip with its reason and time and
Greenlight, only while quarantined; slots used of the total, and per type used, reserved and
maximum (`—`: no ceiling; `core/system/target-rows.ts`); each harness's sign-in (PRESENT / ABSENT
/ UNKNOWN, when checked), Check sign-in, the harness's sign-in flow (`app-target-sign-in`,
`patterns/system/target-sign-in/`) and its manual `loginCommand` / `kimiLoginCommand` behind a
disclosure with Copy (`app-copy-text`, `patterns/workspaces/copy-text/`); the last health check and
Run health check, Details reading `TARGET_HEALTH` (`getTargetHealth`, its body typed `unknown`,
read by `target-health.ts`; a 204 is "No health check has settled yet.") on opening; the node's
memory, only while reported; Leases reading `TARGET_LEASES` (`listLeases?targetId=`,
`core/system/leases.operations.ts`) on opening ("This target holds no leases." when none); Edit
(description and reservations, Save sends only what changed, `targetPatch`), Rotate registration
token (an optional slots total 0..1024, then the new one-time install line), and Delete, asked on
the first press and sent on the second, never queued (`online-only`), a `TARGET_BUSY` refusal
opening its leases. Below the cards, Declare a target (`patterns/system/declare-target/`: name,
description, reservations, an optional slots total; on 201 the one-time install line once, with
Copy, and the note that the token works once and is lost when the page is left, and that rotating
gives a new one), and View install script (`TARGET_INSTALL_SCRIPT`, read on opening into a
`<pre>`). The sign-in flow: Sign in to <harness> starts one (STARTING); AWAITING_BROWSER shows the
link and the device code, AWAITING_CODE the link and a code field whose Submit posts once per
state; Cancel until it settles; a terminal state is one sentence (`core/system/sign-in.ts`); a
`SIGN_IN_RUNNING` refusal follows the sign-in its message names; SUCCEEDED reads the list once.
Every write is an outcome of its own (`declare-target`, `edit-target`, `rotate-target-token`,
`greenlight-target`, `ask-delete-target`, `delete-target`, `request-target-health-check`,
`request-target-login-check`, `start-target-sign-in`, `submit-target-sign-in-code`,
`cancel-target-sign-in`), and a refusal stays on the card in the page's words
(`core/system/target-refusals.ts`: `TARGET_NAME_TAKEN`, `RESERVATIONS_EXCEED_TOTAL`,
`MAXIMUM_BELOW_RESERVATION`, `TARGET_BUSY`, `TARGET_UNAVAILABLE`, `SIGN_IN_RUNNING`,
`SIGN_IN_NOT_AWAITING_CODE`, `SIGN_IN_NOT_FOUND`, a 403's admin role, a 503's commissioning).
`[]` is "No targets are declared yet." with the form still shown; a 403 names the read roles; any
other failure says the targets could not be read, with Retry. Staleness: the list's `refreshOn`,
`TARGET_EVENTS`, `TargetDeleted` and `TargetOomKilled` → the whole list, debounced 1 s; an open
Leases follows `TargetLeaseChanged` naming its target (`payloadField(event, 'targetId')`). A
created, patched or greenlit target, a rotated token and a health check's result publish no event:
the page reads the list again after each of its own writes, and Refresh covers a change made
elsewhere (the CLI, another person). A sign-in that has not settled is read again every 2 s
(`pollWhile`, above), never otherwise. The pact (`targets.operations.pact.spec.ts`, beside the
lightning menu's row; `leases.operations.pact.spec.ts` for the leases) reads the list in "a
connected target with leases", "a declared target", "a quarantined target" and, empty, "no target";
declaring and the install script (status and media type: the recording holds the script as a JSON
string, so no screenshot shows it) in "no target"; patch, delete (204) and health in "a declared
target", with the two checks' 409 TARGET_UNAVAILABLE as refusal rows, and their 202s in "a connected
target"; greenlight in "a quarantined target"; a rotation in "a registered runner"; a sign-in
started in "a connected target", and followed, given its code and cancelled in "a connected target
with a claude sign-in awaiting its code"; a target's leases, `listLeases` with `targetId` as a
query, in "a connected target with leases" (recorded as the index's `query` from
`@qits/system-golden-masters` 2026.1121.45745 on; the earlier recording wrote it into `path`, which
no request matches, so the row waits for one with no `?` in it). The provider states are named
once, in `src/testing/system-states.ts`.
The Mirror section (qits-2357) is qits-mirror's pull-through caches, which no project joins:
`mirror/upstreams` (`MirrorUpstreamsPage`, replacing qits-mirror-frontend's `upstreams`), at
`https://qits.<domain>/mirror/upstreams`; `mirror` redirects to it, and one cache root's page is
`mirror/repositories/<repository>` (below). It is an entry point (`qitsEntry`): the old page hands off to it
with a full-document load, and the sidebar's Mirror exit names `mirror`, which redirects. It reads
through `qitsResource` over `core/mirror/upstreams.operations.ts`: `UPSTREAM_LIST`
(`listUpstreams`, `GET /mirror/api/upstreams`, `{ upstreams: [...] }` in namespace order), in the
browser only, one table in the server's order: host (mono, the name a docker client uses, the row's
identity), namespace (mono, the local segment of `mirror.<domain>/<namespace>/<image>`), cached
images (distinct image names, 0 is normal) and registered (`createdAt`, `formatInstant`, marked
derived), with "N mirrored registries" above it and a note below that npm and maven have one
upstream each (a deployment setting), so only image registries are a list. `upstreams: []` (an
operator deleted them) is one sentence; any failure (a 5xx when the database cannot be read: never
an empty fallback) says the upstreams cannot be read right now, with Retry. Staleness: no
`refreshOn`. qits-mirror sends no event when an upstream is registered or deleted or an image is
pulled through, so none of it is followed: Refresh reads again (a known gap). The pact
(`upstreams.operations.pact.spec.ts`) reads it in "the default caches" (the
three default registries) and "a mirror fronting no registries" (`upstreams: []`, recorded from
`@qits/mirror-golden-masters` 2026.1120.232746 on; the interaction and the `empty` screenshot skip
themselves on an older pin), in its own part of the mirror pact (`assertPactPart`).

`mirror/repositories/<repository>` (`MirrorRepositoryPage`, qits-2358, replacing
qits-mirror-frontend's `repositories/:repository`, an entry point too: the old route hands off to
it, and qits-2471's list at `mirror/repositories` will link here) is one pull-through cache root, at
`https://qits.<domain>/mirror/repositories/<name>`. It reads `REPOSITORY_PACKAGES`
(`core/mirror/repository-packages.operations.ts`, `listRepositoryPackages`,
`GET /mirror/api/repositories/{repository}/packages`: the root's row and every package with its
versions, not paged), in the browser only, and keeps the server's order. The header is the name
(mono), the type on a chip, "a cache of <upstream>" (a null upstream, an OCI namespace whose
upstream was deleted, says it serves what is cached and fetches nothing new) and
"N packages · M cached versions · <size>" (`images` for `oci-mirror`, `coordinates` for
`maven-proxy`; binary `formatBytes`). The eviction line is the type's window from the row's
`evictionWindow` (ISO-8601, `evictionWindowWords` in `core/mirror/eviction-window.ts`: `P30D` is
"30 days", anything but whole days shown as written): "Entries unused for 30 days are evicted by the
next sweep.", or "This cache is not swept: nothing is evicted." when it is null (eviction off).
Pins are a gap the page states rather than draws: an image pin from qits-maintenance reaches the
mirror only in the body of each sweep, so for `oci-mirror` it says one sentence (a pinned tag is
kept whatever its age; the pins are not shown here), and it claims no per-version verdict (only a
`qits:system` dry run knows one). A name search (`searched`) narrows the packages table (name, versions,
size, last used, `never` when null); a package's name is a button (`aria-pressed`,
`select-mirror-package`, reads nothing) that shows its versions below (version, or for OCI the
digest shortened to `sha256:` + 12 hex with the whole in `title`; tags as chips, `—` when none;
files for `maven-proxy` only, the count with the names in `title`; size; cached; last used), the
first shown package selected until another is pressed. `packages: []` (nobody pulled through yet,
every root on a fresh deployment) is "Nothing is cached in <name> yet."; a 404 (an unknown name) is
"The mirror has no cache root called <name>." with no Retry; any other failure is a load failure
with Retry. Staleness: no `refreshOn`; qits-mirror sends no event when a client pulls through, an
entry is evicted or a sweep runs, so Refresh reads again (a known gap). Its pact
(`repository-packages.operations.pact.spec.ts`, `show-mirror-repository`, its own part of the
mirror pact) reads it in "a mirror holding a pinned and an unpinned tag" (`hub`, two tagged
digests), "a maven cache holding a cached artifact" (`central`, a jar and a pom), "an npm cache
holding a package" (`npmjs`, `left-pad`), "the default caches" (`hub`, `packages: []`) and "no cache
root of that name" (404, status only); all but the npm one, and their screenshots, skip themselves
until the `@qits/mirror-golden-masters` pin records them (qits-mirror's qits-2358 release).

The Orchestrator section (qits-2359) is qits-orchestrator's technical processes, which no project
joins: `orchestrator/processes/<kind>` (`OrchestratorProcessPage`, replacing
qits-orchestrator-frontend's `processes/:kind` and its `''`), at
`https://qits.<domain>/orchestrator/processes/gc`; `orchestrator` and `orchestrator/processes`
redirect to `processes/gc` (gc is the only process; a list page waits for a second). It is an entry
point (`qitsEntry`), where the old pages hand off, and the sidebar's Orchestrator names
`orchestrator`. It reads through `qitsResource` over `core/orchestrator/processes.operations.ts`, in
the browser only: `PROCESS_LIST` (`listProcesses`: the title, the lede, whether the kind exists),
`PROCESS_RUNS` (`listProcessRuns`, the latest 20, newest first: status, Started linking `?run=`
(`open-orchestrator-run`), took, trigger with a "dry run" chip, the summary clamped to two lines)
and `PROCESS_RUN` (`getProcessRun` with `bodies=false`, always: the old page re-read the whole run,
2.8 MB for a running gc run, every 2 s). The shown run is `?run=` (else the newest), its steps a
board in columns by dependency depth (`core/orchestrator/step-columns.ts`, ported from the old
`board/layout.ts`, no wires); a card's press opens the step below (`?step=`,
`open-orchestrator-step`, replaced, a second press closes it), whose call is one more read,
`PROCESS_RUN_STEP` (`getProcessRunStep`: request body and response, the response collapsed behind
"Show <responseBytes>"). Dry run starts `{ dryRun: true }` at once (`start-orchestrator-dry-run`);
Run now asks first (`ask-orchestrator-run`) and its second press sends `{ dryRun: false }`
(`start-orchestrator-run`), both through `qitsMutation`, `online-only`, never disabled while a run is
active: a 409 is said in the service's words and the newest run shown, a 403 says the role, anything
else that whether a run started is not known (`explainStart`, `core/orchestrator/process-runs.ts`).
Staleness: qits-orchestrator publishes no event. A RUNNING shown run is read again every 10 s while
the page is visible (`pollWhile`); when it leaves RUNNING the list is read again, and an open step
whose status moved; a failed poll keeps the run and says so. The gap: a run started elsewhere (the
deploy trigger, another operator) shows only after Refresh (qits-2472). The pact
(`processes.operations.pact.spec.ts`, its own part of the orchestrator pact beside cleanup's,
`assertPactPart`) reads the process in "the gc process", the runs, the run and `artifacts.plan`'s
step in "a finished gc dry run", the runs in "the gc process before its first run" (`[]`), the runs
and the run in "a running gc run", and Dry run's 202 in "no active gc run" and 409 in "a running gc
run"; no recording holds a real start, so Run now's request is the page's plain spec's. Every
interaction and screenshot skips itself until the `@qits/orchestrator-golden-masters` pin records
these states.

Network access (epic qits-1977) is not this app's any more (qits-2361): the page that registers a
device and hands out its WireGuard config is qits-network-access' own frontend
(qits-network-access-frontend), served at `https://network-access.<domain>/` by
qits-network-access-service, which stays public so a person off the tunnel can still join it. The
top bar's network icon (from 768px, `open-network-access`) and the sidebar's Network access entry
below the project's sections (shown with or without a project open and in the phone's burger,
`open-sidebar-network-access`, qits-2262) are plain links to it, `PlatformOrigins.page('network-access')`
followed by `/`, each an `external('network-access')` outcome marked with `[qitsTriggers]`: a plain
primary click records it and leaves through `QITS_LEAVE_APP`, which the shell's browser spec replaces
with a spy.

The top bar's menus are built on `ui/components/dropdown/` (`ui-dropdown`): the trigger and the
panel are projected, `opened` fires on each opening.

A project's Events page (qits-2312, `projects/<slug>/events`, `ProjectEventsPage`) reads the
project's events through its own `qitsResource` over `PROJECT_EVENTS_LIST` (`listEvents` with
`attr=projectid=<id>&order=desc&limit=50`, plus `name`, `since`, `q`, further `attr`s and `cursor`
only when a filter sets them; built by `projectEventsQuery` in `core/events/project-events.ts`),
"Load older" through its `fetch` by `nextCursor`, and the type filter's names through `EVENT_NAMES`
(`listEventNames`). Live frames come through `DomainEvents` and are put at the top when
`matchesProjectEvents` lets them through (the project by `payloadIds().projectIds`, which reads
`entities[].projectId` too); none while "until" is set, held while paused. A row names what the
payload concerns (`eventSubjects`) and links a release request and a work item
(`open-project-event-subject`); an agent is named, not linked, as no recording names one. A row's
Open link leads to the event's own page (`open-project-event`); the inline JSON stays.

One event (qits-2338, `projects/<slug>/events/<id>`, `ProjectEventPage`, ported from
qits-events-frontend's event page) reads the event through its own `qitsResource` over
`PROJECT_EVENT` (`getEvent`) and shows it only when its payload names the project
(`belongsToProject`, `payloadIds().projectIds`); a 404 or another project's event is "No event <id>
in this project.". It shows the header (name, badge, `eventGist`'s repository · gist, the
`eventSubjects` with a release request linked), the facts (cause linked,
`open-related-project-event` `cause`), the payload (`renderPayload`: sorted keys, raw when not
JSON) and the chain: `walkChain` (`core/events/event-chain.ts`, the old `ChainWalker`) walks up by
`parentId` through `PROJECT_EVENT`'s `fetch` (a 404 cause is the chain's start) and down from the
start through `EVENT_CHILDREN` (`listEvents?parentId=`), capped at 32 hops up, 8 levels down and 200
events, and `app-event-chain` (`patterns/events/event-chain/`) draws it, each other event of the
project linking its page (`open-related-project-event` `chain`). The walk is an Angular `resource()`
of its own, so its failure (with Retry) leaves the event on screen. A work item the event names is
not linked here: no recording this page reads names one.

A project's Docs page (qits-2318, `projects/<slug>/docs`, `ProjectDocsPage`, the sidebar's Docs
between Observability and Events) reads qits-artifacts' whole docs catalog through its own
`qitsResource` over `DOCS_CATALOG` (`listDocsSites` of the `docs` repository; never
qits-docs-service) and groups it by `core/docs/doc-sections.ts` (`DOC_SECTIONS`, `kindOf`,
`shortNameOf`, ported from qits-docs-frontend: a section claims its scope, Storybook gets the
rest). The view lives in the query (`?section=<route segment>`, `?q=`), pushed, so Back undoes it.
A row opens the site's reader in this app (`open-docs-site`, `docs/read/<site>`, the newest of
`main`). The docs store sends no domain
event: Refresh reads again. Its pact interactions (states "a docs catalog of every kind" and "an
empty docs catalog") skip themselves on an older `@qits/artifacts-golden-masters` pin.

A repository's Docs page (qits-2336, `projects/<slug>/docs/repositories/<repo>`,
`RepositoryDocsPage`; a fixed `repositories` segment, so a name never reads as a reader path under
`docs/`) lists the catalog's sites whose newest version the repository published: the catalog's
`latestRepository` (the newest version's `git.repository.name`, `publishedBy`), never the site's
name (`@contracts/qits-ci` is `qits-ci-service`'s) and never one `listDocsVersions` per site. It
finds the address's name in the project's repositories (`PROJECT_REPOSITORY_NAMES`,
`repositoryNamed`; an unknown name says so) and keeps `?section=`, which the docs app's old
repository addresses redirect to. The project's Docs page names a row's repository when the project
holds it (`projectRepositoryOf`), and every repository card has a `Docs →`; both are
`open-repository-docs`. `DOCS_CATALOG` and `PROJECT_REPOSITORY_NAMES` are `listDocsSites` and
`listProjectRepositories` with consumes of their own (`LIST_DOCS_CATALOG`, `REPOSITORY_NAMES`):
the states the builder's and the cards' interactions are recorded in hold no `latestRepository`
or `lastBackup`, and a path the recorded body lacks cannot be bound.

The docs reader (qits-2337, `projects/<slug>/docs/read/<site>[/-/<version>]`, `DocsReaderPage` in
`routes/projects/[slug]/docs/read/[site]/`) reads one site of qits-artifacts' public docs store,
never qits-docs-service. The site spans segments: this app's links name it as one segment (`:site`,
its `/` escaped, an exit's param) and `read/**` (an entry, `qitsEntry`) takes the split form the
docs app's redirect writes; the page parses either off the URL (`parseReadPath`,
`core/docs/doc-url.ts`), so all three routes load the one page, and `read/:site/-/:version` carries
an `eslint-disable` of `qits/route-matches-directory`. Its outcomes are the `read/:site` route's;
the one shown only on a versioned address (an unknown version's link to the newest,
`leave-docs-site` `newest`) is declared app-wide in `core/docs/reader-links.ts`. Markdown sites
(userflows, guides, changelog) read `DOCS_VERSIONS`, `DOCS_VERSION` and each `.md` (`DOCS_FILE` as
text; `core/docs/bundle-files.ts`), drawn by `ui-markdown` with each `mermaid` fence split out to
`<qits-mermaid-diagram>` (`markdownParts`) and relative images resolved to the docs store
(`bundlePathOf`); `?category=` keeps one category; the Version and Branch selects
(`core/docs/doc-versions.ts`) navigate (`pick-docs-version`). API docs draw `openapi.*` with
swagger-ui (`swagger-ui-dist`, a lazy browser-only import; its stylesheet the non-injected global
style `swagger-ui.css`, `angular.json`, served `no-cache`), `supportedSubmitMethods: []`. Contracts,
routes and Storybook sites read the catalog only (`DOCS_CATALOG`) and hand off
(`open-docs-handoff`): the publisher's Contracts page or UI builder when it is the project's
(`PROJECT_REPOSITORY_NAMES`), Storybook to the docs app (`PlatformOrigins.page('docs')`, the only
link left to it). The release page's docs and userflows artifacts link it at the released version
(a plain in-app `href`, `readerPath`: no recording holds a docs artifact, so an exit could not be
followed by a spec); the UI builder's call popover and outbox link the provider's Contracts page
(`open-call-contract` `contracts`, `core/contracts/contracts-links.ts`), and the contracts frame has
no docs link. Its pact interactions and screenshots skip themselves until the
`@qits/artifacts-golden-masters` pin holds the reader's states.

A CI run's page (qits-2321, `projects/<slug>/ci/runs/<runId>`, `CiRunPage`, declared ahead of every
other CI page) reads the run once through its own `qitsResource` over `RUN` (`getRun`) and joins it
to the project by `run.repoId` among `PROJECT_REPOSITORIES`' ids (never `projectId`); a run of
another project, or a 404, is "No run <id> in this project". Step output keeps its colour:
`core/ci/ansi.ts` (`ansiSegments`) turns SGR bold, the 16 colours and reset into text in spans with
theme-token classes and drops every other escape, never HTML and no xterm; a step qits-ci cut to
its tail (`[... output truncated ...]`) says so instead of showing the marker (`stepOutput`). The
open rows are `?step=` (repeatable, `live` for the live step, an empty value for none; replaced, not
pushed), else the first FAILED/TIMED_OUT step, the live step or the last (`openSteps`). Cancel
(confirmed, `CANCEL_RUN`) and Run again (`RETRY_RUN`, then the new run's page) are its outcomes
`cancel-ci-run` and `retry-ci-run`. Every in-app link to a run goes through `CiRunLinks`
(`core/ci/ci-run-links.ts`, the one app-wide exit `open-ci-run:run`): the project's CI page, a
repository's CI page (rows and "newer run"), a release request's builds, lifecycle, automations,
reports and active-run chips. Its repository name opens that repository's CI page
(`projects/<slug>/ci/<repository>`, qits-2320). It follows
`BUILD_EVENTS` naming the run (`buildOfRun`), and, the one poll qits-1270 allows, reads a RUNNING
run again every 10 s while the document is visible (`pollWhile` in `core/events/poll-while.ts`):
the live step's output has no event. A queued or finished run is never polled.

## Backend origins

Where each platform application answers comes from code, not from the network: inject
`PlatformOrigins` (`core/platform/platform-origins.ts`). The app reads `/main-navigation` for one
thing only: which applications are on the private network (below), never for an address.

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

### The door is private, and the service worker leaves cross-origin requests alone

The app is served from the private address (`exposure: private`, qits-2360): the door
`qits.<domain>` resolves to the tunnel, like the private apps the page calls, so none of those
calls is a Local Network Access call (Firefox reset them, Chrome asked for a permission). qits-2297's
marking and its notice are gone with that. Off the tunnel the door does not answer; joining is
through the public network-access page (qits-2361) and the idp.

The app registers `sw.js` (`public/sw.js`), not `ngsw-worker.js`: its first `fetch` listener stops
every request to another origin before ngsw sees it and does not answer it, then it
`importScripts('ngsw-worker.js')`, so a cross-origin call is the page's own. `sw.js` is served
`no-cache` (`UNHASHED`, `src/server.ts`) and kept out of ngsw's asset cache (`ngsw-config.json`);
`core/updates/service-worker.spec.ts` runs it against a fake worker scope.

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
`$QITS_OBSERVABILITY_URL`, else its edge host `https://observability.qits.$QITS_DOMAIN`, else (no
domain: a workstation run) `http://${QITS_ENVIRONMENT:-dev}-qits-observability:8080`, plus
`/observability/api/otel/v1/<signal>`. The app is private (qits-2360), so the qits-net alias does not
resolve from its container, and the edge refuses an anonymous POST to the receiver: every export,
the browser's relayed ones included, carries a `client_credentials` bearer of the app's own idp
client (`resources: idp:client`; `src/server/idp-token.ts` reads `QITS_RESOURCE_IDP_URL`,
`_CLIENT_ID` and `_CLIENT_SECRET`, caches the token, takes another 30 s before it expires, and on
failure logs once per change and exports without one). `service.name` is `qits-landing`; the rest of the resource
comes from `OTEL_RESOURCE_ATTRIBUTES`, which the deployer sets. The code is in `src/server/`. It
starts only when `server.mjs` runs as the server, never under `ng serve`, the build or the tests;
`OTEL_SDK_DISABLED=true` turns it off. Nothing patches modules (the bundle holds express): server
spans come from a middleware, fetch spans from the undici diagnostics channels, and every
`console` call is also a log record.

The browser half is `@qits/angular` (`initQitsIntegration()` in `main.ts`). The server serves its
contract: `GET /api/config.json` (the relay, `telemetry: null` when the server's telemetry is off)
and `POST /api/otel/v1/{traces,logs}` (the body forwarded unchanged to the receiver, signed with
the server's bearer). Each rendered page
carries `<meta name="traceparent">`, so the browser's page load joins the render's trace.

The Observability section (qits-2313): `projects/<slug>/observability` is a parent route with no
component whose pages are its children, one route per view (logs, errors, metrics, slow spans,
traces and one trace); its own address redirects to `logs` by a relative
`redirectTo`, which keeps the query. The sidebar's Observability entry lists the section's pages
below it while one is open (`open-sidebar-observability-page`). `observability/logs`
(`ObservabilityLogsPage`) reads qits-observability's telemetry buffer through `qitsResource` over
`core/observability/observability.operations.ts` (`TELEMETRY_SOURCES`, `listTelemetrySources`;
`TELEMETRY_LOGS`, `searchTelemetryLogs`), on the `observability` host: the SERVICE sources with
their counts and reach (`oldestReceivedAt`), and the chosen one's lines newest first (the service
answers oldest first, at most 200). The view lives in the query, with the retired
qits-observability-frontend's names so its bookmarks forward as they are: `source` (a source key),
`level` (→ `minSeverity`, absent: all), `q` (→ `query`) and `since` (minutes → `sinceMinutes`,
absent: everything buffered). Only `qits:admin`, `qits:admin-agent`, `qits:desk-admin` and
`qits:agent` may read telemetry; a 403 says so. No domain event follows the buffer: Refresh reads
again. The source picker is one pattern both pages show (`app-telemetry-source-picker`,
`patterns/observability/source-picker/`, the page's sources read as its input); what the pages
share of a record (time ranges, a line's time and level, a refusal, `service.version`) is
`core/observability/telemetry.ts`. `observability/errors` (`ObservabilityErrorsPage`, qits-2339,
the retired frontend's `errors`) reads `TELEMETRY_ERRORS` (`listTelemetryErrors`) by `source` and
`since` (→ `sinceMinutes`) only, never before a source is chosen (a sourceless read answers an
empty list, which would claim "no errors" about nothing): one row per group, in the service's
order with the uncorrelated group (empty `traceId`) last, headed by its exception (`type:
message`), else a span's status message, else a log's body (`core/observability/error-groups.ts`,
ported from the old `error-group.ts`), expanding to its spans (stack trace included) and logs. Each
row's Error logs opens `observability/logs?source=…&level=ERROR` (`open-telemetry-error-logs`); a
correlated group's trace id opens its trace page (`open-telemetry-trace`, qits-2343; the
uncorrelated group's empty id stays text). No recording holds an uncorrelated group, an empty
list or a truncated answer, so those are the page's plain spec's, derived from the recorded group.
`observability/metrics` (`ObservabilityMetricsPage`, qits-2340, the retired frontend's `metrics`)
reads `TELEMETRY_METRICS` (`listTelemetryMetrics`) by `source` alone, never before a source is
chosen: one latest point per series and no history, which the page says, so nothing is charted over
time and no points are gathered across reads. One card per metric name, sorted by name; a name with
two or more series is a bar per series (sorted by the series key `name|k=v|k=v`, labelled by its
attributes and value, its length the value over the card's largest; series are never summed), one
series is its value as a large figure; the type (GAUGE, COUNTER) is shown, never drawn by. The
grouping, bar geometry and value formatting (`By` in binary units, integers as integers, six
significant digits, exponential under 1e-4; `unitGloss`) are `core/observability/metric-series.ts`,
ported from the old `metric-series.ts`. `?name=` narrows the cards by a case-insensitive substring
in the browser; the door's own exact `name` is never sent. No recording holds a name with several
series, so the bars are the page's plain spec's, derived from the recorded series.
`observability/slow-spans` (`ObservabilitySlowSpansPage`, qits-2341) reads `TELEMETRY_SLOW_SPANS`
(`listSlowSpans`), never before a source is chosen, with three lenses in the query: `threshold`
(the floor in ms: 500, the default and absent, 1000, 100, 10 or 0 "Any duration"; always sent as
`thresholdMs`, so the default read is the source and `thresholdMs=500` alone), `sort=recent`
(newest first, sent as `sort`; absent, slowest first, sends none) and `since` (→ `sinceMinutes`);
never `limit`, `service` or `name`. One row per span in the door's order: its duration (ms under a
second, else seconds with one decimal), name and kind, which call (`url.full`, else `http.route`),
an ERROR chip and an exception marker (any event with `exception: true`), its start, its
`service.version` and its trace id, which opens its trace page at the same source
(`open-telemetry-trace`, qits-2343). A truncated answer says "Showing the slowest (newest)
N of T matching spans". An empty one says why, in order: the source holds no spans (its source
row's `spans` is 0), none reaches the floor (when above 0, offering Any duration), none falls in
the time range (when set, offering Everything buffered). The formatting and the empty reason are
`core/observability/slow-spans.ts`. The recording answers the default read only, so the other
lenses, a truncated answer and the empty reasons are the page's plain spec's.
`observability/traces` (`ObservabilityTracesPage`, qits-2342, the retired frontend's `traces`)
reads `TELEMETRY_TRACES` (`listTelemetryTraces`), never before a source is chosen, with the old
frontend's query names so its bookmarks forward, each sent only when it is not the door's default,
so the default read is the source alone: `sort=duration` (slowest first, sent as `sort`; absent,
newest first, sends none), `threshold` (the floor in ms: 0 "Any duration", the default and absent,
10, 100, 500 or 1000, and any other positive whole number a bookmark carries; sent as `thresholdMs`
above 0, nonsense reads as 0), `service` (the traces any of whose spans is that service's; its
options are the chosen source row's `services[].name`, the select hidden when it lists none, "All
services" clears it) and `since` (→ `sinceMinutes`); never `limit`. `view=flat` draws one row per
trace and changes no request; absent, the rows are grouped by path
(`core/observability/trace-groups.ts`, ported from the old `trace-group.ts`: keyed by `rootRoute`,
else `rootName`, else `(unnamed span)`; groups and members in the door's order, never re-sorted), each group row
its path, trace count, slowest duration, newest start, services, an "N errored" chip and an
exception marker, expanding (a signal, not the URL) to its traces. A trace's row: its duration,
root name ("(root not buffered)" when `rootMissing`), an error count chip and an exception marker,
root service, span count, services, start and its trace id, which opens its trace page at the same
source (`open-telemetry-trace`, qits-2343).
A truncated answer says "Showing the newest (slowest) N of T matching traces". An empty one says
why, in order (`core/observability/traces.ts`, with the lens parsing and the query): no source
chosen, the source holds no spans, the service is not one of the source row's (offering All
services), none reaches the floor (offering Any duration), none falls in the time range (offering
Everything buffered). The recording answers the default read only, so the other lenses, the flat
view, a truncated answer and the empty reasons are the page's plain spec's; the pact's mock
answers each array with its first recorded element, so the pact spec checks the recorded order
and the errored trace on the recording itself.
`observability/traces/<traceId>?source=` (`ObservabilityTracePage`, qits-2343, the retired
frontend's `traces/:traceId`, whose `?source=` it keeps) is one trace of one source, a detail page
with no sidebar entry (the sidebar keeps Observability current). It reads `TELEMETRY_TRACE`
(`getTelemetryTrace`) by the path's trace id and `source` alone, never `repositoryId` or
`workspaceId`, and nothing at all without a source (a sourceless read answers an empty trace, which
looks like an evicted one): it says so and offers the Slow spans page (`open-telemetry-slow-spans`).
An unknown or evicted trace is a 200 with no spans, never a 404: "No spans of this trace are
buffered in this source", and only then a `TELEMETRY_STORE` (`getTelemetryStore`) read, whose
`evictedSpans > 0` adds that it may have been evicted. The waterfall is
`core/observability/trace-layout.ts` (`layOutTrace`, ported from the old `trace-layout.ts`): a span
with no parent, itself as parent or a parent not in the answer is top level, the last two marked
"parent not buffered" and never re-parented; siblings by `startEpochNanos`, then `spanId`; an
iterative walk with an emitted set, so a parent cycle still draws every span once, at the top level;
bars as percentages of the window (earliest start to latest end, a zero window guarded), the indent
capped at 12 levels; per row the name, service, duration, an ERROR chip, an exception chip and its
correlated log count; a banner when no span lacks a parent (the root is not buffered). The header
holds the trace id, the source and `traceSummary` (spans, services, total duration, error spans).
Choosing a row puts its span in `?span=` (`replaceUrl`; the first row when none), so Refresh keeps
it; its detail shows the ids, service, kind, duration, start (`lineTime`) and offset, status and
message, scope, `service.version`, attributes, resource attributes and events (an exception's type,
message and stack trace, else the event's attributes). Below, the correlated logs, oldest first:
level, offset, body and the span's name, or "its span is not buffered". A 403 says so, else Retry;
Refresh reads again, no polling. The pact reads both in "telemetry from one platform service"; no
recording holds an empty trace, a missing root, an orphan or a cycle, so those are the plain spec's
and `trace-layout.spec.ts`'s, and the no-source page is the route's no-data screenshot.

The Deployments section (qits-2315): `projects/<slug>/deployments` is a parent route with no
component, like Observability; its own address redirects to `requests` by a relative `redirectTo`,
and the sidebar's Deployments entry (between Repositories and Observability) lists its pages below
it while one is open (`open-sidebar-deployments-page`). `deployments/requests`
(`DeploymentRequestsPage`, the retired qits-deployments-frontend's `deployment-requests` page)
reads qits-deployments' `listDeploymentRequests?projectId=` through `qitsResource` over
`PROJECT_DEPLOYMENT_REQUESTS` (`core/deployments/deployments.operations.ts`), on the `deployments`
host: every request the platform has not finished with and the ten newest settled ones, split by
`isCompletedRequest` (`core/deployments/deployment-requests.ts`, the server's `RequestLifecycle`
rule, with `isPendingGate`, `isRefused`, `isHeldForApproval` and `isInFlight`) into Pending and
Completed, one "No deployment requests yet" when there are none. Each row's Open leads to the
request's own page (`open-deployment-request`), as the release request page's lifecycle's "the
deployment" does (`open-release-deployment-request`). Only `qits:admin`, `qits:admin-agent`,
`qits:desk-admin`, `qits:desk`, `qits:agent` and `qits:system` may read the requests; a 403 says
so. Staleness: the resource's `refreshOn` (`DEPLOYMENT_REQUEST_EVENTS`, narrowed by
`affectsDeploymentRequests`): a deployment event (`DeploymentQueued`, `DeploymentStarted`,
`DeploymentActive`, `DeploymentFailed`), which names no project, when its `applicationName` is on
screen or a request is pending; `DeploymentRequestDeclined` when its `deploymentRequestId` is on
screen; `SoftwareRelease` when its `repository` is a request's `repoId` on screen or a repository
of the project's release requests (`ProjectReleaseRequests`). A gate that settles as a refusal or a
hold sends no event: Refresh reads again. The pact (`@qits/deployments-golden-masters`, states "a
project with deployment requests" and "a project with no deployment requests") skips itself on an
older pin.

`deployments/requests/<id>` (`DeploymentRequestPage`, qits-2322, the retired frontend's
`deployment-requests/<id>` page) is one request end to end; the sidebar keeps Deployments ›
Requests current, and the trail ends with `<version> · <applicationName>`
(`deploymentRequestSubpage` in the shell, named from `OpenDeploymentRequest`, a root signal the page
sets with what it shows: nothing is read twice). Its doors: `DEPLOYMENT_REQUEST`
(`getDeploymentRequest`, the request and its deployment, `null` when none was queued), which alone
can fail the page (403 names the roles, 404 says "No deployment request <id>.", else Retry);
`TIER_DEPLOYMENTS` (`listDeployments?environmentId=`) and `ENVIRONMENTS` (`listEnvironments`), which
decide the lifecycle's middle tile only; and the shell's `ProjectReleaseRequests` (no new
qits-projects interaction), which decides the merge tile only. The lifecycle is `requestLifecycle`
(`core/deployments/deployment-requests.ts`): Released (always), Running in <tier> (the tier's newest
ACTIVE deployment of the application by `createdAt`, not the request's own; stopped with why once
the request is completed and not serving), Merged to main (by version among the release requests of
its `repoId`); a side read that failed or is still on its way says so on its tile. Writes: while
held, Approve (`APPROVE_DEPLOYMENT_REQUEST`, no body) and Decline with an optional note
(`DECLINE_DEPLOYMENT_REQUEST`, `{ note }`; final, the release request ends WITHDRAWN), each
confirmed on a second press through `qitsMutation`; the answer is the read's envelope and takes the
shown one's place (`read.set`), a refusal (409, 404, 502) is said beside the buttons, and a 409
(somebody settled it first) reads the request again. Staleness: the request's and the tier's
`refreshOn`, `DEPLOYMENT_REQUEST_EVENTS` narrowed by `affectsDeploymentRequest` (a deployment event
of its `applicationName`, a `DeploymentRequestDeclined` of its id, a `SoftwareRelease` of its
`repoId`), debounced 1 s; the same gap: a gate settling as a refusal or a hold sends no event, and
Refresh reads all four again. The pact adds "a deployment request that deployed", "… held for
approval" (with `approveDeploymentRequest`), "… held for decline" (with `declineDeploymentRequest`
and its recorded note), "an application deployed in an environment" and "an environment".

`deployments/requests/by-release/<repoId>/<version>` (`DeploymentRequestsByReleasePage`, qits-2323,
the retired frontend's `deployment-requests/by-release/…` resolver, declared before
`requests/:requestId`) is the requests one release produced, where the release request page's "The
deployment of this release" leads (`open-release-deployment-requests`, an in-app exit; `releaseLinks`
gives it no `app`). One read, `RELEASE_DEPLOYMENT_REQUESTS` (`listDeploymentRequests` with
`repoId`, `version` and always `includeVariants: true`, so variants' requests and redeploys show):
exactly one opens its page in the URL's place (`follow-release-deployment-request`, `replaceUrl`);
several are a table, newest first, with the Requests page's columns and a Variant column, a main
row naming each declared variant no row deploys yet as still to come (`variantsToCome`); none says
the release may deploy nothing or has not reached qits-deployments yet, with Look again. The heading
is `<repository>@<version>`, named from `PROJECT_REPOSITORIES` (by id, else by name), else the
`repoId`. The trail ends `release <version>`. 403 names the roles, else Retry. Staleness: the
list's rule (`affectsDeploymentRequests`, the release's `repoId` the one repository). The pact adds
"a release with a variant deployed", "a release with no deployment requests" and "a release with
one deployment request" (the last two, and their browser tests, skip themselves until the pin
records them).

The Maintenance section (qits-2317): `projects/<slug>/maintenance` is a parent route with no
component whose pages are its children (`artifacts`, qits-2330; `bumps/:bumpId`, qits-2332;
`adoption/:repository/:version`, qits-2333; `repositories/:name`, qits-2334; the external
dependencies search is the Dependencies page's, qits-2331; the trains page comes as its own child
later: qits-2335); its own
address redirects to `dependencies` by a relative `redirectTo`, which keeps the query. The
sidebar's Maintenance entry lists the section's pages below it while one is open
(`open-sidebar-maintenance-page`).
`maintenance/dependencies` (`MaintenanceDependenciesPage`) reads qits-maintenance's inventory
through `qitsResource` over `core/maintenance/maintenance.operations.ts`
(`MAINTENANCE_REPOSITORIES`, `listRepositories`; `MAINTENANCE_DEPENDENCIES`, `listDependencies`
with `kind=INTERNAL` and `kind=EXTERNAL`, never the bare listing, which mixes in a repository's own
REACTOR modules). The doors take no project, so the page keeps the pins of the repositories whose
`project` is `SelectedProject`'s id and drops a dependency left with none. Two sections, Internal
and External, each headed by its count of dependencies and behind pins; within one, dependencies
with a behind (`pending`) pin first, then by name, each pin with its repository (linked to its repository page, `open-maintenance-repository`),
version, manifest and a "behind" tag; a null `latest` shows as unknown with the `error` beside it.
"Only behind" is `?behind=true` (written with `replaceUrl`). The name search (qits-2331, which
replaces qits-maintenance-frontend's `external/dependencies` page) is `?name=<glob>`, pushed (Back
is the previous search), trimmed, removed when blank: both dependencies reads then carry it
(`kind=…&name=…`), the service matches the whole name case-sensitively (`*`, `?`), the page filters
no name itself; without it the reads are exactly the unsearched ones. While searching, each heading
says `matching "<glob>"`, a section with no match says so, and "nothing has been scanned" is not
said. Only staff roles may read the inventory; a 403 says so. No domain event follows the inventory: Refresh reads all three again.
`projectRepositories` (`core/maintenance/project-repositories.ts`) is that project filter, shared by
the section's pages.

`maintenance/artifacts` (`MaintenanceArtifactsPage`, qits-2330) is what the project has released
and who still ships an old copy, read off the SBOMs; it is not the global `/artifacts` (the
artifact store, qits-2316). The listing reads `MAINTENANCE_REPOSITORIES` and
`MAINTENANCE_ARTIFACTS` (`listArtifacts`) and keeps the artifacts whose `repository` is one of the
project's: artifacts with a behind dependent (`behindCount > 0`) first, then by name, each with its
ecosystem, repository (linked to its repository page), newest version and build time, latest (unknown when null), SBOM
status, dependents and behind counts; the heading counts the artifacts, those shipped behind and
those whose SBOM is MISSING or FAILED. "Only behind" is `?behind=true`, as on Dependencies. A name
links to the detail on the same page (`?ecosystem=&name=`, `MAINTENANCE_DEPENDENTS`,
`listDependencyDependents`), except a `daemon` row's: the door reads maven, npm and docker only and
answers anything else with a 400, whose `message` (`errorConsumes`) the detail shows. The detail
keeps the listing's reads for the artifact's own row, and lists every dependent, not filtered by
project, each repository linked to its repository page, as current, behind or unknown
(`currencyOf`, `core/maintenance/currency.ts`: `embeddedVersion` against `latest`), the
behind ones first, then by repository; its back link drops `ecosystem` and `name` and keeps
`behind`. A 403 on any read says so; Refresh reads the open view's reads again.

`maintenance/bumps/<bumpId>` (`MaintenanceBumpPage`, qits-2332) is one bump, a detail page with no
sidebar entry (the sidebar keeps Maintenance open). It reads only `MAINTENANCE_BUMP` (`getBump`,
no project filter: the id is the whole address), again after `BUMP_EVENTS`
(`core/maintenance/bump-events.ts`, shared with the bumps menu) only while the bump is REQUESTED
or RUNNING. It shows the group and repository (linked to its repository page) with the status as a chip (any status, SUPERSEDED
or unknown, as its word), the facts, the release request (a uuid links
`projects/<slug>/release-requests/<id>`, `open-bump-release-request`; the sentinels `converged`
and `refused` are words with what they mean; null is none), `releaseState` and `releaseDetail`
verbatim as of `releaseStateAt` (only REJECTED, FAILED and CONFLICTED say the release is not
coming: every automation bump that succeeded is REQUESTED), one link per CI run (`ciRunIds`, else
`ciRunId` split on commas) through `CiRunLinks`, the `message` as plain text (an alert only when
FAILED; with no changes it follows "This bump sent no changes."), a failed run's `failure` (step,
image, exit code, the excerpt in a `<pre>`) and the changes table. A 404 is "No bump <id>.", a 403
a refusal. The bumps menu's rows link the page in the open project (`open-menu-bump`); with no
project open they are plain. The pact reads `getBump` in "pending bumps" (`releasedBumpId`), "a
bump that changed nothing", "a failed bump" (`bumpId`) and "no such bump" (404, status only); a
field under a recorded `null` (`failure`) is bound only where the recording holds it (`heldBy`).

`maintenance/adoption/<repository>/<version>` (`MaintenanceAdoptionPage`, qits-2333, the retired
frontend's `adoption/…`) is how far one release got downstream, a detail page with no sidebar entry
(the sidebar keeps Maintenance open). One read, `MAINTENANCE_ADOPTION` (`getAdoptionByRelease`,
`?repository=&version=`, no project filter: the service traces the whole closure per request, so the
page stitches nothing). The header names the release and its packages (`ecosystem name`,
comma-joined); the caption counts the repositories downstream and those carrying it. The chart is a
DAG drawn left to right by the pure `adoptionChart` (`core/maintenance/adoption-chart.ts`, its own
spec): one column per distinct depth, one fixed 240x116 card per repository however many parents
reach it, rows at the mean row of the parents (ties by name), an edge only to a parent that is
drawn, every depth-1 card off the release; the SVG edges come from the same arithmetic, and the
chart scrolls sideways inside its own box, never the page. A card's chip is ADOPTED (with
`adoptedVersion` and when) or PENDING, quiet and neutral, never an error. An adopter whose
`repositoryStatus` is `OK` links its repository page (`maintenance/repositories/<name>`, qits-2334,
through `MaintenanceRepositoryLinks`); `ABSENT` says "absent". No adopter is "This release reached
no repository."; no package a notice that the service holds no bill of materials for it. A 403 is a
refusal, else Retry. Staleness: `ADOPTION_EVENTS` (`SCMRelease`, `SoftwareRelease`,
`core/maintenance/adoption-events.ts`), debounced 1 s; Refresh reads again. A release request's
"Adoption of this release" leads here (`open-release-adoption`, an in-app exit; `releaseLinks` gives
it no `app`), in place of the retired release train link. The pact reads it in "a repository with
downstream components" (both adopters PENDING, the fixed version 2026.905.1), "a release some
consumers adopted" and "a release nobody consumes" (from `@qits/maintenance-golden-masters`
2026.1119.183438 on). A release with no package is no recording's: the plain spec derives it.

`maintenance/repositories/<name>` (`MaintenanceRepositoryPage`, qits-2334) is one repository's
maintenance, a detail page with no sidebar entry, keyed by the repository's name (`qits-ci-service`,
never the application), no project filter. It reads `MAINTENANCE_REPOSITORY` (`getRepository`),
`MAINTENANCE_REPOSITORY_BUMPS` (`listBumps?repository=&limit=20`),
`MAINTENANCE_REPOSITORY_DEPENDENTS` (`listRepositoryDependents`) and
`MAINTENANCE_REPOSITORY_DOWNSTREAM` (`getRepositoryDownstream`); the first two again after
`BUMP_EVENTS` naming the repository (`namesRepository`: its payload's `repository`,
`repositoryName` or `repoName` is the name, or it names none by name), never on a timer; the other
two once; Refresh reads all four. The heading is the name, the status as a chip (any word), the last
scan and `message` as plain text; no Groups panel (every group is NONE or RETIRED since qits-1133).
Pins: Internal and External tables (`patterns/maintenance/pin-table/`, `pinTables`), pending first
by the service's `pending`, and REACTOR and UNRESOLVED pins in a collapsed `<details>` with their
count; under each table only its behind transitives (by `via`), captioned with the total
("817 transitives, 11 behind"). Recent bumps: the status chip links the bump page
(`open-repository-bump`), kind (`group`), trigger, started, changes count, the release request (a
uuid links its page, `open-repository-bump-release-request`; the sentinels are words; null is
none) and the message. Dependents: one group per published artifact (name, ecosystem, latest),
each dependent's repository linked, embedded version, direct or transitive, current or behind
(`currencyOf`). Downstream: depth, repository (linked), archetype and `via`, counted in the caption,
every row as the inventory gives it. Each section has its own one-line empty text. A 404 on
`getRepository` is "No repository <name> in the inventory." and nothing else (the other three answer
empty for an unknown name); a 403 on any read a refusal. Every repository name in Maintenance (the
Dependencies, Artifacts, bump, adoption and repository pages) links here through `MaintenanceRepositoryLinks`
(`core/maintenance/repository-links.ts`, `open-maintenance-repository`); `core/maintenance/bump-model.ts`
holds the bump status and release-request helpers both bump-showing pages share. The pact reads all
four in "a repository with pins and bumps" (`contract-javalib`), "a repository with nothing pinned"
(`contract-service`) and "no such repository" (`contract-unknown-service`, `getRepository` a 404
binding the status only).

## Styling

Styling uses Tailwind (v4, set up in `src/styles.css` and `.postcssrc.json`): utility classes in
the templates, and no component `styles:` or `styleUrl` blocks. A component's own host styling goes
in `host: { class: '…' }`. Tailwind finds the classes in the inline templates by itself; a class
written as a string built at run time is not found, so write every class out in full.

**Colours come from the semantic tokens of `@qits/ui-components/theme.css` (qits-2085), imported
by `src/styles.css`, and only from them** (qits-2086): `bg-surface`, `text-fg-muted`, `border-line`,
`bg-accent-soft`, `text-danger`, … or `var(--color-surface)` where a utility cannot reach. The
library's README holds the token table, each with its light value, dark value and role; choose a
token by its role, not by its light value. Never a palette step (`bg-cinnabar-600`,
`text-gray-500`), `white` or `black`, a literal (`#fff`, `oklch(…)`), an app-local token or a
`dark:` variant: the tokens already switch with the scheme. A role no token names is added to
qits-ui-components-jslib, with a light and a dark value, never here. `qits/theme-colors` is
`error` in `eslint.config.mjs`; it does not read the global `src/styles.css` or a hex inside a plain
TS string, so keep those clean by hand. The one computed colour is `tagColour()`
(`ui/components/tag/tag-colour.ts`), a hashed hue written as `light-dark(…)`. The one `dark:` variant is the xterm terminal's box
(`ui/components/terminal-screen`), which stays dark in both schemes because xterm's ANSI palette
assumes a dark background.

**Light, dark or System** is the reader's choice, from the theme menu in the top bar
(`$core/appearance/theme-preference`, `localStorage` key `qits.appearance.theme`): it sets
`data-theme` on `<html>`, and System removes it so `prefers-color-scheme` decides. The inline
script in `src/index.html` applies a stored choice before the first paint; the server render is
always System. Code that paints for itself (the xterm terminal, mermaid) follows the scheme as it
changes. Every screenshot is taken, and frozen, in both schemes (`colorSchemes` in
`src/testing/browser/setup.ts`).

## Pact contracts (epics qits-546, qits-112)

This app is a consumer of several providers. What it relies on from each is written down as a Pact V4
file in a folder of that provider's, and published as a jar the provider verifies in its own gate:

| Provider                   | Store and pact spec                                                                          | Pact file                                                | Golden masters                          |
| -------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| qits-projects-service      | `core/*/*.operations*.ts`, `core/work/*.store*.ts`                                           | `pacts/qits-landing-app_qits-projects-service.json`      | `@qits/projects-golden-masters`         |
| qits-githost-service       | `core/loc/loc.operations*.ts`, `core/githost/raw-images.operations*.ts`                      | `pacts/qits-landing-app_qits-githost-service.json`       | `@qits/githost-golden-masters`          |
| qits-workspaces-service    | `core/workspaces/{workspaces,agents,agent-prompt,agent-actions,container-actions}.store*.ts` | `pacts/qits-landing-app_qits-workspaces-service.json`    | `@qits/workspaces-golden-masters`       |
| qits-workspace-daemon      | `core/workspaces/{agent-chat,agent-files,agent-sign-in,agent-plugins}.store*.ts`             | `pacts/qits-landing-app_qits-workspace-daemon.json`      | `@qits/workspace-daemon-golden-masters` |
| qits-system-service        | `core/system/{targets,swarm,swarm-service,leases}.operations*.ts`                            | `pacts/qits-landing-app_qits-system-service.json`        | `@qits/system-golden-masters`           |
| qits-artifacts-service     | `core/ui-builder/docs.operations*.ts`, `core/artifacts/artifacts.operations*.ts`             | `pacts/qits-landing-app_qits-artifacts-service.json`     | `@qits/artifacts-golden-masters`        |
| qits-observability-service | `core/observability/observability.operations*.ts`                                            | `pacts/qits-landing-app_qits-observability-service.json` | `@qits/observability-golden-masters`    |
| qits-deployments-service   | `core/deployments/deployments.operations*.ts`                                                | `pacts/qits-landing-app_qits-deployments-service.json`   | `@qits/deployments-golden-masters`      |
| qits-maintenance-service   | `core/maintenance/maintenance.operations*.ts`                                                | `pacts/qits-landing-app_qits-maintenance-service.json`   | `@qits/maintenance-golden-masters`      |
| qits-orchestrator-service  | `core/artifacts/cleanup.operations*.ts`, `core/orchestrator/processes.operations*.ts`        | `pacts/qits-landing-app_qits-orchestrator-service.json`  | `@qits/orchestrator-golden-masters`     |
| qits-mirror-service        | `core/mirror/{upstreams,repository-packages}.operations*.ts`                                 | `pacts/qits-landing-app_qits-mirror-service.json`        | `@qits/mirror-golden-masters`           |

The githost pact has one interaction per kind of list a card meets, each from its own provider
state: a repository counted (the card's language table), one counted at an older commit (`STALE`,
shown like a counted one), one never counted (`PENDING`, left out; "Counting lines…" when nothing
is counted), one without a commit ("No lines yet"), and a mix of counted and never counted. The
card shows CODE languages only; data (JSON, YAML, …) and docs (Markdown) are left out. The plain and
screenshot specs cover the same cases from the same golden masters.

A changed image (png, jpg, jpeg, gif, webp; not SVG) on a release request's Changes tab or in an
opened commit shows as the image, before and after (`ui-image-diff`, qits-734), instead of its text
diff: `RawImages` (`core/githost/raw-images.ts`, a root service of `qitsResource`s over `RAW_FILE`,
qits-2146) reads qits-githost's `getRaw` through the generated client
as a Blob (so it carries the cookie or the dev bearer), at full commit shas: the fold's `base` and
`mergedSha`, a pin's two shas in the sibling (`repositoryId`), a commit's `parent` and itself. Its
pact interaction (`raw-images.operations.pact.spec.ts`, state `a repository with an image on main`)
binds the status and an `image/png` body, not the bytes. Each githost pact spec owns its
operations' part of the file (`assertPactPart`).

- **Pacts name both sides by repository name**, never by application name, so a component's
  frontend and backend stay distinct: consumer `qits-landing-app`, provider
  `qits-projects-service`, file `pacts/<consumer>_<provider>.json`. The same names go into
  `comments.references` (`qits-call.app`, `qits-trigger.app`).
- **Stores and operations are the only users of a generated client.** A guard or component asks a
  store, or reads a `qitsOperation` through `qitsResource` (below); it never calls `src/app/api/`
  itself. So the pact specs next to the stores and the operations files are the whole of what this
  app relies on from that provider: `src/app/core/projects/projects.store.pact.spec.ts`.
- **Reading through resources (qits-2143, the pilot).** `@qits/angular`'s `qitsResource` reads one
  backend operation per signal, declared once in a `core/<domain>/<x>.operations.ts`
  (`qitsOperation`: provider, operationId, method, the client function and its `consumes` from the
  `*.consumes.ts` beside it), with its own `<x>.operations.pact.spec.ts` (`addGoldenInteraction`
  with the operation's `operationId` and `consumes`; the provider as a literal, which
  `qits/pact-names` can read, checked against the operation's). The Agents page was the pilot
  (qits-2143); qits-2146 then moved every route over, group by group. Data the shell or several
  routes share is one `qitsResource` in a root service in `core/<domain>/` (`SelectedProject`,
  `ProjectReleaseRequests`, `ProjectActiveAgents`), never a store. Both rules now hold for all of
  `src/app/**/*.ts`: `eslint.config.mjs`'s `dataMarks()` turns on `qits/reads-through-resources`
  app-wide, and `qits/data-through-fields` for every component, whose templates carry the data
  marks (`QitsEntityList`, `QitsEntity`, `QitsField`). What a component shows of a shared service
  is data the rule cannot trace, so the shell marks it with plain attributes (`sourceMark`,
  `itemMark`; a crumb's `CrumbMarks`), and the agents menu takes the service's resource as an
  input. A
  resource's `refreshOn` needs `QITS_DOMAIN_EVENTS`, which `app.config.ts` (and the browser specs'
  `provideAppRoute()`) provide as `DomainEvents`. A loading resource is a pending task, so
  `openRoute`'s `settled()` stops waiting for stability while a request is open.
  Group 2 (the repositories routes) adds what a store kept by key: `ResourceFamily`
  (`core/resources/resource-family.ts`) makes one `qitsResource` per key on demand (a docs site's
  versions, one file of a bundle), outside a reactive context, in a root service (`ContractsCatalog`,
  `RoutesBundles`, `ContractsBundles`, `LinesOfCode`). A page over a published docs file
  (`getDocsFile`) marks its source, each entry by its key in the file, and each value as its field or
  derived paths, as plain attributes (`CONTRACTS_MARKS`, `BUILDER_MARKS`). Plain specs of a page over
  those services run the root effects that start the next read (`TestBed.tick()`), and do not wait
  for `whenStable()` while a read is still open.
  Group 3 (ideas, desk, events, observability) reads in the components themselves: the idea pages
  over `ideas.operations.ts`, the Desk over `desk.operations.ts` (`DESK_TRIGGER_MESSAGES`), its open
  issues over `work.operations.ts` (`OPEN_ISSUES`, each issue's `WORK_ITEM` in
  `app-issue-description`, writing through `ADD_WORK_COMMENT` and `MOVE_WORK`). A write's
  refusal is its `QitsApiError` (status and body) read by the domain's refusal helper.
  Group 4 (the agent and workspace routes) reads in the components too, over
  `core/workspaces/*.operations.ts`, one operations file (and pact spec) per former store. What a
  layout and its child routes share lives as long as the layout, not in a root service: the agent
  layout reads the agent and provides itself as `OPEN_AGENT`, which the Chat, Files and Terminal tabs
  inject. A pattern that shows a page's read takes the resource as an input (`app-container-actions`'
  `hosted`, `app-sign-in-notice`'s `report`). Reads made on a press rather than shown on arrival (a
  gitignored stub opened, an ignore file read when its list turns on) call the operation's `fetch`.
  Group 5 (the release request routes) reads in the components over `release-request.operations.ts`,
  `changes.operations.ts`, `ci.operations.ts`, `targets.operations.ts` and
  `raw-images.operations.ts`. The request's page reads the request and every read after it itself,
  addressed by primitive `computed`s so a refresh that keeps the fold reads nothing else again, and
  provides itself as `OPEN_RELEASE_REQUEST`, whose `put` shows the request a pattern's
  `qitsMutation` answered (`release-request-writes.ts` builds the writes' params and reads their
  outcomes). The shell hands the lightning menu `ProjectReleaseRequests`' resource; the Release
  Requests page reads it from the service and draws each row as `li[app-release-request-row]`, a
  pattern whose input is the client's entry, so its marks are traced. A pin's expansion and a run's
  full reports are a `ResourceFamily` in the component; changed images a root `RawImages`. Inside
  an `@for` over a helper's rows, the rule reads each row as an entity root, so a mark over values a
  helper computes is a class constant (`marks.x`), which the rule trusts.
  Group 6 (the work routes, the last) leaves no store that calls a client. The open project's work
  is `SelectedWork`'s root `qitsResource` over `PROJECT_WORK` (`project-work.operations.ts`), read
  once a work page `want()`s it (`OpenProjectWaits` reads what it holds without asking); the moves,
  dispatches and the Acceptance list's delayed finishes are `WorkMoves` (root, `qitsMutation` over
  `MOVE_WORK` and `DISPATCH_WORK`, the pending finishes UI state in `PendingFinishes`), which write
  the answered status into that read (`put`). The wrapper closings, the archetype registry and the
  open workspaces and ACTIVE agents are root services too (`WrapperClosings`, `Archetypes`,
  `WorkspaceActivity`), each read once wanted. A root resource whose events matter only while a page
  shows it is followed by that page (`followTransitions`, `follow`: `refreshOn` from
  `core/events/` calling `owedReload`, which reads once more after a read still on its way),
  not by its own `refreshOn`, which would subscribe for the app's life. The work item page reads
  the item, its thread and its dossier itself (`work-detail.operations.ts`) and hands each read to
  the body's patterns, which mark what they show; the Schedule tab's criteria are a root
  `ResourceFamily` (`WorkCriteriaReads`). The board's cards draw `WorkNode`s of `SelectedWork`'s
  graph, which the rule does not trace, so they write their marks as plain attributes
  (`core/work/work-marks.ts`: `data-qits-source` `PROJECT_WORK`, `data-qits-item` by id, each value
  its `data-qits-field` or `data-qits-derived`), as the shell does.
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

### Which routes an interaction happens on (qits-1946)

Every interaction names the routes its call happens on, as `comments.references.qits-trigger.route`
(the matched route patterns, `projects/:slug/repositories`, sorted and joined with `, `). They come
from the route ledger `src/testing/browser/routes.json`, which the browser run writes: the
golden-master guard notes which recorded answer each page spec (`*.page.browser.spec.ts`, which opens the
app's routes at the page's URL; a layout spec's or a pattern spec's routes are not kept) showed on which route, and `setup.ts` sends that to
the `goldenMasterRoutes` command after each spec file, which rewrites the spec's section.
`src/testing/golden-masters.ts` hands the ledger to `addGoldenInteraction` (`useRouteLookup`). `npm
run test:browser` rewrites the ledger, and so does the screenshot-baselines automation, which
commits it beside the references. A changed page spec or route changes the ledger, and a changed
ledger changes the pacts: regenerate them in the branch (`QITS_GOLDEN_UPDATE=true npm test`),
because golden-recordings re-runs only when a golden-master pin moves. A run filtered to some tests
(`-t`, `.only`) replaces a spec's section with what those tests showed, so run whole spec files
before keeping a ledger change.

A page that answers no backend request has no section. Never edit
the ledger by hand: QA re-runs the browser suite and fails a ledger that differs from what it writes
as stale `screenshot-baselines`, and the pact specs fail a pact whose routes differ from the ledger.
Either is fixed by running the generator, not by editing its output: `qits release-request
regenerate --kind screenshot-baselines` for the ledger, `QITS_GOLDEN_UPDATE=true npm test` for the
pacts.

The screenshot freezes `src/testing/browser/freezes/` are written by the same browser run (ticket
qits-1947): `freezeScreenshots({ routes })` in `setup.ts` and
`screenshotReferences({ freezes: true })` in `vitest-browser.config.ts` keep every passing
screenshot as an HTML file (the element, its CSS, the route and the recorded answers its test
showed) under the spec's path, and `manifest.json` names the route tree, every freeze and the
freezes of each route (page specs only, as in the ledger). `npm run test:browser` rewrites them, and the screenshot-baselines automation
commits them beside the references. A changed page, component or style changes its freezes: QA
fails a freeze that differs from what the run writes as stale `screenshot-baselines`. Never edit a
freeze by hand; run `qits release-request regenerate --kind screenshot-baselines`.

The UI builder (qits-1951, `projects/<slug>/repositories/<repo>/ui-builder`, linked from the cards
of FRONTEND and APP repositories) reads a frontend's published freezes back through
`RoutesBundles` (`core/ui-builder/routes-bundles.ts`, `qitsResource`s over `docs.operations.ts`): the `@routes/` site whose newest version's
`git.repository.name` is the repository, its `manifest.json`, and a freeze's HTML and the bundle's
`assets/*` on demand. The generated client encodes `/` and `@` in a path parameter, which the docs
store refuses, so `app.config.ts` puts `literalDocsPaths` on the artifacts client (specs that call
it do the same). A freeze is drawn in `<iframe sandbox="allow-same-origin" [srcdoc]>`, never with
`allow-scripts`, its asset references inlined as `data:` URLs. The pact binds `getDocsFile` by media
type only; a path from a provider state matches any path, so its spec makes one docs read per test
(`docs.operations.pact.spec.ts`, one part per reader).

An app that opts in to offline shots (qits-2153, `freezeScreenshots({ offline: true })` in its own
`vitest-browser.config.ts`) publishes a manifest with `offline: true` and a `connectivity` on each
freeze: the `network` it was shot on (`ONLINE` or `OFFLINE`), its `outbox` (each queued mutation's
`operation`, `state` PENDING / SENDING / CONFLICT / FAILED, `recordId` and, on a conflict, the
server's `currentVersion`), and the reads it answered from the cache (`cached`, with `cachedAt`).
`asManifest` keeps them typed (`FreezeConnectivity`); a malformed `connectivity` reads as absent and a
malformed outbox or cached entry is dropped. The builder then shows an **Online / Offline** switch
beside Light / Dark, only for such a bundle (this app's own has none): it narrows the route's state
tabs to the freezes shot on that network (`stateNetwork`; a freeze without `connectivity` is ONLINE),
is Online by default, follows the network of a state the URL or a tab opens, opens the other
network's first state when switched, is disabled for a network the route has no state on, and is
carried in the URL as `network=offline` while Offline only. A data mark whose `source` the shown
freeze answered from the cache says **from cache, as of** `<instant>` (`formatInstant`) in Selected
data, on the line above the frame while its data is highlighted, and in the tooltips of its
highlight buttons (◎ and the item's marks). A freeze with an outbox lists it, oldest first, in a
**Sync** section above Calls and states: the entry's state as a chip, its mutation (the call row's
popover when the freeze records it, else its provider's contracts in qits-docs), its record and,
on a conflict, the server's version. No qits-artifacts recording holds an offline bundle, so plain
specs cover it with a hand-built manifest; the browser specs' bundles have no `connectivity` and draw
as before.

The builder's entities (qits-1950) come from the services' entity maps through `ContractsCatalog`
(`core/ui-builder/contracts-catalog.ts`): every `@contracts/` site whose newest version's
`git.repository.name` is in the page's scope, its `entities.json` (a 404 is "No entity map
published", not an error). `joinEntities` (`entity-map.ts`) matches the manifest's records on
(provider, operationId) to the maps' operations and derives each verb from method and path; only
`domain` entities are shown. Its part of the docs pact spec owns the docs operations' interactions
for `show-ui-builder-entities` only (`assertPactPart` by interaction), the routes part the rest.

The builder marks what it shows of the docs files it reads (qits-2220, `builder-marks.ts`, plain
attributes as on the contracts pages): the manifest's routes by `fullPath` (tree rows, the Outcomes
tab, the path heading; a row's state count derived from `freezes`, its ◆ from `outcomes`),
each state tab's freeze by `file` (`name`, the chip's `kind`), and each entity of `entities.json` by
`entity` (the Entities tab, the entity aside, the route's entities); a count over a file is derived
from its top-level key (`routes`, `entities`). The frame, the switches, Selected data, the outcome
rows and the chrome of call and Sync rows render marks or recorded answers and carry none. Its own
freezes therefore read `getDocsFile` in several states: `recordFor` pins an itemless mark to the
one answer holding the top-level key of each of its paths, and each call row lists (and its ◎
outlines) only the marks pinned to its record, plus those pinned to none.

The builder's Agent action (qits-2157) opens `app-agent-dialog` (`patterns/ui-builder/agent-dialog/`),
a native `<dialog>` for the project's `ui-builder` named agent (qits-2154): its state from
`NAMED_AGENTS` (`core/named-agents/`, qits-projects' `listAgents`, read again after a
`NamedAgentStateChanged` of the project, whose own state and command show at once), its terminal on
qits-projects' container proxy (`namedAgentTerminalSocketUrl`, `TerminalSocket`; closing only
detaches), and a prompt field posting `PROMPT_NAMED_AGENT` with the `<opened-context>` block of
qits-2156 before the text (`openedContext`, `core/ui-builder/opened-context.ts`, pinned byte for byte
by its spec). Typing in the terminal carries no context: only the prompt door can prefix it.

The agent's pitches (qits-2158, the doors of qits-2155) show on **Original | Pitched** tabs above the
frame: page-local signals, back to Original (diff off) whenever `freeze().file` changes. Pitched reads
`PITCHES` (`core/ui-builder/pitches.operations.ts`, qits-projects' `listPitches` by `?project=` only,
as recorded) and narrows it client-side (`screenshotPitches`, `pitches.ts`) to the open repository
(by id once `PROJECT_REPOSITORIES` names it, else by `repositoryName`) and `screenshot ===
freeze().file`, unarchived, newest `updatedAt` first; the shown pitch stays shown when a newer one
arrives. Its versions come from `PITCH` (newest first, `formatInstant`), its HTML from
`PITCH_VERSION`, the newest as `latest` (the one path the pact binds), an older one by number. The
HTML is unsanitised: it goes through the same `bypassSecurityTrustHtml` → `[srcdoc]` of the same
`sandbox="allow-same-origin"` frame (both copies, same `(load)` → `frameLoaded`), never
`allow-scripts`, never `innerHTML`, so highlights, Pick data (still the freeze's records) and link
holding work on it. `PitchChanged` of the project, repository and screenshot reads the list again; of
the shown pitch its versions; `VERSION_ADDED` its `latest` HTML only while the person is on the
newest. "Pitched against manifest <v>; …" shows when `manifestVersion` differs from the bundle's.
The **Diff** toggle (`pitch-diff.ts`) parses the original freeze with `DOMParser`, marks the frame's
elements `data-qits-builder-diff` and injects `<style data-qits-builder-diff-style>` beside the
highlight style (`drawDiff`, after each load and on each flip), and lists what the pitch removed.
No recording pitches a screenshot of `@routes/qits-landing`, so the browser spec shows only the
empty Pitched tab; a drawn pitch and its diff are the plain spec's (the recording moved onto the
spec's screenshot).

A service's contracts bundle has pages of its own (qits-1994): `projects/<slug>/repositories/<repo>/contracts`
(its provider states, filtered by name), `contracts/<state slug>` (params, dependencies, each operation
with its recorded response), `entities` (its `entities.json` by marking) and `entities/<class name>`
(DTOs and operations with their link kinds, the states recording each operation). The bundle is the
`@contracts/` site whose newest version names the repository (`ContractsCatalog`'s catalog and maps);
`ContractsBundles` (`core/contracts/contracts-bundles.ts`) reads its `golden-masters/index.json` and
each recorded response, one `qitsResource` per file, shared with the call popover. Links to them come from
`core/contracts/contracts-links.ts`. No qits-artifacts recording holds an index, so the loaded
contracts pages are covered by plain specs answering with qits-projects' own published index
(`projectsGoldenIndex()`); their browser specs show the bundle with its index refused.

The entity page also draws the ER diagram of the persistence unit holding the entity (qits-2014):
`ContractsBundles.readDiagram` reads the bundle's `database/index.json` (
checked by `asDatabaseIndex` in `core/contracts/database-diagram.ts`), finds the unit listing the
entity, reads its `database/<file>.md` as text and hands the fenced mermaid block
to `<qits-mermaid-diagram>` (`provideQitsMermaid()` in `app.config.ts` loads mermaid lazily),
inside `ErDiagramBox` (`patterns/contracts/er-diagram-box/`): the library fits the svg to its width,
so once drawn (and on each redraw) the box sets its size from its `viewBox` and scrolls itself, never
the window, to the group mermaid names `…-entity-<table>-<n>` for the entity's table. A 404
on either file, or no unit listing the entity, is the line "No ER diagram published for this
entity.", not an error. No qits-artifacts recording holds a bundle's `database/` files yet: the pact
binds the index as the JSON `entities.json` read and the diagram as the docs store's Markdown answer
(`a repository with published changelogs`), the plain spec draws one from hand-written files, and the
browser spec answers the index 404.

Every release publishes the freezes as the docs site `@routes/qits-landing` (ticket qits-1948,
`contracts.routes` in `.config/qits/release.yml`), only when they changed: the release step hashes
the directory and prints `unchanged since <version>` when the newest version holds the same
content. QA never publishes them. The docs frontend lists the site under Routes.

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
  no recording holds gets a new provider state in the provider and a pact interaction here. One
  reader is not gated by a pact (qits-2044): `qits-idp`, whose `issueToken` answer the sign-in
  callback's spec gives `@qits/angular`'s `QitsTokens` through `QITS_SIGN_IN_FETCH`; the swap is the
  library's, not a store's, and qits-idp records no code issued to this app's client. The
  two providers' frozen ids are unrelated, so the card spec puts qits-githost's recorded entries
  under the project's recorded repository ids and says so.
- **A page is shown as a person sees it**, inside the shell and every layout above it (qits-1997).
  A page or layout spec (`*.page.browser.spec.ts`, `*.layout.browser.spec.ts`) opens its page
  through the app's own route tree, never a route list of its own: `provideAppRoute()` from
  `src/testing/browser/app-route.ts` in `TestBed.configureTestingModule` (the real `routes` of
  `app.routes.ts`, `HttpTestingController`, every generated client, fixed platform origins, an
  `EVENT_SOURCE` that never connects, and a `QitsSession` that is signed in, so
  `qitsSignedInGuard` passes), the spec's own providers after it; then `openRoute(url, reads?)`,
  which navigates to the page's URL and answers the frame's reads from golden masters by URL: the
  project list (`'a project exists'`), the open project's release requests (`'a project with no
release requests'`), its ACTIVE agents (refused with 403: the agents menu shows its icon alone)
  and the open workspaces (`WorkLayout`). A page that reads one of them too gets the same
  answer as the frame (the page's request and the frame's may be two; the helper answers every one
  for that URL): `reads` names the state, or `'unanswered'` leaves them all to the spec, which
  answers each (`http.match`) and calls `settled()` after so the reads that follow it are answered too. The spec
  answers only its page's own reads. It screenshots `frame` (the shell's host) and scopes its
  assertions to `page` (the routed page). The shell is shown in one settled state, menus closed,
  but for one rule (qits-2225): the outcome check judges the shell's triggers per page route, so
  each project page's spec calls `shootShellMenus(opened, name)` (`src/testing/browser/
shell-menus.ts`) once, which shoots the page with each top-bar menu holding a declared exit
  open, and a page drawing a work reference `shootWorkRefPreview` (its preview open). A trigger
  nobody can reach on a route is not rendered there at all (a closed sidebar section's pages, the
  agents menu and gear with no project, a hidden Workspace link), never only hidden. The
  shell's other states (wide, narrow, the burger, each menu) are `shell.layout.browser.spec.ts`'s, the
  one page or layout spec that keeps stand-in routes (`TestPage`, `TallPage`). A change to the
  shell or the navigation therefore changes every page's references and freezes: regenerate them
  as for any changed screenshot.
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
