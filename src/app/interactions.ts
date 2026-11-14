/**
 * The app's UI interactions: what a visitor does that makes this app call a backend, or that only
 * navigates (epic qits-2000).
 *
 * An interaction that only navigates names no pact: its slug is what the page's `outcomes()`
 * declare and what the trigger marks (`data-qits-outcome`) name, never a
 * `qits-trigger.interaction`.
 *
 * Each key is a stable slug, unique within the app. Pacts name the slug in
 * `comments.references.qits-trigger.interaction`, and diagrams name it too. Never reuse a slug for
 * a different interaction. If an interaction goes away, retire its slug with it.
 *
 * The value is a one-line title, for people.
 */
export const INTERACTIONS = {
  /**
   * `project-picker.page.ts` and `selected-project.ts` via `PROJECT_LIST` (qits-2146): the picker's
   * list, and the list `SelectedProject` finds the URL's project in.
   */
  'list-projects': 'The project picker lists every project',
  /**
   * `project.page.ts` and `project-setup.page.ts` via `PROJECT_DETAIL` (qits-2146): the open
   * project, by the id the list gives its slug.
   */
  'open-project': 'Opening a project fetches its detail',
  /**
   * `project-card.ts` via `LIST_PROJECT_WRAPPER` (qits-2146): each card counts the project's
   * components from its repositories.
   */
  'show-project-repositories': 'A project card shows how many components the project has',
  /**
   * `project-repositories.page.ts` via `PROJECT_REPOSITORIES` (qits-2146): the Repositories page
   * lists the open project's repositories.
   */
  'show-project-repositories-tree':
    'The Repositories page shows the project’s repositories in the wrapper’s directory tree',
  /**
   * `project-repositories.page.ts` via `BACKUP_SYNC` (qits-2146): when the backup sign-in
   * terminal ends, the page nudges every repository's backup (qits-1268).
   */
  'sync-backups-after-sign-in':
    'Ending the backup sign-in on the Repositories page schedules every repository’s backup',
  /**
   * `project-card.ts` via `PROJECT_CARD_WORK` (qits-2146): each card counts the project's work
   * from its planning tree.
   */
  'show-project-work': 'A project card shows how much work the project has',
  /**
   * The work section's pages (`routes/projects/[slug]/work/`) via `SelectedWork` (`PROJECT_WORK`,
   * qits-2146): they lay the project's work out on the board, the backlog, Acceptance and the
   * archive, nested, each item with the needs it has not met yet (epic qits-1899).
   */
  'show-project-work-board': 'The Work page shows the project’s work on a board, nested',
  /**
   * `wrapper-closing.ts` via `WrapperClosings` (`WRAPPER_CLOSINGS`, qits-2146): a VERIFIED ticket's
   * line, in the lists and on its page, says how its wrapper closing stands (qits-1873).
   */
  'show-wrapper-closings': 'A verified ticket says how its wrapper release request will close it',
  /**
   * `epic-list-item.ts` via `WorkMoves` (`MOVE_WORK`, qits-2146): the finish button on a VERIFIED
   * epic in Acceptance moves it to DONE. A ticket has no such button: qits-projects-service refuses
   * any caller's move of a TICKET to DONE (qits-150), and the platform sets it itself.
   */
  'finish-epic': 'The finish button marks a verified epic done',
  /**
   * `work-item.page.ts` via `Archetypes` (`WORK_ARCHETYPES`, qits-2146): the work item page reads
   * the archetype registry, which says the moves and the dispatch phases its actions offer.
   */
  'show-work-item-actions': 'The work item page offers the moves and phases the registry serves',
  /**
   * `work-item.page.ts` via `WORK_DETAIL`, `WORK_COMMENTS`, `WORK_DOSSIER` and
   * `WORK_DOSSIER_ASSETS` (qits-2146): the work item page reads the item, its comments and its
   * dossier (an epic's pages and figures, a ticket's pages).
   */
  'show-work-item': 'The work item page shows the item’s description, dossier and comments',
  /**
   * `work-comments.ts` via `ADD_WORK_COMMENT` (qits-2146): Comment under the item's thread. The
   * Desk's open issues write the same comment through `ADD_WORK_COMMENT` (`open-issues.ts`,
   * qits-2146).
   */
  'comment-on-work-item': 'Comment on the work item page adds a comment to the item’s thread',
  /** `work-comments.ts` via `EDIT_WORK_COMMENT` (qits-2146): Save on a comment being edited. */
  'edit-comment': 'Save on an edited comment rewrites its text',
  /**
   * `work-item.page.ts` via `WorkMoves` (`MOVE_WORK`, qits-2146): a Status action (Mark …, Skip to
   * …, Back to …, Drop, Reopen). The Desk's Resolve sends the same move through `MOVE_WORK`
   * (`open-issues.ts`, qits-2146).
   */
  'move-work-item': 'A status action on the work item page moves the item',
  /**
   * `work-item.page.ts` via `app-work-drop` (`WorkMoves.drop`, `MOVE_WORK`): Confirm drop on the
   * Drop form sends the move with its outcome (and, where the outcome needs one, its reference) —
   * qits-248.
   */
  'drop-work-item': 'Confirm drop on the work item page moves the item to DROPPED with its outcome',
  /**
   * `work-schedule.page.ts` via `WorkCriteriaReads` (`WORK_CRITERIA`, qits-2146): the Schedule tab
   * reads each listed epic's and ticket's acceptance criteria.
   */
  'show-schedule-criteria': 'The Schedule tab shows each item’s acceptance criteria',
  /**
   * `work-schedule.page.ts` via `WorkMoves` (`MOVE_WORK`): "Schedule" moves the ticked REFINED
   * epics and tickets to READY_FOR_DEV, with the viewer's session (a person's approval).
   */
  'schedule-work': 'Schedule on the Schedule tab marks the ticked work ready for dev',
  /** `work-schedule.page.ts`: "Unschedule" moves a READY_FOR_DEV epic or ticket back to REFINED. */
  'unschedule-work': 'Unschedule on the Schedule tab takes scheduled work back to refined',
  /**
   * `work-item.page.ts` via `WorkMoves` (`DISPATCH_WORK`): Dispatch (the whole flow) or the next
   * phase's button.
   */
  'dispatch-work-item': 'Dispatch or the next phase on the work item page starts an agent',
  /**
   * `lines-of-code.ts` via `LOC_LIST` (qits-2146), once a card's languages first open: every
   * card's lines of code, one request.
   */
  'show-project-loc': 'The project cards show how many lines of code each project has',
  /**
   * `release-menu.ts`: the top bar's lightning menu, for the open project — read when the project
   * opens, and again when domain events say its requests changed. The menu, the sidebar's Release
   * Requests entry and the Release Requests page share the one request, `ProjectReleaseRequests`'
   * `PROJECT_RELEASE_REQUESTS` (qits-2146), whose operations pact spec binds it.
   */
  'open-release-requests': 'Opening the release menu lists the project’s pending release requests',
  /**
   * `release-requests.page.ts` via `ProjectReleaseRequests` (`PROJECT_RELEASE_REQUESTS`,
   * qits-2146): the Release Requests page lists every request of the open project qits-projects
   * answers (the open ones and the last finalized ones).
   */
  'show-project-release-requests':
    'The Release Requests page lists the project’s open and recently finalized release requests',
  /**
   * `project-desk.page.ts` via `DESK_TRIGGER_MESSAGES` (qits-2146): the Desk page lists the
   * project’s delivery desk trigger messages, newest first.
   */
  'show-project-desk':
    'The Desk page lists the project’s delivery-desk trigger messages, newest first',
  /**
   * `release-request.page.ts` via `RELEASE_REQUEST`, `RELEASE_COMMITS`, `COMMIT_BUILDS`,
   * `RELEASE_ARTIFACTS` and `APPROVAL_ELIGIBILITY` (qits-2146): a request's page reads the request,
   * the commits its fold brought in, the CI verdicts on the fold, once released what it published,
   * and what the viewer may approve.
   */
  'show-release-request': 'A release request’s page shows the request, its fold and its release',
  /**
   * `release-request.page.ts` via `REPOSITORY_RUNS` (qits-2146): a request's page reads its
   * repository's newest CI runs, to link the runs of the request.
   */
  'show-release-request-runs': 'A release request’s page links the CI runs of the request',
  /**
   * `release-menu.ts` via `ACTIVE_RUNS` (qits-2146): the lightning menu reads every queued or
   * running CI run, to mark each pending request that has one and link it.
   */
  'show-release-request-active-runs': 'The lightning menu marks the requests with an active CI run',
  /**
   * `commit-changes.ts` via `COMMIT_CHANGES` and `COMMIT_FILE_DIFF` (qits-2146): a commit under
   * "What this release folds in", opened: its changed files and one file's patch.
   */
  'show-commit-changes': 'Opening a commit on a release request shows the files it changed',
  /**
   * `run-reports.ts` via `RUN_REPORTS` and `RUN_REPORT` (qits-2146): the Overview of a release
   * request shows the reports of its test run (and its release run): tests with the failing ones
   * first, coverage, and the rest by their highlights.
   */
  'show-release-request-reports': 'A release request’s overview shows its test and release reports',
  /** `release-lane-header.ts` via `SET_SOURCE_PRIORITY`: a branch's priority select. */
  'set-release-source-priority': 'Choosing a branch’s priority on a release request sets it',
  /** `release-approval.ts` via `APPROVE_RELEASE`: Approve on a request awaiting a person. */
  'approve-release-request': 'Approve on a release request signs its fold off',
  /** `release-approval.ts` via `DECLINE_RELEASE`: Decline on a request awaiting a person. */
  'decline-release-request': 'Decline on a release request refuses its fold',
  /** `release-lifecycle.ts` via `RERUN_PHASE`: run a failed or stuck phase again. */
  'rerun-release-phase': 'Running a release pipeline phase again on a release request',
  /** `release-automations.ts` via `RERUN_AUTOMATION`: Re-run on one automation. */
  'rerun-release-automation': 'Re-run on a release request’s automation dispatches it again',
  /** `release-automations.ts` via `WAIVE_AUTOMATIONS`: waive the gate for the fold. */
  'waive-release-automations': 'Waiving a release request’s automations gate for its fold',
  /** `release-withdraw.ts` via `WITHDRAW_RELEASE`: Withdraw calls a release request off. */
  'withdraw-release-request': 'Withdraw on a release request calls it off',
  /**
   * `release-lane-header.ts` via `MOVE_SOURCE`: Move to next request on a source branch (qits-1665)
   * takes it out of that request into the one queued after it, with a reason.
   */
  'move-release-request-source': 'Moving a source branch of a release request to the next request',
  /**
   * `upstream-override.ts` via `OVERRIDE_UPSTREAM`: Override on an upstream request still holding
   * a request's upstream-in-flight gate (epic qits-897) lets it start QA without waiting for it.
   */
  'override-release-upstream':
    'Override on a release request’s upstream hold lets it start QA without that upstream',
  /**
   * `release-changes.ts` via `RELEASE_CHANGES`, `RELEASE_FILE_DIFF`, `SUBMODULE_CHANGES` and
   * `SUBMODULE_FILE_DIFF` (qits-2146): the Changes tab lists the fold's changed files and shows one
   * file's diff; a submodule expands into its own commits and files.
   */
  'show-release-request-changes':
    'The Changes tab of a release request shows what its fold changed',
  /**
   * `release-request-row.ts`: a row of the Release Requests page opens the request (its name, an
   * item's text), the request it is queued behind, the check that needs a person (the request's
   * page at that check's anchor), or the work item an item names. Navigates only, and names no
   * pact (epic qits-2000).
   */
  'open-listed-release-request':
    'A row on the Release Requests page opens the request, its queue, its check or its work item',
  /**
   * `release-request.page.ts`: a request's page opens the work item an item of its head names, or
   * the project's work where a failed gate filed a bug ticket. Navigates only, and names no pact
   * (epic qits-2000).
   */
  'open-release-request-work': 'A release request’s page opens the work item it carries',
  /**
   * `release-request.page.ts`: "← Release requests" on a request's page goes back to the list.
   * Navigates only, and names no pact (epic qits-2000).
   */
  'leave-release-request': '“← Release requests” on a request’s page goes back to the list',
  /**
   * `release-request.page.ts`: a request's page opens another request: the one that superseded
   * it, the one it is queued behind or the one queued behind it, and the requests a moved source
   * left and joined. Navigates only, and names no pact (epic qits-2000).
   */
  'open-related-release-request':
    'A release request’s page opens the request superseding it, queued around it or a move’s ends',
  /**
   * `<qits-commit-message>` and `QitsWorkRefs` (`@qits/ui-components`) via `workBriefSource`: a
   * commit subject on a release request's Commits or Changes tab (qits-1897), and a work item's
   * text — its description, impetus, acceptance criteria and comments, and an open issue's
   * description on the Desk (qits-1898) — read the briefs of the work items they name, and each id
   * shows its status and title in a popover. The slug stays the one qits-1897 recorded.
   */
  'show-commit-work-briefs':
    'A commit subject or a work item’s text shows the status and title of each work item it names',
  /**
   * `core/work/work-briefs.store.ts` (`QITS_WORK_LINK`, for `<qits-commit-message>` and the
   * `[qitsWorkRefs]` markdown): the link in a work reference's popover opens the item's page.
   * Navigates only, and names no pact (qits-2042).
   */
  'open-work-ref':
    'A work reference in a description, comment or commit subject opens the item’s page',
  /**
   * `ticket-card.ts`: a ticket's card on the board opens the ticket's page. Navigates only, and
   * names no pact (epic qits-2000).
   */
  'open-ticket-card': 'A ticket’s card on the board opens the ticket’s page',
  /**
   * `ticket-list-item.ts`: a ticket's card in a list (Backlog, the board stacked, Acceptance,
   * Archive) opens the ticket's page. Navigates only (epic qits-2000).
   */
  'open-ticket-list-item': 'A ticket’s card in a list opens the ticket’s page',
  /**
   * `epic-card.ts`: an epic's lane on the board opens the epic (its title, its id), a feature (its
   * row's title) or a task (its card). Navigates only (epic qits-2000).
   */
  'open-epic-card': 'An epic’s lane on the board opens the epic, one of its features or a task',
  /**
   * `epic-board.ts`: an epic's own board opens the epic (its bar's title and id), a feature (its
   * row's title) or a task (its card). Navigates only (epic qits-2000).
   */
  'open-epic-board': 'An epic’s own board opens the epic, one of its features or a task',
  /**
   * `epic-list-item.ts`: an epic's lane in a list opens the epic (its title, its id). Navigates only
   * (epic qits-2000).
   */
  'open-epic-list-item': 'An epic’s lane in a list opens the epic’s page',
  /**
   * `feature-list-row.ts`: a feature's row opens the feature (its title) or a task (its card).
   * Navigates only (epic qits-2000).
   */
  'open-feature-list-row': 'A feature’s row opens the feature or one of its tasks',
  /**
   * `work-ref.ts`: a work reference tag opens the item's page (`open`), and so does the id in its
   * preview (`openFromPreview`). Navigates only (epic qits-2000).
   */
  'open-work-ref-tag': 'A work reference tag, or the id in its preview, opens the item’s page',
  /**
   * `workspace-link.ts`: a work item's Workspace link leads to the item's agent address, which goes
   * on to its ACTIVE agent. Navigates only (epic qits-2000).
   */
  'open-item-workspace': 'A work item’s Workspace link leads to its agent',
  /**
   * `wrapper-closing.ts`: a VERIFIED ticket's closing line opens the wrapper release request it
   * names. Navigates only (epic qits-2000).
   */
  'open-closing-request': 'A verified ticket’s closing line opens its wrapper release request',
  /**
   * `work-inspiration.ts`: the work item page's "Inspired by" link opens the inspiring idea.
   * Navigates only (epic qits-2000).
   */
  'open-work-inspiration': 'The work item page’s “Inspired by” link opens the inspiring idea',
  /**
   * `work-workspaces.ts`: a workspace in the work item page's list leads to the item's agent
   * address. Navigates only (epic qits-2000).
   */
  'open-workspace-agent': 'A workspace on the work item page leads to the item’s agent',
  /**
   * `work.layout.ts`: the work section's tabs, one exit each. Navigates only (epic qits-2000).
   */
  'switch-work-tab':
    'The work section’s tabs open Refinement, Schedule, In Progress, Acceptance or Archive',
  /**
   * `work-schedule.page.ts`: an item's title on the Schedule tab opens its page. Navigates only
   * (epic qits-2000).
   */
  'open-scheduled-item': 'An item’s title on the Schedule tab opens the item’s page',
  /**
   * `work-agent.layout.ts`: the item's old agent address leaves, with no trigger, for its ACTIVE
   * agent's page on the same tab, or for the item's page when it has none. Navigates only (epic
   * qits-2000).
   */
  'follow-work-item-agent':
    'A work item’s old agent address leads on to its active agent or to the item',
  /**
   * `release-changes.ts` and `commit-changes.ts` via `RawImages` (`RAW_FILE`, qits-734,
   * qits-2146): a changed image, chosen on the Changes tab or in an opened commit, shows as the
   * image before and after.
   */
  'show-changed-image': 'Choosing a changed image on a release request shows it as an image',
  /**
   * `notifications-menu.ts` via `RECENT_EVENTS_LIST` (qits-2146): the top bar's notifications
   * menu, on its first opening.
   */
  'open-notifications': 'Opening the notifications menu lists the platform’s newest domain events',
  /**
   * `bumps-menu.ts` via `PENDING_BUMPS_LIST` (qits-2146): the top bar's bumps menu (a lighthouse),
   * on its first opening.
   */
  'open-version-bumps': 'Opening the bumps menu lists the platform’s pending version bumps',
  /** `runner-slots.ts` via `TARGET_LIST` (qits-2146): the lightning menu's runners and slots line. */
  'show-runner-slots': 'Opening the release menu shows the connected runners and their slots',
  /**
   * The work pages (`work.layout.ts`, `work-item.page.ts`) via `WorkspaceActivity`
   * (`OPEN_WORKSPACES`, qits-2146): the ACTIVE workspaces bound to work items, one request per
   * page, for the Workspace links on the cards.
   */
  'show-open-workspaces': 'The work pages link each work item that has an active workspace',
  /**
   * `work-item.page.ts` via `WORK_ITEM_WORKSPACES` (qits-2146): the item's workspaces in every
   * state.
   */
  'show-work-item-workspaces': 'The work item page lists the item’s workspaces, newest first',
  /**
   * `work-in-progress.page.ts` via `WorkspaceActivity` (`ACTIVE_AGENT_WORK`, qits-2146): the ACTIVE
   * agents, so the In Progress tab shows every work item an agent is on, whatever its status.
   */
  'show-agent-work': 'The In Progress tab shows every work item an active agent is on',
  /**
   * `project-agents.page.ts` via its `qitsResource`s (qits-2143): the project's Agents page lists,
   * under its Workspaces heading, the wrapper's slots and how many agents each hosts (epic
   * qits-1230), once qits-projects named the wrapper (`LIST_PROJECT_WRAPPER`, `LIST_WRAPPER_SLOTS`,
   * `LIST_WRAPPER_AGENTS`).
   */
  'show-project-workspaces': 'The Agents page lists the project’s slots and their agents',
  /**
   * `project-agents.page.ts` via its `qitsResource` (`LIST_PROJECT_ACTIVE_AGENTS`, qits-2143): the
   * project's Agents page lists its ACTIVE agents with what each waits on and what needs a person
   * (epic qits-1681). The same request as `agents-menu`'s, made by the page on its own.
   */
  'show-project-agents':
    'The Agents page lists the project’s active agents with what they wait on and what needs attention',
  /**
   * `workspace-slot.page.ts` via `SLOT_DETAIL`, `SLOT_START` and `SLOT_AGENTS` (qits-2146): one slot,
   * its status strip (container, daemon), the start running against it, and the agents it hosts
   * (`listWorkspaceAgents`).
   */
  'show-workspace-slot': 'A slot’s page shows its status and the agents it hosts',
  /**
   * `work-agent.layout.ts` via `ITEM_AGENTS` (qits-2146): a work item's old agent address finds the
   * item's ACTIVE agent and leads to its page (epic qits-1681).
   */
  'show-work-item-agent': 'A work item’s agent address leads to its active agent’s page',
  /**
   * `agent.layout.ts` via `AGENT_DETAIL` and `AGENT_START` (qits-2146): an agent's page, by its id —
   * what it works on, how it runs, what it waits on (epic qits-1681), and the start bringing its
   * slot's container up, asked of the agent (epic qits-1667).
   */
  'show-agent': 'An agent’s page shows the agent, what it waits on and its workspace',
  /**
   * `project-agents.page.ts`: a slot's row under the Agents page's Workspaces heading opens the
   * slot's page. Navigates only, and names no pact (epic qits-2000).
   */
  'open-agents-slot': 'A slot on the Agents page opens the slot’s page',
  /**
   * `agent-row.ts`: an agent's name in a row (the Agents page, a slot's page) opens the agent's
   * page. Navigates only, and names no pact (epic qits-2000).
   */
  'open-agent-row': 'An agent’s name in its row opens the agent’s page',
  /**
   * `agent-status.ts`: a wait's subject opens its page, one exit per kind: the release request, the
   * work item, or the item whose comments it waits on. A CI run is qits-ci's page, no outcome.
   * Navigates only, and names no pact (epic qits-2000).
   */
  'open-agent-wait': 'What an agent waits on opens its release request or work item',
  /**
   * `agent-status.ts`: what to do about an agent needing a person: Prompt agent opens its Chat tab,
   * Open item its work item, an overdue release request the request. Navigates only, and names no
   * pact (epic qits-2000).
   */
  'act-on-agent-attention':
    'The action beside an agent needing a person opens its chat, its item or its request',
  /**
   * `agent.layout.ts`: the agent page's item id opens the agent's work item. Navigates only, and
   * names no pact (epic qits-2000).
   */
  'open-agent-item': 'The item on an agent’s page opens the work item',
  /**
   * `agent.layout.ts`: the agent page's `ws-<slot>` link opens the slot's page. Navigates only, and
   * names no pact (epic qits-2000).
   */
  'open-agent-workspace': 'The workspace on an agent’s page opens the slot’s page',
  /**
   * `agent.layout.ts`: the agent page's tabs (Chat, Files, Terminal), one exit each. Navigates only,
   * and names no pact (epic qits-2000).
   */
  'switch-agent-tab': 'An agent’s tabs open its Chat, Files or Terminal',
  /**
   * `agent-chat.page.ts`: a picked reference's ↗ in the prompt composer opens its lines in the
   * Files tab (`path`, `lines` query params). Navigates only, and names no pact (epic qits-2000).
   */
  'open-picked-reference': 'A picked reference’s ↗ in the Chat tab opens its lines in Files',
  /**
   * `agent-terminal.page.ts`: the Terminal tab's link to the workspace's page, where the harness
   * sign-in and the plugins are. Navigates only, and names no pact (epic qits-2000).
   */
  'open-terminal-workspace': 'The Terminal tab’s workspace link opens the slot’s page',
  /**
   * `agent-terminal.page.ts`: the agent's Terminal tab attaches to its running harness through the
   * agent proxy (epic qits-1667; before it, it looked the command up on the slot's daemon). No
   * pact row: the socket is no recorded answer.
   */
  'show-agent-terminal': 'An agent’s Terminal tab attaches to the agent’s running harness',
  /**
   * `agent-chat.page.ts` via `AGENT_TRANSCRIPT` and `prompt-composer.ts` via `PROMPT_DRAFT`
   * (qits-2146): the agent's Chat tab shows its transcript
   * through the agent proxy and restores the saved prompt draft (epic qits-1230, qits-1667).
   */
  'show-agent-chat': 'An agent’s Chat tab shows its conversation and the saved prompt draft',
  /** `prompt-composer.ts` via `PROMPT_DRAFT_SAVE`: typing in the prompt box saves it. */
  'save-prompt-draft': 'Typing a prompt for an agent saves it as the agent’s draft',
  /** `prompt-composer.ts` via `PROMPT_DRAFT_DELETE`: the restored draft's Discard. */
  'discard-prompt-draft': 'Discarding a restored prompt draft deletes it',
  /**
   * `prompt-composer.ts` via `AGENT_PROMPT`, then `PROMPT_DRAFT_DELETE`: Send to the agent
   * hands the prompt to the agent by its id (epic qits-1667; before it, to the work item's agent)
   * and empties the draft.
   */
  'send-agent-prompt': 'Sending a prompt hands it to the agent',
  /** `prompt-composer.ts` via `PROMPT_REFINEMENT`: rough notes rewritten into a prompt. */
  'refine-agent-prompt':
    'Refining rough notes rewrites them into a prompt in the agent’s container',
  /**
   * Retired (epic qits-1667): the Chat tab's Terminate, which ended a running chat; the agent page's
   * Stop and Interrupt replace it. Kept so the slug is never reused.
   */
  'terminate-agent-chat': 'Terminating an agent’s live chat ends its harness',
  /**
   * `agent-files.page.ts` via `WORKTREE_FILES` and `WORKTREE_DETECTION`: the agent's Files tab
   * shows its worktree's tree, with the frameworks it can be narrowed to and the tests linked to
   * each source (epic qits-1230); read again on the slot's `files` hint.
   */
  'show-agent-files': 'An agent’s Files tab shows the tree of its worktree',
  /** `agent-files.page.ts` via `WORKTREE_FILES` (`?path=`): opening a gitignored directory. */
  'open-agent-directory': 'Opening a gitignored directory in the Files tab lists it',
  /**
   * `agent-files.page.ts` via `WORKTREE_FILE`: opening a file (from the tree, a test link or
   * a picked reference) shows its text; turning an ignore list on reads its ignore files.
   */
  'open-agent-file': 'Opening a file in the Files tab shows its text',
  /**
   * `agent-discard.ts` (a slot's page, an item's agent page) via `AGENT_DISCARD`:
   * Discard, confirmed, removes the agent; a refusal (leftover work, a daemon that does not answer)
   * is shown with the service's reason.
   */
  'discard-agent': 'Discarding an agent removes it, or says why the service refused',
  /**
   * `agent-discard.ts` via `AGENT_DISCARD` (`force: true`): after a refusal, Discard
   * anyway removes the agent with `force`, throwing its leftover work away.
   */
  'force-discard-agent': 'Discard anyway removes a refused agent and its leftover work',
  /**
   * `agent-run-actions.ts` via `AGENT_INTERRUPT` (epic qits-1667): Interrupt on a
   * running agent sends ESC to its harness.
   */
  'interrupt-agent': 'Interrupt on a running agent sends ESC to its harness',
  /**
   * `agent-run-actions.ts` via `AGENT_STOP` (epic qits-1667): Stop, confirmed,
   * makes the agent STOPPED; nothing starts it again until a person restarts or prompts it.
   */
  'stop-agent': 'Stop on an agent stops it until a person restarts or prompts it',
  /**
   * `agent-run-actions.ts` via `AGENT_RESTART` (epic qits-1667): Restart,
   * confirmed, starts the agent again on its session or hands it back to the scheduler.
   */
  'restart-agent': 'Restart on an agent starts it again on its session',
  /** `container-actions.ts` via `CONTAINER_ENSURE`: Start on a slot's container. */
  'start-workspace-container': 'Start on a workspace slot brings its container up',
  /**
   * `container-actions.ts` via `CONTAINER_STOP`: Stop, confirmed naming the
   * slot's agents, on a slot's container; the agents it affected are named after.
   */
  'stop-workspace-container': 'Stop on a workspace slot stops its container',
  /**
   * `container-actions.ts` via `CONTAINER_RECREATE`: Recreate, confirmed naming
   * the slot's agents, replaces a slot's container (refused unless its working tree is provably
   * clean); the agents it affected are named after.
   */
  'recreate-workspace-container': 'Recreate on a workspace slot replaces its container',
  /**
   * `harness-setup.ts` via `HARNESS_REPORT`: the workspace page reads the slot daemon's
   * harness report, and says so when nobody signed the harness in (the agent's Terminal tab's
   * before epic qits-1667).
   */
  'show-agent-sign-in': 'A workspace’s page says when nobody signed its harness in',
  /**
   * `sign-in-notice.ts` and `harness-setup.ts` via `SIGN_IN_TERMINAL`: Open the sign-in terminal
   * starts the harness's sign-in in the slot's container, which the workspace page then attaches
   * to.
   */
  'open-sign-in-terminal': 'Opening the sign-in terminal starts a harness sign-in in the container',
  /** `plugins-section.ts` via `HOME_PLUGINS`: the plugins on the shared agent home. */
  'show-agent-plugins': 'A workspace’s page lists the plugins on the shared agent home',
  /** `plugins-section.ts` via `PLUGIN_INSTALL`: Install on a plugin not installed yet. */
  'install-agent-plugin': 'Install on a plugin installs it on the shared agent home',
  /**
   * `agents-menu.ts` via `ProjectActiveAgents` (`LIST_PROJECT_ACTIVE_AGENTS`, qits-2146): the top
   * bar's agents menu lists the project's agents with what they wait on and what needs attention
   * (epic qits-1681). The agent page reads the same through that service.
   */
  'agents-menu':
    'The top bar’s agents menu lists the project’s agents with what they wait on and what needs attention',
  /**
   * The Ideas page (`routes/projects/[slug]/ideas/`) via `IDEA_LIST` (qits-2146): the open
   * project's ideas, filtered by status, with or without the archived ones (epic qits-888). The
   * idea forms' "Enabled by" choice and the work item page's inspiration picker read the same list.
   */
  'list-ideas': 'The Ideas page lists the project’s ideas',
  /** An idea's page via `IDEA`: the idea, what enables it, what it enables and inspired. */
  'show-idea': 'An idea’s page shows the idea, the ideas around it and the work it inspired',
  /** The idea form's Create via `CREATE_IDEA`; a refusal shows the service's message. */
  'create-idea': 'Create on the idea form adds an idea to the project',
  /** The idea form's Save via `EDIT_IDEA`: a merge patch of title, description, enabledBy. */
  'edit-idea': 'Save on the idea form edits an idea',
  /** Archive on an idea's page via `ARCHIVE_IDEA`, with the reason it asks for. */
  'archive-idea': 'Archive on an idea’s page archives it with a reason',
  /** Unarchive on an archived idea's page via `UNARCHIVE_IDEA`. */
  'unarchive-idea': 'Unarchive on an idea’s page brings it back',
  /**
   * A drop of a dragged idea on the Ideas page via `REPRIORITIZE`: puts it directly
   * above or below another rankable idea of the project (qits-1791).
   */
  'reprioritize-idea': 'Dragging an idea among the project’s ideas ranks it',
  /**
   * `project-ideas.page.ts`: an idea's title on the Ideas page opens the idea's page. Navigates only,
   * and names no pact (epic qits-2000).
   */
  'open-listed-idea': 'An idea’s title on the Ideas page opens the idea',
  /**
   * `project-ideas.page.ts`: New idea on the Ideas page opens the idea form. Navigates only, and
   * names no pact (epic qits-2000).
   */
  'open-idea-create': 'New idea on the Ideas page opens the idea form',
  /**
   * `idea-create.page.ts`: Cancel on the new idea form goes back to the Ideas page. Navigates only,
   * and names no pact (epic qits-2000).
   */
  'cancel-idea-create': 'Cancel on the new idea form goes back to the ideas',
  /**
   * `idea-edit.page.ts`: Cancel on an idea's edit form goes back to the idea without a write.
   * Navigates only, and names no pact (epic qits-2000).
   */
  'cancel-idea-edit': 'Cancel on the idea edit form goes back to the idea',
  /**
   * `idea.page.ts`: the "Enabled by" link on an idea's page opens the idea enabling it. Navigates
   * only, and names no pact (epic qits-2000).
   */
  'open-enabling-idea': 'An idea’s “Enabled by” link opens the idea enabling it',
  /**
   * `idea.page.ts`: an idea under "Enables" on an idea's page opens that idea. Navigates only, and
   * names no pact (epic qits-2000).
   */
  'open-enabled-idea': 'An idea under “Enables” opens that idea',
  /**
   * `idea.page.ts`: a work item under "Inspired work" on an idea's page opens the item. Navigates
   * only, and names no pact (epic qits-2000).
   */
  'open-inspired-work': 'A work item an idea inspired opens from the idea’s page',
  /**
   * `idea.page.ts`: Edit on an idea's page opens its edit form. Navigates only, and names no pact
   * (epic qits-2000).
   */
  'open-idea-edit': 'Edit on an idea’s page opens its edit form',
  /**
   * `idea.page.ts`: Create epic and Create ticket on an idea's page open the work create form, filled
   * with the idea and naming it as the inspiration (query params). Navigates only, and names no
   * pact (epic qits-2000).
   */
  'create-work-from-idea': 'Create epic or Create ticket on an idea’s page opens the work form',
  /**
   * The work create form (`routes/projects/[slug]/work/create/`) via `CREATE_WORK` (qits-2146): a
   * root epic or ticket, inspired by an idea when opened from one (epic qits-888).
   */
  'create-work-item': 'Create on the work form files an epic or a ticket',
  /**
   * `work-create.page.ts`: Cancel on the work create form goes back to the idea it was opened from,
   * or to the project's work. Navigates only, and names no pact (epic qits-2000).
   */
  'cancel-work-create': 'Cancel on the work form goes back to the idea or to the work',
  /**
   * `work-create.page.ts`: the "Inspired by" link on the work create form opens the inspiring idea's
   * page. Navigates only, and names no pact (epic qits-2000).
   */
  'open-inspiring-idea': 'The work form’s “Inspired by” link opens the inspiring idea',
  /**
   * The work item page's inspiration (`work-inspiration.ts`) via `SET_WORK_INSPIRATION`: names an
   * idea of the project as an item's inspiration, or clears it. No recording holds it yet, so no
   * pact interaction names this slug.
   */
  'set-work-inspiration': 'The work item page sets or clears the idea inspiring the item',
  /**
   * A drop of a dragged work item in the Backlog or on the board (`WorkReorders`) via
   * `WorkReorders` (`REPRIORITIZE_WORK`, qits-2146): puts it directly above or below a sibling
   * (qits-753).
   */
  'reprioritize-work-item': 'Dragging a work item among its siblings sets its priority',
  /**
   * Add or Remove on the work item page's Needs panel (`work-needs-panel.ts`) via `SET_WORK_NEEDS`
   * (qits-2146): writes the whole list of what the item waits for (epic qits-1899).
   */
  'edit-work-needs':
    'Add or Remove on the work item page’s Needs panel rewrites what the item needs',
  /**
   * `ui-builder.page.ts` via `RoutesBundles.load` (qits-1951, qits-2146): the UI builder finds the
   * frontend's `@routes/` docs site by its newest version's `git.repository.name` and reads its
   * `manifest.json`, the route tree with each route's frozen states.
   */
  'show-ui-builder-routes': 'The UI builder shows a frontend’s routes and how many states each has',
  /**
   * `ui-builder.page.ts` via `RoutesBundles.freeze` (qits-1951, qits-2146): selecting a state tab reads
   * that freeze's HTML, and the bundle's assets (its fonts) once, to draw the frozen page.
   */
  'show-ui-builder-state': 'Selecting a state in the UI builder shows its frozen page',
  /**
   * `ui-builder.page.ts` via `ContractsCatalog` (qits-1950, qits-2146): the UI builder finds every in-scope
   * service's `@contracts/` docs site by its newest version's `git.repository.name` and reads its
   * `entities.json`, to show which domain entities each route touches and which routes show each.
   */
  'show-ui-builder-entities': 'The UI builder shows which domain entities each route touches',
  /**
   * `call-details.ts` via `ContractsBundles` (qits-1999, qits-2146): opening a call in the UI
   * builder reads the provider's `golden-masters/index.json` and the call's recorded response from
   * its `@contracts/` docs site.
   */
  'show-ui-builder-call-details':
    'Opening a call in the UI builder shows its state and recorded response',
  /**
   * `contracts.page.ts` via `ContractsCatalog.load` and `ContractsBundles.readIndex` (qits-1994):
   * finds the repository's `@contracts/` docs site by its newest version's `git.repository.name`
   * and reads its `golden-masters/index.json`, to list the provider states it records.
   */
  'show-repository-contracts': 'The contracts page lists the provider states a service records',
  /**
   * `contract-state.page.ts` via `ContractsBundles.readIndex` and `readRecording` (qits-1994):
   * reads the bundle's `golden-masters/index.json` and each recorded response of the state.
   */
  'show-contract-state': 'A provider state’s page shows its operations and recorded responses',
  /**
   * `entities.page.ts` via `ContractsCatalog.load` and `readMap` (qits-1994): finds the repository's
   * `@contracts/` docs site and reads its `entities.json`, to list its entities by marking.
   */
  'show-repository-entities': 'The entities page lists a service’s persisted entities by marking',
  /**
   * `entity.page.ts` via `ContractsCatalog.readMap`, `ContractsBundles.readIndex` and
   * `readDiagram` (qits-1994, qits-2014): reads the bundle's `entities.json` (and a projected
   * application's), its `golden-masters/index.json` for the states recording each operation, and
   * for the ER diagram its `database/index.json` and the `database/<file>.md` of the unit holding
   * the entity.
   */
  'show-entity': 'An entity’s page shows its DTOs, operations and the states recording them',
  /**
   * `repository-card.ts`: a repository's card on the Repositories page opens its UI builder (a
   * frontend's), or its contracts or entities page (a service's). Navigates only, and names no
   * pact (epic qits-2000).
   */
  'open-repository-pages':
    'A repository’s card opens its UI builder, or its contracts or entities page',
  /**
   * `contracts-frame.ts`: the Contracts and Entities tabs of a repository's contracts and entity
   * pages, one exit each. Navigates only, and names no pact (epic qits-2000).
   */
  'switch-contracts-section': 'The Contracts and Entities tabs switch between a bundle’s two lists',
  /**
   * `contracts.page.ts`: a state's name in a repository's contracts list opens the state's page.
   * Navigates only, and names no pact (epic qits-2000).
   */
  'open-listed-contract-state': 'A state’s name on the contracts page opens the state’s page',
  /**
   * `contract-state.page.ts`: "← All states" (and "All states" beside an unknown slug) goes back
   * to the repository's contracts list. Navigates only, and names no pact (epic qits-2000).
   */
  'leave-contract-state': '“← All states” on a provider state’s page goes back to the list',
  /**
   * `contract-state.page.ts`: a dependency of a provider state opens the state it depends on, in
   * its own repository's contracts. Navigates only, and names no pact (epic qits-2000).
   */
  'open-state-dependency': 'A dependency on a provider state’s page opens the state it names',
  /**
   * `entities.page.ts`: an entity's name in a repository's entity map opens the entity's page.
   * Navigates only, and names no pact (epic qits-2000).
   */
  'open-listed-entity': 'An entity’s name on the entities page opens the entity’s page',
  /**
   * `entity.page.ts`: "← All entities" (and "All entities" beside an unknown class) goes back to
   * the repository's entity map. Navigates only, and names no pact (epic qits-2000).
   */
  'leave-entity': '“← All entities” on an entity’s page goes back to the list',
  /**
   * `entity.page.ts`: an entity's page opens the entity a projection projects (`projectionOf`, in
   * that application's repository) or a state that records an operation handing it out
   * (`recordedIn`). Navigates only, and names no pact (epic qits-2000).
   */
  'open-entity-relation':
    'An entity’s page opens the entity it projects, or a state recording its operation',
  /**
   * `agent-dialog.ts` via `NAMED_AGENTS` (qits-2157): the UI builder's Agent action opens the
   * dialog, which reads the project's named agents for the ui-builder agent's state and the
   * command whose terminal it attaches, again after each `NamedAgentStateChanged` of the project.
   */
  'open-ui-builder-agent':
    'The UI builder’s Agent action shows the ui-builder agent and its terminal',
  /**
   * `agent-dialog.ts` via `PROMPT_NAMED_AGENT` (qits-2157): Send in the agent dialog prompts the
   * ui-builder agent with the opened context (`openedContext`) and the person's text.
   */
  'prompt-ui-builder-agent': 'Send in the UI builder’s agent dialog prompts the ui-builder agent',
  /**
   * `ui-builder.page.ts`: an entity's entity page from the UI builder: the ↗ of an entity in the
   * Entities tab (`listedEntity`), the picked entity's name above its routes (`pickedEntity`), the
   * ↗ of an entity the route touches (`routeEntity`). Navigates only, and names no pact (epic
   * qits-2000).
   */
  'open-builder-entity': 'An entity in the UI builder opens its entity page',
  /**
   * `call-details.ts`: a call's popover in the UI builder opens the provider state's page
   * (`state`) or an entity's page (`entity`). Navigates only, and names no pact (epic qits-2000).
   */
  'open-call-contract': 'A call’s popover in the UI builder opens its provider state or an entity',
  /**
   * `root.page.ts`: the root leaves for the project picker at once, replacing itself in the
   * history (`projects`). No element triggers it. Navigates only, and names no pact (epic
   * qits-2000).
   */
  'leave-root': 'The root sends the visitor on to the project picker',
  /**
   * `project-card.ts`: a project card's name opens the project (`project`). Navigates only, and
   * names no pact (epic qits-2000).
   */
  'open-project-card': 'A project card in the picker opens its project',
  /**
   * `project-desk.page.ts`: a trigger line's item on the Desk page opens the release request's
   * page (`releaseRequest`) or the work item's (`workItem`), at the comment the line came from
   * when it names one. Navigates only, and names no pact (epic qits-2000).
   */
  'open-desk-line': 'A trigger line’s item on the Desk page opens its release request or work item',
  /**
   * `open-issues.ts` via `OPEN_ISSUES` and `issue-description.ts` via `WORK_ITEM` (qits-2146): the
   * Desk page lists the project's open issues, each with its description (qits-1819).
   */
  'show-open-issues': 'The Desk page lists the project’s open issues, each with its description',
  /**
   * `open-issues.ts`: an open issue's id on the Desk page opens the issue's page (`issue`).
   * Navigates only, and names no pact (epic qits-2000).
   */
  'open-open-issue': 'An open issue’s id on the Desk page opens the issue’s page',
  /** `network-access.page.ts` via `PEER_LIST`: the Network access pane's peers table. */
  'show-network-peers': 'The Network access page lists every peer of the platform network',
  /**
   * `network-access.page.ts` via `PEER_LIST` with `owner=me`: the "mine" filter. No
   * recording holds that query yet, so no pact interaction names this slug.
   */
  'show-my-network-peers': 'The Network access page’s Mine filter lists the visitor’s own peers',
  /** `network-access.page.ts` via `NODE_LIST`: the nodes, naming a NODE peer's target. */
  'show-network-nodes': 'The Network access page names each node peer by its joined node',
  /** `network-access.page.ts` via `PRIVATE_EDGE`: the private edge card. */
  'show-private-edge': 'The Network access page shows the announced private edge',
  /** `network-access.page.ts` via `PEER_REVOKE`: Revoke on an ACTIVE row, confirmed. */
  'revoke-network-peer': 'Revoking a peer on the Network access page',
  /** `network-access.page.ts` via `PEER_CONFIG`: a DEVICE row's WireGuard config download. */
  'download-wireguard-config': 'Downloading a device peer’s WireGuard config',
  /**
   * `shell.layout.ts`: a section in the sidebar opens it, one exit per section (Work, Ideas,
   * Agents, Release Requests, Desk, Repositories, Observability, Events). Navigates only, and
   * names no pact (epic qits-2000).
   */
  'open-sidebar-section': 'A section in the sidebar opens the section’s page',
  /**
   * `shell.layout.ts`: a work section's page listed below Work in the sidebar opens it, one exit
   * per page (`WORK_TABS`). Navigates only, and names no pact (epic qits-2000).
   */
  'open-sidebar-work-page': 'A work page below Work in the sidebar opens that page',
  /**
   * `shell.layout.ts`: the top bar's gear opens the open project's settings (`setup`). Navigates
   * only, and names no pact (epic qits-2000).
   */
  'open-project-settings': 'The top bar’s gear opens the project’s settings',
  /**
   * `shell.layout.ts`: the top bar's network icon opens the Network access page. Navigates only,
   * and names no pact (epic qits-2000).
   */
  'open-network-access': 'The top bar’s network icon opens the Network access page',
  /**
   * `shell.layout.ts`, rendered by `ui-breadcrumbs`: the brand and the crumbs before the current
   * page (in the trail and in the "…" panel) open their pages: home, the picker, the project, and
   * the Work, Agents or Release Requests section above a subpage. Navigates only, and names no pact
   * (epic qits-2000).
   */
  'follow-breadcrumb': 'A breadcrumb before the current page opens its page',
  /**
   * `agents-menu.ts`: an agent's item in the top bar's agents menu opens the agent's page.
   * Navigates only, and names no pact (epic qits-2000).
   */
  'open-menu-agent': 'An agent in the agents menu opens the agent’s page',
  /**
   * `agents-menu.ts`: a wait's subject in the agents menu opens its page, one exit per kind: the
   * release request, the work item, or the item whose comments it waits on. A CI run is qits-ci's
   * page, no outcome. Navigates only, and names no pact (epic qits-2000).
   */
  'open-menu-agent-wait': 'What an agent waits on, in the agents menu, opens its request or item',
  /**
   * `agents-menu.ts`: the action beside an agent needing a person in the agents menu: Prompt agent
   * opens its Chat tab, Open item its work item, an overdue release request the request.
   * Navigates only, and names no pact (epic qits-2000).
   */
  'act-on-menu-agent-attention':
    'The action beside an agent needing a person, in the agents menu, opens its chat, item or request',
  /**
   * `agents-menu.ts`: the agents menu's "All agents" opens the project's Agents page. Navigates
   * only, and names no pact (epic qits-2000).
   */
  'open-all-agents': 'All agents in the agents menu opens the project’s Agents page',
  /**
   * `release-menu.ts`: a request in the top bar's lightning menu opens the request's page, at the
   * check that needs a person when one does (its anchor as the fragment). Navigates only, and
   * names no pact (epic qits-2000).
   */
  'open-menu-release-request': 'A request in the lightning menu opens the request’s page',
} as const;

/** A slug from {@link INTERACTIONS}. A slug that is not in the catalog does not compile. */
export type InteractionSlug = keyof typeof INTERACTIONS;

/**
 * The library's typing seam (`@qits/angular`'s `QitsApp`): `outcomes()` takes only a slug of
 * {@link INTERACTIONS}, so an unknown one does not compile. `route-paths.ts`, which augments
 * `routePath`, is generated, so this half lives here.
 */
declare module '@qits/angular' {
  interface QitsApp {
    interaction: InteractionSlug;
  }
}
