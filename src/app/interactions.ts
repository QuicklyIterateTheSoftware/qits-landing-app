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
   * archive, nested, each item with the needs it has not met yet (epic qits-1899). The agent pages
   * (the Agents page, a slot's page, an agent's page) make the same read for their items' needs:
   * an unmet need is what an agent with no declared wait waits on (qits-2494).
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
   * `observability-logs.page.ts` via `TELEMETRY_SOURCES` (qits-2313): the Observability section's
   * source picker lists the telemetry buffer's platform services, with counts and reach.
   */
  'show-telemetry-sources':
    'The Observability section lists the platform services the telemetry buffer holds records of',
  /**
   * `observability-logs.page.ts` via `TELEMETRY_LOGS` (qits-2313, qits-2534): the Logs page shows
   * the buffered log lines, every source merged unless an old link names one, narrowed by service,
   * level, body text, age and trace, newest first.
   */
  'show-telemetry-logs': 'The Logs page shows the buffered log lines, newest first',
  /**
   * `observability-errors.page.ts` via `TELEMETRY_ERRORS` (qits-2339): the Errors page shows the
   * chosen source's buffered error spans and logs, grouped by trace, narrowed by age.
   */
  'show-telemetry-errors':
    'The Errors page shows a source’s buffered error spans and logs, grouped by trace',
  /**
   * `observability-errors.page.ts` (qits-2339): a group's Error logs on the Errors page opens the
   * Logs page at the same source from ERROR up. Navigates only, and names no pact.
   */
  'open-telemetry-error-logs':
    'Error logs on an error group opens the Logs page at that source’s ERROR lines',
  /**
   * `observability-metrics.page.ts` via `TELEMETRY_METRICS` (qits-2340): the Metrics page shows the
   * chosen source's buffered metric series, the latest value of each, one card per metric name.
   */
  'show-telemetry-metrics':
    'The Metrics page shows the latest value of each of a source’s buffered metric series',
  /**
   * `observability-traces.page.ts` via `TELEMETRY_TRACES` (qits-2342): the Traces page shows the
   * chosen source's buffered traces, grouped by path or one row each, newest or slowest first.
   */
  'show-telemetry-traces': 'The Traces page shows a source’s buffered traces, grouped by path',
  /**
   * `observability-trace.page.ts` via `TELEMETRY_TRACE` (qits-2343): the trace page shows one
   * trace of a source as a waterfall, a chosen span's detail and the trace's correlated logs; via
   * `TELEMETRY_STORE`, after a trace answered no spans, whether the buffer ever evicted any.
   */
  'show-telemetry-trace':
    'The trace page shows a trace’s buffered spans as a waterfall, with its correlated logs',
  /**
   * `observability-errors.page.ts` (a correlated group's trace id), `observability-traces.page.ts`
   * (a trace row's id) (qits-2343) and `observability-logs.page.ts` (a line's trace id, at the
   * line's own source, qits-2535): a trace id opens the trace page. Navigates only, and names no
   * pact.
   */
  'open-telemetry-trace': 'A trace id on an Observability page opens that trace’s page',
  /**
   * `observability-trace.page.ts` (qits-2343, qits-2536): the trace page opened without a source
   * reads nothing and points to the Traces page, where a source is chosen. Navigates only, and
   * names no pact.
   */
  'open-telemetry-traces': 'The trace page without a source opens the Traces page',
  /**
   * `observability-trace.page.ts` (qits-2535): the trace page's Logs links open the Logs page
   * narrowed to the trace id, every source merged. Navigates only, and names no pact.
   */
  'open-telemetry-trace-logs': 'A trace’s Logs link opens the Logs page at that trace’s lines',
  /**
   * `deployment-requests.page.ts` via `PROJECT_DEPLOYMENT_REQUESTS` (qits-2315): the Deployments
   * section's Requests page lists the open project's deployment requests, pending and completed.
   */
  'show-project-deployment-requests':
    'The Deployment requests page lists the project’s deployment requests, pending and completed',
  /**
   * `deployment-request.page.ts` via `DEPLOYMENT_REQUEST`, `TIER_DEPLOYMENTS` and `ENVIRONMENTS`
   * (qits-2322): a deployment request's page reads the request and its deployment, the tier's
   * deployments (is its version what the tier runs) and the tiers (the tier's name).
   */
  'show-deployment-request':
    'A deployment request’s page shows the request, its deployment and how far its version got',
  /**
   * `deployment-request.page.ts` via `APPROVE_DEPLOYMENT_REQUEST` (qits-2322): Approve on a
   * request held for manual approval queues its deployment.
   */
  'approve-deployment-request': 'Approve on a held deployment request queues its deployment',
  /**
   * `deployment-request.page.ts` via `DECLINE_DEPLOYMENT_REQUEST` (qits-2322): Decline, with an
   * optional note, on a request held for manual approval; final, the release request ends
   * WITHDRAWN.
   */
  'decline-deployment-request': 'Decline on a held deployment request deploys nothing, for good',
  /**
   * `deployment-requests.page.ts` (qits-2322): a row's Open on the Requests page opens that
   * request's page. Navigates only, and names no pact.
   */
  'open-deployment-request': 'Open on a deployment request’s row opens the request’s page',
  /**
   * `release-lifecycle.ts` (qits-2322): "the deployment" on a release request's deployment step
   * opens the deployment request's page. Navigates only, and names no pact.
   */
  'open-release-deployment-request':
    '“the deployment” on a release request’s lifecycle opens its deployment request’s page',
  /**
   * `deployment-request.page.ts` (qits-2322): "← Deployment requests" on a request's page goes back
   * to the list. Navigates only, and names no pact.
   */
  'leave-deployment-request': '“← Deployment requests” on a request’s page goes back to the list',
  /**
   * `deployment-requests-by-release.page.ts` via `RELEASE_DEPLOYMENT_REQUESTS` (qits-2323): the
   * page of one release's deployment requests reads them, its variants' included.
   */
  'show-release-deployment-requests':
    'A release’s deployment requests page lists every request the release produced, variants too',
  /**
   * `deployment-requests-by-release.page.ts` (qits-2323): a release with exactly one deployment
   * request opens that request's page in its place. Navigates only, and names no pact.
   */
  'follow-release-deployment-request':
    'A release with one deployment request opens that request’s page in its place',
  /**
   * `deployment-requests-by-release.page.ts` (qits-2323): a row's Open on a release's deployment
   * requests opens that request's page. Navigates only, and names no pact.
   */
  'open-release-deployment-requests-row':
    'Open on a release’s deployment request row opens the request’s page',
  /**
   * `deployment-requests-by-release.page.ts` (qits-2323): "← Deployment requests" on a release's
   * deployment requests goes back to the list. Navigates only, and names no pact.
   */
  'leave-release-deployment-requests':
    '“← Deployment requests” on a release’s deployment requests goes back to the list',
  /**
   * `release-request.page.ts` (qits-2323): "The deployment of this release" opens the release's
   * deployment requests in this app. Navigates only, and names no pact.
   */
  'open-release-deployment-requests':
    '“The deployment of this release” on a release request opens its deployment requests',
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
   * `ci-run.page.ts` via `RUN` and, through `app-run-reports`, `RUN_REPORTS` (qits-2321): the run
   * page reads one run with its steps and the live step's output, again after each build event of
   * the run and, while it runs, every 10 s; and the run's reports.
   */
  'show-ci-run': 'A CI run’s page shows the run, its steps with their output, and its reports',
  /**
   * `ci-run.page.ts` via `CANCEL_RUN` (qits-2321): Cancel, confirmed, on a queued or running run;
   * the page stays, saying the cancel was asked, or why it was refused.
   */
  'cancel-ci-run': 'Cancel on a CI run’s page, confirmed, stops the run',
  /**
   * `ci-run.page.ts` via `RETRY_RUN` (qits-2321): Run again on a finished run opens the new run's
   * page, or stays, saying why it was refused.
   */
  'retry-ci-run': 'Run again on a finished CI run’s page queues a new run and opens it',
  /**
   * `ci-run-links.ts` (`CiRunLinks`, qits-2321): a run anywhere in the app (the project's CI page,
   * a release request's builds, lifecycle, automations and reports, the active-run chips, the run
   * page's own links to another run) opens the run's page. Navigates only, and names no pact (epic
   * qits-2000).
   */
  'open-ci-run': 'A CI run, wherever it is linked, opens the run’s page',
  /**
   * `ci-run.page.ts`: "← CI" on a run's page (and the link beside a run not in the project) goes
   * back to the project's CI page; the run's repository opens it filtered to that repository
   * (qits-2321). Navigates only, and names no pact (epic qits-2000).
   */
  'leave-ci-run': '“← CI” or the repository on a CI run’s page goes back to the project’s CI page',
  /**
   * `ci-run.page.ts`: the release request a run was for opens the request's page (qits-2321).
   * Navigates only, and names no pact (epic qits-2000).
   */
  'open-ci-run-release-request': 'The release request on a CI run’s page opens the request',
  /**
   * `ci-runs.page.ts` via `REPOSITORY_SUMMARIES` and `ACTIVE_RUNS` (qits-2314): the project's CI
   * page lists each repository's newest runs, and the project's runs in flight above them.
   */
  'show-project-ci':
    'A project’s CI page lists each repository’s newest runs and the runs in flight',
  /**
   * `ci-repository-runs.page.ts` via `REPOSITORY_RUNS` (qits-2320): a repository's CI page lists
   * its newest runs, again after each build event of that repository.
   */
  'show-repository-ci': 'A repository’s CI page lists its newest runs, newest first',
  /**
   * `ci-repository-runs.page.ts` via `REPOSITORY_RUNS` (qits-2320): a repository's CI page reads a
   * repository that has no run yet, and says so.
   */
  'show-repository-ci-empty': 'A repository’s CI page says the repository has no run yet',
  /**
   * `ci-runs.page.ts`: a repository's name on the project's CI page opens the repository's CI page
   * (`repository`, qits-2320). Navigates only, and names no pact (epic qits-2000).
   */
  'open-ci-repository': 'A repository’s name on the project’s CI page opens its CI page',
  /**
   * `ci-repository-runs.page.ts`: "← CI" on a repository's CI page (and the link beside an unknown
   * repository) goes back to the project's CI page (qits-2320). Navigates only, and names no pact
   * (epic qits-2000).
   */
  'leave-ci-repository': '“← CI” on a repository’s CI page goes back to the project’s CI page',
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
   * `artifacts-image.page.ts` via `ARTIFACT_IMAGE_TAGS`, `ARTIFACT_IMAGE_MANIFESTS` and
   * `ARTIFACT_IMAGES` (qits-2324): the image page reads the image's tags and manifests, and the
   * repository's images for the image's own counts and size. Refresh reads all three again.
   */
  'show-artifact-image': 'An image’s page lists its tags and manifests, under its counts and size',
  /**
   * `artifacts-image.page.ts`: the back link, and the link in a non-image store's note, open the repository's
   * Artifacts (qits-2324, below it since qits-2477). Navigates only, and names no pact.
   */
  'leave-artifact-image': 'An image’s page leads back to its repository',
  /**
   * `artifacts-image.page.ts`: shows the digests whole, or shortened again (qits-2324). Changes
   * the page only: no request, and names no pact.
   */
  'toggle-image-digests': 'An image’s page shows its digests whole or shortened',
  /**
   * `artifacts-maven-package.page.ts` via `ARTIFACT_MAVEN_VERSIONS` and `ARTIFACT_SBOM_VERSIONS`
   * (qits-2325): the maven package page reads the coordinate's versions and its stored SBOMs, in
   * parallel. Refresh reads both again.
   */
  'show-maven-package': 'A coordinate’s page lists its versions, each with its SBOM',
  /**
   * `artifacts-maven-package.page.ts` (`app-sbom-cell`) via `ARTIFACT_SBOM` (qits-2325): a
   * version's Download reads its CycloneDX document and saves it as a file.
   */
  'download-maven-sbom': 'A coordinate’s page saves a version’s SBOM as a file',
  /**
   * `artifacts-maven-package.page.ts`: the back link, and the link in a non-maven store's note, open the repository's
   * Artifacts (qits-2325, below it since qits-2477). Navigates only, and names no pact.
   */
  'leave-maven-package': 'A coordinate’s page leads back to its repository',
  /**
   * `artifacts-daemon.page.ts` via `ARTIFACT_DAEMON_VERSIONS` (qits-2327): the daemon page lists
   * the daemon's published versions, newest first. Refresh reads them again.
   */
  'show-artifact-daemon': 'A daemon’s page lists its published versions, newest first',
  /**
   * `artifacts-daemon.page.ts`: the back link, and the link in a non-daemon store's note, open the repository's
   * Artifacts (qits-2327, below it since qits-2477). Navigates only, and names no pact.
   */
  'leave-artifact-daemon': 'A daemon’s page leads back to its repository',
  /**
   * `artifacts-daemon.page.ts` via `ARTIFACT_DAEMON_DOWNLOAD` (qits-2327): a version's button
   * fetches its bytes with the bearer (`getDaemon`, the daemon wire, no repository segment) and
   * saves them as `<daemon>-<version>`; the page stays.
   */
  'download-artifact-daemon': 'A daemon version downloads as a file',
  /**
   * `artifacts-docs-site.page.ts` via `ARTIFACT_DOCS_VERSIONS` (qits-2328): the docs site page
   * lists the site's published versions, newest first. Refresh reads them again.
   */
  'show-artifact-docs-site': 'A docs site’s page lists its published versions, newest first',
  /**
   * `artifacts-docs-site.page.ts`: the back link, and the link in a non-docs store's note, open the repository's
   * Artifacts (qits-2328, below it since qits-2477). Navigates only, and names no pact.
   */
  'leave-artifact-docs-site': 'A docs site’s page leads back to its repository',
  /**
   * `artifacts-docs-site.page.ts`: a version's Read link opens it in qits-docs' reader
   * (`/read/<site>/-/<version>` on the docs app, until qits-2337 moves it here), same tab. Leaves
   * the app, and names no pact.
   */
  'read-artifact-docs-version': 'A docs site version opens in the docs reader',
  /**
   * `artifacts-npm-package.page.ts` via `ARTIFACT_NPM_VERSIONS` and `ARTIFACT_SBOM_VERSIONS`
   * (qits-2326): the npm package page reads the package's versions and its stored SBOMs, in
   * parallel. Refresh reads both again.
   */
  'show-npm-package': 'A package’s page lists its versions, each with its dist-tags and SBOM',
  /**
   * `artifacts-npm-package.page.ts` (`app-sbom-cell`) via `ARTIFACT_SBOM` (qits-2326): a version's
   * Download reads its CycloneDX document and saves it as a file.
   */
  'download-npm-sbom': 'A package’s page saves a version’s SBOM as a file',
  /**
   * `artifacts-npm-package.page.ts`: the back link, and the link in a non-npm store's note, open the repository's
   * Artifacts (qits-2326, below it since qits-2477). Navigates only, and names no pact.
   */
  'leave-npm-package': 'A package’s page leads back to its repository',
  /**
   * `project-events.page.ts` via `PROJECT_EVENTS_LIST` (qits-2312): the Events page lists the open
   * project's newest events (`attr=projectid=…`, newest first, fifty at a time).
   */
  'show-project-events': 'The Events page lists the open project’s newest domain events',
  /**
   * `project-events.page.ts` via `PROJECT_EVENTS_LIST` (qits-2312): choosing event types on the
   * Events page lists the project's events of those names only (`name=…`).
   */
  'filter-project-events': 'Choosing event types on the Events page narrows the list to them',
  /**
   * `project-events.page.ts` via `EVENT_NAMES` (qits-2312): the Events page's type filter offers
   * every stored event name.
   */
  'show-event-names': 'The Events page’s type filter offers every stored event name',
  /**
   * `project-events.page.ts`: a release request or a work item an event names opens its page;
   * `project-event.page.ts` (qits-2338): a release request the event names opens its page.
   * Navigates only, and names no pact (epic qits-2000).
   */
  'open-project-event-subject':
    'A release request or work item an event names on the Events page or its own page opens its page',
  /**
   * `project-events.page.ts` (qits-2338): a row's Open link opens the event's page. Navigates only,
   * and names no pact.
   */
  'open-project-event': 'An event on the Events page opens its own page',
  /**
   * `project-event.page.ts` via `PROJECT_EVENT` (qits-2338): an event's page reads the event by its
   * id; a 404 says there is no such event in the project.
   */
  'show-project-event': 'An event’s page shows the event, its facts and its payload',
  /**
   * `project-event.page.ts` via `PROJECT_EVENT` and `EVENT_CHILDREN` (qits-2338, `walkChain`):
   * an event's page walks its chain, up by `parentId` (`getEvent`, a 404 the chain's start) and
   * down from the start (`listEvents?parentId=`).
   */
  'walk-project-event-chain': 'An event’s page walks what caused it and what it caused',
  /**
   * `project-event.page.ts` (qits-2338): "← Events" (and "Back to Events" when there is no such
   * event) leads back to the project's Events page. Navigates only, and names no pact.
   */
  'leave-project-event': 'An event’s page leads back to the Events page',
  /**
   * `project-event.page.ts` (qits-2338): the event's cause, and another event of the project in
   * its chain, open that event's page. Navigates only, and names no pact.
   */
  'open-related-project-event': 'An event’s cause or an event of its chain opens that event’s page',
  /**
   * `maintenance-dependencies.page.ts` via `MAINTENANCE_REPOSITORIES` and `MAINTENANCE_DEPENDENCIES`
   * (qits-2317): the Maintenance section's Dependencies page reads the inventory's repositories and
   * the INTERNAL and EXTERNAL dependencies, and shows the pins of the open project's repositories,
   * the behind ones first. Refresh reads all three again.
   */
  'show-project-dependencies':
    'The Dependencies page lists the open project’s internal and external pins, behind ones first',
  /**
   * `maintenance-artifacts.page.ts` via `MAINTENANCE_REPOSITORIES` and `MAINTENANCE_ARTIFACTS`
   * (qits-2330): the Maintenance section's Artifacts page reads the inventory's repositories and the
   * released artifacts, and lists the open project's, those with a behind dependent first. Refresh
   * reads both again.
   */
  'show-project-artifacts':
    'The Artifacts page lists what the open project released, those shipped behind somewhere first',
  /**
   * `maintenance-artifacts.page.ts` via `MAINTENANCE_DEPENDENTS` (qits-2330): an artifact's detail
   * (`?ecosystem=&name=`) reads the released artifacts whose newest release embeds it, each current,
   * behind or unknown against its latest, the behind ones first. Refresh reads it again.
   */
  'show-artifact-dependents':
    'An artifact on the Artifacts page lists who embeds it, and which of them ship an old copy',
  /**
   * `maintenance-bump.page.ts` via `MAINTENANCE_BUMP` (qits-2332): the bump page reads one bump by
   * its id, and again after `BUMP_EVENTS` while it is REQUESTED or RUNNING. Refresh reads it again.
   */
  'show-bump': 'A bump’s page shows how it ran, its release, its CI runs and the changes it sent',
  /**
   * `maintenance-bump.page.ts`: the release request a bump belongs to opens the request's page
   * (qits-2332). Navigates only, and names no pact.
   */
  'open-bump-release-request': 'The release request on a bump’s page opens the request',
  /**
   * `maintenance-repository.page.ts` via `MAINTENANCE_REPOSITORY`, `MAINTENANCE_REPOSITORY_BUMPS`,
   * `MAINTENANCE_REPOSITORY_DEPENDENTS` and `MAINTENANCE_REPOSITORY_DOWNSTREAM` (qits-2334): the
   * repository page reads one repository by its name with its pins and transitives, its newest 20
   * bumps, who embeds what it publishes and its downstream closure; the repository and its bumps
   * again after `BUMP_EVENTS` naming it. Refresh reads all four again.
   */
  'show-maintenance-repository':
    'A repository’s maintenance page shows its pins, its recent bumps, its dependents and what is downstream',
  /**
   * `maintenance-repository.page.ts`: a bump in a repository's recent bumps opens the bump's page
   * (qits-2334). Navigates only, and names no pact.
   */
  'open-repository-bump': 'A bump on a repository’s maintenance page opens the bump’s page',
  /**
   * `maintenance-repository.page.ts`: the release request a recent bump belongs to opens the
   * request's page (qits-2334). Navigates only, and names no pact.
   */
  'open-repository-bump-release-request':
    'The release request of a bump on a repository’s maintenance page opens the request',
  /**
   * `repository-links.ts` (`MaintenanceRepositoryLinks`, qits-2334): a repository name on the
   * Dependencies page (a pin's), the Artifacts page (the producing repository, a dependent's), the
   * bump page, the adoption page (an adopter's card the inventory holds) and the repository page (a
   * dependent's, a downstream one's) opens that repository's maintenance page in the open project.
   * Navigates only, and names no pact.
   */
  'open-maintenance-repository': 'A repository name in Maintenance opens the repository’s page',
  /**
   * `maintenance-adoption.page.ts` via `MAINTENANCE_ADOPTION` (qits-2333): a release's adoption
   * page reads how far it got (`getAdoptionByRelease?repository=&version=`), every repository
   * downstream of it and whether it carries the release yet. Refresh reads it again, and so does
   * an `SCMRelease` or `SoftwareRelease`.
   */
  'show-adoption': 'A release’s adoption page draws every repository downstream and who carries it',
  /**
   * `release-request.page.ts`: “Adoption of this release” on a released request opens the
   * release's adoption page in this app's Maintenance section (qits-2333). Navigates only, and
   * names no pact.
   */
  'open-release-adoption':
    '“Adoption of this release” on a release request opens its adoption page',
  /**
   * `maintenance-dependencies.page.ts` via `MAINTENANCE_REPOSITORIES` and `MAINTENANCE_DEPENDENCIES`
   * (qits-2331): a name glob searched on the Dependencies page (`?name=`) reads the INTERNAL and
   * EXTERNAL dependencies with it (`?kind=…&name=…`), beside the inventory's repositories, and
   * shows the open project's matching pins.
   */
  'search-project-dependencies':
    'Searching the Dependencies page by a name glob lists the open project’s matching pins',
  /**
   * `bumps-menu.ts` via `PENDING_BUMPS_LIST` (qits-2146): the top bar's bumps menu (a lighthouse),
   * on its first opening.
   */
  'open-version-bumps': 'Opening the bumps menu lists the platform’s pending version bumps',
  /** `runner-slots.ts` via `TARGET_LIST` (qits-2146): the lightning menu's runners and slots line. */
  'show-runner-slots': 'Opening the release menu shows the connected runners and their slots',
  /**
   * `swarm-service.page.ts` via `SWARM_SERVICE` (qits-2345): one swarm service's page shows its
   * facts, rollout, environment keys and labels, mounts, networks and tasks. Refresh, and a
   * deployment of its application going live or failing, read it again.
   */
  'show-swarm-service': 'A swarm service’s page shows its configuration and its tasks',
  /**
   * `swarm-services.page.ts`: a service row's name opens the service's page in this app,
   * `system/swarm/services/:id` (qits-2345). Navigates only, and names no pact.
   */
  'open-swarm-service': 'A service of the swarm services list opens its page',
  /**
   * `swarm-service.page.ts`: the crumb back opens the swarm services list (qits-2345). Navigates
   * only, and names no pact.
   */
  'leave-swarm-service': 'A swarm service’s page leads back to the services list',
  /**
   * `swarm-services.page.ts` via `SWARM_SERVICE_LIST` (qits-2344): the System section's services
   * page lists the services of qits-system's swarm, each with a state derived from its replicas.
   * Refresh, and a deployment going live or failing, read them again.
   */
  'show-swarm-services': 'The swarm services page lists the swarm’s services with their state',
  /**
   * `mirror-upstreams.page.ts` via `UPSTREAM_LIST` (qits-2357): the Mirror section's upstreams
   * page lists the image registries qits-mirror fronts, each with its namespace, cached images and
   * registration date. Refresh reads them again (no event announces a change).
   */
  'show-mirror-upstreams': 'The OCI upstreams page lists the registries the mirror fronts',
  /**
   * `mirror-repository.page.ts` via `REPOSITORY_PACKAGES` (qits-2358): the Mirror section's
   * repository page shows one cache root's type, upstream and eviction rule, its packages and the
   * selected package's versions. Refresh reads them again (no event announces a change).
   */
  'show-mirror-repository': 'A cache root’s page lists what the mirror holds in it',
  /**
   * `mirror-repositories.page.ts` via `REPOSITORY_LIST` (qits-2471): the Mirror section's Caches
   * page lists every cache root qits-mirror holds, each with its type, upstream, eviction window
   * and registration date. Refresh reads them again (no event announces a change).
   */
  'show-mirror-repositories': 'The Caches page lists every cache root the mirror holds',
  /**
   * `mirror-repositories.page.ts`: a cache root's name opens its page (qits-2471). Navigates only,
   * and names no pact.
   */
  'open-mirror-repository': 'A cache root of the Caches list opens its page',
  /**
   * `mirror-repository.page.ts`: a package's name shows its versions (qits-2358), and which of our
   * releases embed it (`show-mirror-package-releases`, qits-2488).
   */
  'select-mirror-package': 'A cache root’s page shows the versions of the package chosen',
  /**
   * `package-releases.ts` via `MAINTENANCE_DEPENDENCIES` and `MAINTENANCE_DEPENDENTS` (qits-2488):
   * below a cached package's versions, the Mirror section's repository page lists which of our
   * released artifacts embed it, per version, and which repositories pin it.
   */
  'show-mirror-package-releases': 'A cached package lists which of our releases embed it',
  /**
   * `package-releases.ts`: an embedding artifact's name opens its page in the Artifacts section
   * (qits-2488). Navigates only, and names no pact.
   */
  'open-mirror-package-release': 'An embedding release of a cached package opens its artifact page',
  /**
   * `orchestrator-process.page.ts` via `PROCESS_LIST`, `PROCESS_RUNS` and `PROCESS_RUN` (qits-2359):
   * the Orchestrator section's process page shows the process, its latest runs and the shown run's
   * steps, the run read without bodies (`bodies=false`). Refresh reads them again, and a running
   * run is read again every 10 s (no event announces its steps moving).
   */
  'show-orchestrator-process':
    'A process page shows the process, its latest runs and the shown run’s steps',
  /**
   * `orchestrator-process.page.ts`: a run's Started (or "Show the newest run") shows that run,
   * `?run=` in the URL (replaced, not pushed), read through `PROCESS_RUN` as
   * `show-orchestrator-process` reads it (qits-2359).
   */
  'open-orchestrator-run': 'A process page shows the run picked from its list',
  /**
   * `orchestrator-process.page.ts` via `PROCESS_RUN_STEP` (qits-2359): a step's card opens its call
   * below the board, `?step=` in the URL, reading that one step with its request body and response;
   * a second press closes it.
   */
  'open-orchestrator-step': 'A process page opens a step’s request and response, or closes it',
  /**
   * `orchestrator-process.page.ts`: Run now's first press asks for the second, saying a run
   * deletes; Not now takes it back. No request (qits-2359).
   */
  'ask-orchestrator-run': 'A process page’s Run now asks to be pressed again before it deletes',
  /**
   * `orchestrator-process.page.ts` via `START_PROCESS_RUN` (qits-2359): the confirmed Run now
   * starts a real run (`{ dryRun: false }`) and shows it, or says why it did not start. No
   * recording holds a real start, so the pact holds the dry run's.
   */
  'start-orchestrator-run': 'The confirmed Run now on a process page starts a run and shows it',
  /**
   * `orchestrator-process.page.ts` via `START_PROCESS_RUN` (qits-2359): Dry run starts a run that
   * deletes nothing (`{ dryRun: true }`) at once and shows it, or says why it did not start (a 409
   * while a run is active, in the service's words).
   */
  'start-orchestrator-dry-run': 'Dry run on a process page starts a dry run and shows it',
  /**
   * `swarm-nodes.page.ts` via `SWARM_NODE_LIST` (qits-2346): the System section's nodes page lists
   * the nodes of qits-system's swarm, each with its role, status, availability, manager status and
   * engine version, the one qits-system runs on marked. Refresh reads them again.
   */
  'show-swarm-nodes': 'The swarm nodes page lists the swarm’s nodes with their status',
  /**
   * `swarm-node.layout.ts` via `SWARM_NODE` and `SWARM_NODE_TASKS` (qits-2347): one swarm node's
   * page shows its status, facts and labels, and the tasks swarm placed on it. Refresh reads both
   * again (no event announces a node change).
   */
  'show-swarm-node': 'A swarm node’s page shows its facts, labels and tasks',
  /**
   * `swarm-node-images.page.ts` via `NODE_IMAGE_LIST` (qits-2353): a swarm node's Images tab lists
   * the images the node holds, with the containers using each and their total size; a node other
   * than the one qits-system runs on is not read (or answers 409 `NODE_REMOTE`). Refresh reads
   * again, and so does a deployment going live or failing.
   */
  'show-swarm-node-images': 'A swarm node’s Images tab lists the images the node holds',
  /**
   * `swarm-node-networks.page.ts` via `NODE_NETWORK_LIST` (qits-2354): a swarm node's Networks tab
   * lists the docker networks of the node qits-system runs on (another node is not read). Refresh
   * reads them again (no event announces a network change).
   */
  'show-swarm-node-networks': 'A swarm node’s Networks tab lists the node’s docker networks',
  /**
   * `swarm-nodes.page.ts`: a node row's hostname opens the node's page in this app,
   * `system/swarm/nodes/:id` (qits-2347). Navigates only, and names no pact.
   */
  'open-swarm-node': 'A node of the swarm nodes list opens its page',
  /**
   * `swarm-node.layout.ts`: the crumb back opens the swarm nodes list (qits-2347). Navigates only,
   * and names no pact.
   */
  'leave-swarm-node': 'A swarm node’s page leads back to the nodes list',
  /**
   * `swarm-node-containers.page.ts` via `NODE_CONTAINER_LIST` (qits-2352): a swarm node's
   * Containers tab lists every container on the node qits-system runs on (`all=true`), filtered to
   * the running ones by default; a node that is not that one is not read. Refresh reads it again
   * (no event announces a container start, stop or death).
   */
  'show-swarm-node-containers': 'A swarm node’s Containers tab lists the node’s containers',
  /**
   * `swarm-node-containers.page.ts` via `NODE_CONTAINER_LOGS` (qits-2352): a container row's Logs
   * opens a panel with the container's last 200 lines.
   */
  'show-swarm-node-container-logs': 'A container’s Logs on a swarm node shows its last 200 lines',
  /**
   * `swarm-node-containers.page.ts` via `OPEN_SYSTEM_TERMINAL` (qits-2356): a running container
   * row's `bash` or `sh` opens an exec terminal in it and goes to the terminal's page, carrying the
   * node as `?node=`; a refusal stays on the tab with the service's message.
   */
  'open-system-terminal': 'A running container’s bash or sh opens a terminal in it',
  /**
   * `system-terminal.page.ts` via `SYSTEM_TERMINAL` (qits-2356): a terminal's page reads the
   * terminal once (its shell, container, creator and age), then attaches its screen to the
   * terminal's socket; a gone terminal (404) is a note, with no socket.
   */
  'show-system-terminal': 'A terminal’s page shows the terminal and attaches its screen',
  /**
   * `system-terminal.page.ts` via `CLOSE_SYSTEM_TERMINAL` (qits-2356): Terminate ends the terminal
   * and goes back to the containers tab it was opened from (else the nodes list); a refusal stays.
   */
  'terminate-system-terminal': 'Terminate on a terminal’s page ends the terminal',
  /**
   * `system-terminal.page.ts`: the back link leads to the containers tab the terminal was opened
   * from (`?node=`), else to the nodes list (qits-2356). Navigates only, and names no pact.
   */
  'leave-system-terminal': 'A terminal’s page leads back to the containers or the nodes',
  /**
   * `swarm-node-volumes.page.ts` via `NODE_VOLUME_LIST` (qits-2355): a swarm node page's Volumes
   * tab lists the volumes of the node qits-system runs on, the unused ones marked, the anonymous
   * ones hidden until asked for. Refresh reads them again (no event announces a volume change).
   */
  'show-swarm-node-volumes': 'A swarm node’s Volumes tab lists the node’s volumes',
  /**
   * `swarm-node-volumes.page.ts`: "Show anonymous volumes" shows or hides the node's anonymous
   * volumes, kept in the address as `?anonymous=1` (qits-2355). Reads nothing, and names no pact.
   */
  'toggle-anonymous-volumes': 'A swarm node’s Volumes tab shows or hides its anonymous volumes',
  /**
   * `swarm-configs.page.ts` via `SWARM_CONFIG_LIST` (qits-2348): the System section's configs page
   * lists the configs of qits-system's swarm, each with its labels and docker's created and
   * updated text. Refresh reads them again (no event announces a change).
   */
  'show-swarm-configs': 'The swarm configs page lists the swarm’s configs with their labels',
  /**
   * `swarm-config.page.ts` via `SWARM_CONFIG` (qits-2349): one swarm config's page shows its id,
   * exact created and updated instants, labels and its data verbatim (a note instead when it is
   * binary or empty). Refresh reads it again (no event announces a config change).
   */
  'show-swarm-config': 'A swarm config’s page shows its facts, labels and data',
  /**
   * `swarm-configs.page.ts`: a config row's name opens the config's page in this app,
   * `system/swarm/configs/:id` (qits-2349). Navigates only, and names no pact.
   */
  'open-swarm-config': 'A config of the swarm configs list opens its page',
  /**
   * `swarm-config.page.ts`: the crumb back opens the swarm configs list (qits-2349). Navigates
   * only, and names no pact.
   */
  'leave-swarm-config': 'A swarm config’s page leads back to the configs list',
  /**
   * `swarm-secrets.page.ts` via `SWARM_SECRET_LIST` (qits-2350): the System section's secrets page
   * lists the secrets of qits-system's swarm, each with its labels, docker's created and updated
   * text and the services whose spec references it (`Unused` when none), never a value. Refresh,
   * and a deployment going live or failing, read them again.
   */
  'show-swarm-secrets':
    'The swarm secrets page lists the swarm’s secrets and the services using them',
  /**
   * `system-targets.page.ts` via `TARGET_ROWS` (qits-2351): the System section's Targets page lists
   * qits-system's execution targets, each with its connection, quarantine, slots, sign-ins, last
   * health check and memory. Refresh, and a target event (`TARGET_EVENTS`, `TargetDeleted`,
   * `TargetOomKilled`), read them again.
   */
  'show-targets': 'The Targets page lists the execution targets with their slots and sign-ins',
  /**
   * `target-card.ts` via `TARGET_HEALTH` (qits-2351): a target's health Details read its last
   * settled health check, each check with its verdict, on opening.
   */
  'show-target-health': 'A target’s health details show its last settled health check',
  /**
   * `target-card.ts` via `TARGET_LEASES` (qits-2351): a target's Leases read the leases it holds,
   * on opening and again after a `TargetLeaseChanged` naming it.
   */
  'show-target-leases': 'A target’s leases list the leases it holds',
  /**
   * `system-targets.page.ts` via `TARGET_INSTALL_SCRIPT` (qits-2351): View install script reads the
   * script the install line pipes into `sh`.
   */
  'show-target-install-script': 'The Targets page shows the runner install script',
  /**
   * `declare-target.ts` via `TARGET_CREATE` (qits-2351): Declare a target declares one and shows its
   * one-time install line; a refusal stays on the form.
   */
  'declare-target': 'Declaring a target shows the install line its runner registers with',
  /**
   * `target-card.ts` via `TARGET_PATCH` (qits-2351): Save of a target's Edit sends its description
   * and reservations; the list is read again, a refusal stays on the card.
   */
  'edit-target': 'Saving a target’s description and reservations changes them',
  /**
   * `target-card.ts` via `TARGET_TOKEN_ROTATE` (qits-2351): Rotate registration token hands out a
   * new one-time install line, optionally with another slots total.
   */
  'rotate-target-token': 'Rotating a target’s registration token shows a new install line',
  /** `target-card.ts` via `TARGET_GREENLIGHT` (qits-2351): Greenlight lifts a quarantine. */
  'greenlight-target': 'Greenlighting a quarantined target lifts its quarantine',
  /**
   * `target-card.ts`: Delete's first press asks for the second, Keep takes it back (qits-2351). No
   * request, and names no pact.
   */
  'ask-delete-target': 'A target’s Delete asks to be pressed again before it deletes',
  /**
   * `target-card.ts` via `TARGET_DELETE` (qits-2351): the second press deletes the target; a
   * `TARGET_BUSY` refusal opens its leases.
   */
  'delete-target': 'Deleting a target removes it, or names the lease that holds it',
  /**
   * `target-card.ts` via `TARGET_HEALTH_CHECK` (qits-2351): Run health check asks the runner for
   * one; the list is read again (its result publishes no event).
   */
  'request-target-health-check': 'Running a target’s health check asks its runner for one',
  /**
   * `target-card.ts` via `TARGET_LOGIN_CHECK` (qits-2351): Check sign-in asks the runner to check
   * each harness's sign-in; its answer arrives as `TargetLoginChanged`.
   */
  'request-target-login-check': 'Checking a target’s sign-in asks its runner to look again',
  /**
   * `target-sign-in.ts` via `TARGET_SIGN_IN_START` (qits-2351): Sign in to <harness> starts a
   * sign-in on the target; a `SIGN_IN_RUNNING` refusal follows the running one.
   */
  'start-target-sign-in': 'Signing a target in to a harness starts a sign-in on it',
  /**
   * `target-sign-in.ts` via `TARGET_SIGN_IN_READ` (qits-2351): a sign-in that has not settled is read
   * again every 2 s while its card is open (qits-system publishes no sign-in event).
   */
  'follow-target-sign-in': 'A running target sign-in is followed until it settles',
  /**
   * `target-sign-in.ts` via `TARGET_SIGN_IN_CODE` (qits-2351): Submit hands the code the browser
   * showed to the sign-in, once per state.
   */
  'submit-target-sign-in-code': 'Submitting a sign-in code hands it to the target’s sign-in',
  /** `target-sign-in.ts` via `TARGET_SIGN_IN_CANCEL` (qits-2351): Cancel ends a sign-in. */
  'cancel-target-sign-in': 'Cancelling a target sign-in ends it',
  /**
   * `project-agents.page.ts`: the Targets link beside the Workspaces heading opens the System
   * section's Targets page, `system/targets` (qits-2351). Navigates only, and names no pact.
   */
  'open-system-targets': 'The Agents page’s Targets link opens the Targets page',
  /**
   * `repository-docs.page.ts`: a docs site's row opens its reader under the repository,
   * `docs-reader.page.ts` (qits-2337), at the site's newest version. Navigates only, and names no
   * pact (epic qits-2000).
   */
  'open-docs-site': 'A docs site’s row on a Docs page opens its reader',
  /**
   * `docs-reader.page.ts` via `DOCS_VERSIONS`, `DOCS_VERSION` and `DOCS_FILE` (qits-2337): the
   * reader lists the site's versions, the version's files, and reads each Markdown page (and its
   * images) or the OpenAPI document it draws; via `DOCS_CATALOG` and `PROJECT_REPOSITORY_NAMES`
   * the repository a contracts or routes site hands off to.
   */
  'show-docs-site': 'The docs reader shows one docs site at a version',
  /**
   * `docs-reader.page.ts`: the reader's Version and Branch selects read another version of the
   * site, keeping `?category=` (qits-2337). Navigates only, and names no pact (epic qits-2000).
   */
  'pick-docs-version': 'Picking a version or branch in the docs reader reads that version',
  /**
   * `docs-reader.page.ts`: the bodies the reader does not draw (qits-2337): a contracts site's
   * repository's Contracts page (`contracts`), a routes site's UI builder (`builder`), and a
   * Storybook site on the docs app (`storybook`, which leaves the app). Names no pact.
   */
  'open-docs-handoff':
    'A contracts, routes or Storybook site in the docs reader opens where it is read',
  /**
   * `docs-reader.page.ts`: “← Docs” and an unknown site's link go back to the repository's Docs page,
   * an unknown version's to the site's newest (qits-2337). Navigates only, and names no pact.
   */
  'leave-docs-site': 'The docs reader goes back to the Docs page, or to the site’s newest version',
  /**
   * `repository-docs.page.ts` via `PROJECT_REPOSITORY_NAMES` and `DOCS_CATALOG` (qits-2336): a
   * repository's Docs page finds the repository in the project and lists the docs sites whose
   * newest version it published (`latestRepository`), by section.
   */
  'show-repository-docs': 'A repository’s Docs page lists the docs sites it published, by section',
  /**
   * `repository-card.ts`, `repository.page.ts` and the repository sidebar (“Docs”): opens a
   * repository's Docs page (qits-2336). Navigates only, and names no pact (epic qits-2000).
   */
  'open-repository-docs': 'A repository’s card or page opens its Docs page',
  /**
   * `repository-docs.page.ts`: “← <repo>” on a repository's Docs page goes back to the
   * repository's page, the link beside an unknown repository to the Components (qits-2336,
   * qits-2486). Navigates only, and names no pact (epic qits-2000).
   */
  'leave-repository-docs': 'A repository’s Docs page goes back to the repository',
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
   * `swarm-node.layout.ts`: a swarm node page's tabs (`NODE_TABS`: Containers, Images, Volumes,
   * Networks, qits-2352…qits-2355), one exit each (qits-2354). Navigates only, and names no pact.
   */
  'switch-swarm-node-tab': 'A swarm node’s tabs open its Containers, Images, Volumes or Networks',
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
   * `repository-card.ts`: a repository's card on the Components page opens its UI builder (a
   * frontend's), or its contracts or entities page (a service's). Navigates only, and names no
   * pact (epic qits-2000).
   */
  'open-repository-pages':
    'A repository’s card or page opens its UI builder, or its contracts or entities page',
  /**
   * `repository.page.ts` via `PROJECT_REPOSITORIES`, `MAINTENANCE_ARTIFACTS` and `DOCS_CATALOG`
   * (qits-2478): a repository's page finds the repository in the project and lists the artifacts
   * it publishes and the docs sites whose newest version it published.
   */
  'show-repository': 'A repository’s page lists the artifacts and docs sites it publishes',
  /**
   * `repository-card.ts`: a repository's name on its card opens the repository's page
   * (qits-2478). Navigates only, and names no pact (epic qits-2000).
   */
  'open-repository': 'A repository’s name on its card opens the repository’s page',
  /**
   * `repository.page.ts`: a published artifact's name opens its page in the artifact store
   * (qits-2478). Navigates only, and names no pact (epic qits-2000).
   */
  'open-repository-artifact': 'A published artifact on a repository’s page opens its store page',
  /**
   * `repository.page.ts`: “← Components” on a repository's page (and the link beside an
   * unknown repository) goes back to the project's Components page (qits-2478). Navigates only,
   * and names no pact (epic qits-2000).
   */
  'leave-repository': '“← Components” on a repository’s page goes back to the Components page',
  /**
   * `shell.layout.ts`: the repository sidebar's entries, shown while a repository's page is open
   * (qits-2492). Navigates only, and names no pact (epic qits-2000).
   */
  /**
   * `repository-release-requests.page.ts` via `REPOSITORY_RELEASE_REQUESTS` (qits-2506): a
   * repository's Release requests page lists its requests, newest first, filtered by state.
   */
  'show-repository-release-requests': 'A repository’s Release requests page lists its requests',
  /**
   * `repository-release-requests.page.ts`: a row opens the request under the repository
   * (qits-2506). Navigates only, and names no pact (epic qits-2000).
   */
  'open-repository-release-request': 'A repository’s release request opens under the repository',
  /**
   * `release-request-view.ts` under a repository: “← Release requests” goes back to the
   * repository's list (qits-2506). Navigates only, and names no pact (epic qits-2000).
   */
  'leave-repository-release-request':
    '“← Release requests” on a request under a repository goes back to the repository’s list',
  /**
   * `release-request-view.ts` under a repository: the other requests it names open under the same
   * repository (qits-2506). Navigates only, and names no pact (epic qits-2000).
   */
  'open-related-repository-release-request':
    'A request under a repository opens the requests it names under the same repository',
  /**
   * `docs-read-redirect.page.ts` via `DOCS_CATALOG` (qits-2486): the docs reader's old address
   * replaces itself with the reader under the site's publisher, or links the Components. Navigates
   * only, and names no pact (epic qits-2000).
   */
  /**
   * `repository-published.ts`: a docs category of a repository opens its Docs page narrowed to that
   * section (qits-2486). Navigates only, and names no pact (epic qits-2000).
   */
  'open-repository-docs-category': 'A docs category on a repository’s page opens its Docs there',
  'follow-moved-docs-site': 'The docs reader’s old address goes to the reader under its repository',
  'open-sidebar-repository-page': 'The repository sidebar opens one of the repository’s pages',
  /**
   * `shell.layout.ts`: “← Components” at the top of the repository sidebar goes back to the
   * project's Components page, and its sidebar (qits-2492). Navigates only, and names no pact.
   */
  'leave-sidebar-repository': 'The repository sidebar’s “← Components” goes back to the project',
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
   * `agent-dialog.ts` via `START_NAMED_AGENT` and `NAMED_AGENTS` (qits-2157, qits-2499): the UI
   * builder's Agent action opens the dialog, which starts the ui-builder agent if it is not
   * running, then reads the project's named agents for its state and the command whose terminal it
   * attaches, again after each `NamedAgentStateChanged` of the project.
   */
  'open-ui-builder-agent':
    'The UI builder’s Agent action starts and shows the ui-builder agent and its terminal',
  /**
   * `agent-dialog.ts` via `START_NAMED_AGENT` and `NAMED_AGENTS` (qits-2495): the Desk page's Agent
   * action opens the same dialog for the `desk` named agent, started if it is not running.
   */
  'open-desk-agent': 'The Desk page’s Agent action starts and shows the front desk agent',
  /**
   * `ui-builder.page.ts` via `PITCHES` (qits-2158): the UI builder's Pitched tab lists the
   * project's pitches, narrowed to the open repository and screenshot, again after each
   * `PitchChanged` of that screenshot.
   */
  'show-ui-builder-pitches': 'The UI builder’s Pitched tab lists the pitches of the screenshot',
  /**
   * `ui-builder.page.ts` via `PITCH` (qits-2158): the Pitched tab reads the chosen pitch's versions
   * for its version picker, again after each `PitchChanged` of that pitch.
   */
  'show-ui-builder-pitch-versions': 'A pitch in the UI builder’s Pitched tab lists its versions',
  /**
   * `ui-builder.page.ts` via `PITCH_VERSION` (qits-2158): the Pitched tab draws the chosen version's
   * HTML in the sandboxed frame, the newest as `latest`.
   */
  'show-ui-builder-pitch-version': 'The UI builder’s Pitched tab draws a version of a pitch',
  /**
   * `ui-builder.page.ts`: an entity's entity page from the UI builder: the ↗ of an entity in the
   * Entities tab (`listedEntity`), the picked entity's name above its routes (`pickedEntity`), the
   * ↗ of an entity the route touches (`routeEntity`). Navigates only, and names no pact (epic
   * qits-2000).
   */
  'open-builder-entity': 'An entity in the UI builder opens its entity page',
  /**
   * `call-details.ts`: a call's popover in the UI builder opens the provider state's page
   * (`state`), an entity's page (`entity`) or the provider repository's Contracts page
   * (`contracts`, qits-2337); `ui-builder.page.ts`: an outbox entry with no recorded call opens
   * the provider's Contracts page (`mutationContracts`). Navigates only, and names no pact (epic
   * qits-2000).
   */
  'open-call-contract':
    'A call’s popover in the UI builder opens its provider state, an entity or the contracts',
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
  /**
   * `shell.layout.ts`: a section in the sidebar opens it, one exit per section (Work, Releases,
   * Components, Deployments, Observability, Events, Maintenance). Navigates only, and
   * names no pact (epic qits-2000).
   */
  'open-sidebar-section': 'A section in the sidebar opens the section’s page',
  /**
   * `shell.layout.ts`: a work section's page listed below Work in the sidebar opens it, one exit
   * per page: Ideas first (qits-2483), then one per `WORK_TABS` entry. Navigates only, and names
   * no pact (epic qits-2000).
   */
  'open-sidebar-work-page': 'A work page below Work in the sidebar opens that page',
  /**
   * `shell.layout.ts`: an Observability page listed below Observability in the sidebar opens it,
   * one exit per page (qits-2313: Logs; qits-2339: Errors; qits-2340: Metrics; qits-2341: Slow
   * spans; qits-2342: Traces). Navigates only, and names no pact.
   */
  'open-sidebar-observability-page':
    'An Observability page below Observability in the sidebar opens that page',
  /**
   * `shell.layout.ts`: a Releases page listed below Releases in the sidebar opens it, one exit per
   * page (qits-2482: Requests, Agents, CI). Navigates only, and names no pact.
   */
  'open-sidebar-releases-page': 'A Releases page below Releases in the sidebar opens that page',
  /**
   * `component-search.ts`: a repository the Components section's Search lists opens its page,
   * `projects/:slug/components/:repo`, by a click or Enter (qits-2491). Navigates only, and names
   * no pact.
   */
  'open-component-search': 'Choosing a match of the Components search opens its repository',
  /**
   * `component-search.ts` via `PROJECT_REPOSITORY_NAMES` (qits-2491): the Components section's
   * Search reads the project's repositories' names once the field is first focused, and lists
   * those whose name holds the typed text.
   */
  'search-components': 'The Components search lists the project’s repositories matching the text',
  /**
   * `shell.layout.ts`: a Deployments page listed below Deployments in the sidebar opens it, one
   * exit per page (qits-2315: Requests). Navigates only, and names no pact.
   */
  'open-sidebar-deployments-page':
    'A Deployments page below Deployments in the sidebar opens that page',
  /**
   * `shell.layout.ts`: a Maintenance page listed below Maintenance in the sidebar opens it, one exit
   * per page (qits-2317: Dependencies; qits-2330: Artifacts). Navigates only, and names no pact.
   */
  'open-sidebar-maintenance-page':
    'A Maintenance page below Maintenance in the sidebar opens that page',
  /**
   * `shell.layout.ts`: the top bar's desk icon, beside the gear, opens the open project's desk
   * (qits-2484). Navigates only, and names no pact.
   */
  'open-project-desk': 'The top bar’s desk icon opens the project’s desk',
  /**
   * `shell.layout.ts`: below 768px, where the top bar has no desk icon, the Desk entry at the foot
   * of the project's sections in the burger's navigation opens the project's desk (qits-2484).
   * Navigates only, and names no pact.
   */
  'open-sidebar-desk': 'The sidebar’s Desk entry, below 768px, opens the project’s desk',
  /**
   * `shell.layout.ts`: the top bar's gear opens the open project's settings (`setup`). Navigates
   * only, and names no pact (epic qits-2000).
   */
  'open-project-settings': 'The top bar’s gear opens the project’s settings',
  /**
   * `shell.layout.ts`: the sidebar's Network access entry, shown with no project open only
   * (qits-2485), leaves for qits-network-access' own frontend (qits-2262, qits-2361). Leaves the app only, and
   * names no pact.
   */
  'open-sidebar-network-access':
    'The sidebar’s Network access entry opens the Network access frontend',
  /**
   * `shell.layout.ts`: the sidebar's IdP admin, a global section shown with no project open, opens
   * the IdP admin section (`idp`, which opens the clients; qits-2481). Navigates only, and names no
   * pact.
   */
  'open-sidebar-idp': 'The sidebar’s IdP admin entry opens the IdP admin section',
  /**
   * `shell.layout.ts`: the IdP admin section's pages, listed below the sidebar's IdP admin while
   * the section is open, open their page (Clients, Users, Signed-in devices; qits-2481), each the
   * idp's own admin page in a frame. Navigates only, and names no pact.
   */
  'open-sidebar-idp-page': 'An IdP admin page below the sidebar’s IdP admin opens it',
  /**
   * `shell.layout.ts`: the sidebar's Projects, the first global entry shown with no project open,
   * opens the project picker (`projects`, qits-2532). Navigates only, and names no pact.
   */
  'open-sidebar-projects': 'The sidebar’s Projects entry opens the project picker',
  /**
   * `shell.layout.ts`: the sidebar's System, a global section shown with no project open, opens
   * the System section (`system`, which opens the swarm's services; qits-2344). Navigates only,
   * and names no pact.
   */
  'open-sidebar-system': 'The sidebar’s System entry opens the System section',
  /**
   * `shell.layout.ts`: the sidebar's Mirror, a global section shown with no project open, opens
   * the Mirror section (`mirror`, which opens the Caches page; qits-2357, qits-2479). Navigates only, and
   * names no pact.
   */
  'open-sidebar-mirror': 'The sidebar’s Mirror entry opens the Mirror section',
  /**
   * `shell.layout.ts`: the sidebar's Orchestrator, a global section shown with no project open,
   * opens the Orchestrator section (`orchestrator`, which opens the gc process; qits-2359).
   * Navigates only, and names no pact.
   */
  'open-sidebar-orchestrator': 'The sidebar’s Orchestrator entry opens the Orchestrator section',
  /**
   * `shell.layout.ts`: the Mirror section's pages, listed below the sidebar's Mirror while the
   * section is open, open their page (Caches, OCI upstreams; qits-2479). Navigates only, and names
   * no pact.
   */
  'open-sidebar-mirror-page': 'A Mirror page below the sidebar’s Mirror entry opens that page',
  /**
   * `shell.layout.ts`: the System section's pages, listed below the sidebar's System while the
   * section is open, open their page (Services, Nodes; qits-2346; Configs, qits-2348; Targets,
   * qits-2351). Navigates only, and names no pact.
   */
  'open-sidebar-system-page': 'A System page below the sidebar’s System entry opens that page',
  /**
   * `shell.layout.ts`: a process listed below the sidebar's Orchestrator while the section is open
   * opens its page, `orchestrator/processes/<kind>` (qits-2480: Garbage collection, `gc`).
   * Navigates only, and names no pact.
   */
  'open-sidebar-orchestrator-page':
    'A process below the sidebar’s Orchestrator entry opens that process’s page',
  /**
   * `shell.layout.ts`, rendered by `ui-breadcrumbs`: the brand and the crumbs before the current
   * page (in the trail and in the "…" panel) open their pages: home, the picker, the project, and
   * the Work or Releases section above a subpage, and Releases' Requests, Agents or CI page; with
   * no project open, the global section (System, Mirror, Orchestrator or IdP admin) above one of
   * its pages, to its root (qits-2386), and the section's page (Services, Nodes, Configs, Caches)
   * above a page below it (qits-2533). Navigates only, and names no pact (epic qits-2000).
   */
  'follow-breadcrumb': 'A breadcrumb before the current page opens its page',
  /**
   * `agents-menu.ts`: an agent's item in the top bar's agents menu opens the agent's page.
   * Navigates only, and names no pact (epic qits-2000).
   */
  'open-menu-agent': 'An agent in the agents menu opens the agent’s page',
  /**
   * `bumps-menu.ts`: a bump's repository in the top bar's bumps menu opens the bump's page in the
   * open project (qits-2332). Navigates only, and names no pact.
   */
  'open-menu-bump': 'A bump in the bumps menu opens the bump’s page',
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
