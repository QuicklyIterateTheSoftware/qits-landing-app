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
`SCMPublishCommit` to the wrapper's main branch (their resources' `refreshOn`, `movesWrapper`). The work pages read the
open project's work again after `EntityTransitioned` naming it (`entities[].projectId`), and the work
item page its own data when the event names the item (`entities[].entityId`), and again after
`EntityCommented` naming it (`entityId`; qits-1660). A request's CI runs and
each run's reports follow qits-ci's `BUILD_EVENTS` (`core/ci/build-events.ts`) by `repoId` and
`runId` (the resources' `refreshOn`: `buildOfRepository`, `buildOfRun`; qits-2146). `WorkspaceActivity` (the work
pages' open workspaces and ACTIVE agents) follows qits-workspaces' agent events (`ACTIVE_AGENT_EVENTS`), not `EntityTransitioned`. Known gaps, where
no event exists yet (qits-1270's thread lists them): project and repository creation, work item
edits, a comment's edit, dossier and membership, a submitted CI report, a backup outcome, lines-of-code
counts.

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
`BUMP_EVENTS` (`ReleaseRequestStateChanged` among them), at most once a second.
The lightning menu's top line (`patterns/system/runner-slots/`, its own `qitsResource` over
`TARGET_LIST`, qits-2146) reads qits-system's targets on each opening until it loads, and again after `TARGET_EVENTS` (`TargetLeaseChanged`,
`TargetLoginChanged`). qits-system sends no event when a runner connects or drops. A person whose
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
under a Workspaces heading with the Targets link; `agents/<agent id>` (`AgentLayout`) reads the
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
Beside the Agents page's Workspaces heading, Targets links to qits-system's Targets page
(`PlatformOrigins.page('system')` + `/system/targets`) instead, where execution targets are now
managed. A slot's status strip no longer names which runner it is placed on
(`patterns/workspaces/slot-status/`, `placementNote` in `core/workspaces/agent-labels.ts`): the
field it read, `workspace.runner`, is gone from what this app consumes, ahead of the service
dropping it.

The Network access pane (epic qits-1977): `network-access` (`NetworkAccessPage`), under the shell
with no project open, reached by the top bar's Network access link (beside the bumps menu, always
shown). The page reads through `qitsResource` and writes through `qitsMutation` (qits-2146), over
`core/network-access/peers.operations.ts`: qits-network-access' peers (`getPeers`), nodes
(`getNodes`, naming a NODE peer's target) and private edge (`getPrivateEdge`; its 404 is "No private
edge has announced itself yet."). The filters All, Devices, Nodes and Revoked narrow the one list;
Mine reads `getPeers?owner=me`, which no recording holds, so it has no pact interaction yet. Revoke
on an ACTIVE row is confirmed, then `revokePeer` (a 403 reads "Your credential may not revoke
peers."), then the lists are read again. An ACTIVE DEVICE row's Download WireGuard config reads
`getPeerConfig` as text and saves it as `<name>.conf` through a `data:` link, `<PRIVATE_KEY>` kept.
The pane makes no keys and adds no devices: "Connect this machine" shows the copyable
`qits network-access up`. qits-network-access sends no domain event, so nothing follows live.

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

| Provider                    | Store and pact spec                                                                          | Pact file                                                 | Golden masters                          |
| --------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------- |
| qits-projects-service       | `core/*/*.operations*.ts`, `core/work/*.store*.ts`                                           | `pacts/qits-landing-app_qits-projects-service.json`       | `@qits/projects-golden-masters`         |
| qits-githost-service        | `core/loc/loc.operations*.ts`, `core/githost/raw-images.operations*.ts`                      | `pacts/qits-landing-app_qits-githost-service.json`        | `@qits/githost-golden-masters`          |
| qits-workspaces-service     | `core/workspaces/{workspaces,agents,agent-prompt,agent-actions,container-actions}.store*.ts` | `pacts/qits-landing-app_qits-workspaces-service.json`     | `@qits/workspaces-golden-masters`       |
| qits-workspace-daemon       | `core/workspaces/{agent-chat,agent-files,agent-sign-in,agent-plugins}.store*.ts`             | `pacts/qits-landing-app_qits-workspace-daemon.json`       | `@qits/workspace-daemon-golden-masters` |
| qits-system-service         | `core/system/targets.operations*.ts`                                                         | `pacts/qits-landing-app_qits-system-service.json`         | `@qits/system-golden-masters`           |
| qits-artifacts-service      | `core/ui-builder/docs.operations*.ts`                                                        | `pacts/qits-landing-app_qits-artifacts-service.json`      | `@qits/artifacts-golden-masters`        |
| qits-network-access-service | `core/network-access/peers.store*.ts`                                                        | `pacts/qits-landing-app_qits-network-access-service.json` | `@qits/network-access-golden-masters`   |

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
  `RoutesBundles`, `ContractsBundles`, `LinesOfCode`). A published docs file (`getDocsFile`) binds no
  field, so the pages mark only its source (`data-qits-source`). Plain specs of a page over those
  services run the root effects that start the next read (`TestBed.tick()`), and do not wait for
  `whenStable()` while a read is still open.
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

A page that answers no backend request (`events`, `observability` today) has no section. Never edit
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
  assertions to `page` (the routed page). The shell is shown in one settled state, menus closed;
  its own states (wide, narrow, the burger, each menu) are `shell.layout.browser.spec.ts`'s, the
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
