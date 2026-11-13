// @ts-check
import tseslint from 'typescript-eslint';
import qits from '@qits/angular/eslint';

export default tseslint.config(
  { ignores: ['dist/', '.angular/', 'src/app/api/'] },
  { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
  ...qits.configs.recommended,
  {
    files: ['**/*.ts'],
    // EVENT_SOURCE and WEB_SOCKET are transport seams (a fake stream or socket that never
    // connects); EVENT_SOURCE's payloads still go through assertRecorded, and a socket's frames are
    // raw terminal text, which no golden master records.
    rules: {
      // qits-2005: every navigation goes through a declared outcome; the library ships it as a
      // warning.
      'qits/navigation-through-outcomes': 'error',
      'qits/screenshot-kind': 'error',
      // qits-2086: colours come from @qits/ui-components' semantic tokens, never a palette step or a
      // literal.
      'qits/theme-colors': 'error',
      // qits-2075: a route's screenshot is a state of that route, so it shows the whole page; the
      // library ships it as a warning.
      'qits/page-screenshot-whole-page': 'error',
      'qits/browser-spec-data-from-golden-masters': [
        'error',
        { allowTokens: ['EVENT_SOURCE', 'WEB_SOCKET'] },
      ],
      // The screenshot specs' app route helper sets every client up, as `app.config.ts` does
      // (qits-1997); it calls none of them.
      'qits/client-only-in-stores': [
        'error',
        {
          allow: ['src/app/app.config*.ts', 'src/main*.ts', 'src/testing/browser/app-route.ts'],
        },
      ],
    },
  },
  ...climbBans(),
  ...stalenessBans(),
  ...dataMarks(),
);

/**
 * qits-2146: the routes move from signal stores to `qitsResource` / `qitsMutation` (qits-2145) and
 * mark what they show (qits-2141), one group of routes at a time, after the Agents page's pilot
 * (qits-2143). A moved file reads no store that calls a client (`qits/reads-through-resources`),
 * and every API value a moved component renders sits under a `qitsField` inside a `qitsEntity` /
 * `qitsEntityList` (`qits/data-through-fields`, which needs typed linting to find the `input()`s
 * holding API data). Each group appends its pages, layouts, patterns and the core services it
 * moved to the two lists below; when the last group has moved, both lists become `src/app/**\/*.ts`
 * (the client set-up in `app.config*.ts` and `main*.ts` left out of the first) and this function
 * is folded into the app-wide config.
 */
function dataMarks() {
  /** Pages, layouts and patterns: both rules. */
  const components = [
    // qits-2143, the pilot: the Agents page and its rows.
    'src/app/routes/projects/[[]slug]/agents/project-agents.page.ts',
    'src/app/patterns/workspaces/agent-row/agent-row.ts',
    'src/app/patterns/agents/agent-status/agent-status.ts',
    // Group 1, the shell and the projects routes.
    'src/app/layout/shell/shell.layout.ts',
    'src/app/patterns/agents/agents-menu/agents-menu.ts',
    'src/app/patterns/events/notifications-menu/notifications-menu.ts',
    'src/app/patterns/maintenance/bumps-menu/bumps-menu.ts',
    'src/app/routes/root.page.ts',
    'src/app/routes/projects/project-picker.page.ts',
    'src/app/routes/projects/[[]slug]/project.page.ts',
    'src/app/routes/projects/[[]slug]/setup/project-setup.page.ts',
    'src/app/routes/network-access/network-access.page.ts',
    // Group 2, the repositories routes.
    'src/app/routes/projects/[[]slug]/repositories/project-repositories.page.ts',
    'src/app/routes/projects/[[]slug]/repositories/[[]repo]/entities/entities.page.ts',
    'src/app/routes/projects/[[]slug]/repositories/[[]repo]/entities/[[]entity]/entity.page.ts',
    'src/app/routes/projects/[[]slug]/repositories/[[]repo]/contracts/contracts.page.ts',
    'src/app/routes/projects/[[]slug]/repositories/[[]repo]/contracts/[[]state]/contract-state.page.ts',
    'src/app/routes/projects/[[]slug]/repositories/[[]repo]/ui-builder/ui-builder.page.ts',
    'src/app/patterns/projects/project-card/project-card.ts',
    'src/app/patterns/repositories/repository-card/repository-card.ts',
    'src/app/patterns/repositories/remote-login-panel/remote-login-panel.ts',
    'src/app/patterns/contracts/contracts-frame/contracts-frame.ts',
    'src/app/patterns/contracts/er-diagram-box/er-diagram-box.ts',
    'src/app/patterns/ui-builder/call-details/call-details.ts',
    // Group 3, the ideas, desk, events and observability routes.
    'src/app/routes/projects/[[]slug]/ideas/project-ideas.page.ts',
    'src/app/routes/projects/[[]slug]/ideas/create/idea-create.page.ts',
    'src/app/routes/projects/[[]slug]/ideas/detail/[[]ideaId]/idea.page.ts',
    'src/app/routes/projects/[[]slug]/ideas/detail/[[]ideaId]/edit/idea-edit.page.ts',
    'src/app/routes/projects/[[]slug]/desk/project-desk.page.ts',
    'src/app/routes/projects/[[]slug]/events/project-events.page.ts',
    'src/app/routes/projects/[[]slug]/observability/project-observability.page.ts',
    'src/app/patterns/ideas/idea-form/idea-form.ts',
    'src/app/patterns/ideas/work-inspiration/work-inspiration.ts',
    'src/app/patterns/desk/open-issues/open-issues.ts',
    'src/app/patterns/desk/issue-description/issue-description.ts',
    // Group 4, the agent and workspace routes.
    'src/app/routes/projects/[[]slug]/agents/[[]agentId]/agent.layout.ts',
    'src/app/routes/projects/[[]slug]/agents/[[]agentId]/chat/agent-chat.page.ts',
    'src/app/routes/projects/[[]slug]/agents/[[]agentId]/files/agent-files.page.ts',
    'src/app/routes/projects/[[]slug]/agents/[[]agentId]/terminal/agent-terminal.page.ts',
    'src/app/routes/projects/[[]slug]/workspaces/[[]slotId]/workspace-slot.page.ts',
    'src/app/patterns/workspaces/agent-discard/agent-discard.ts',
    'src/app/patterns/workspaces/agent-run-actions/agent-run-actions.ts',
    'src/app/patterns/workspaces/container-actions/container-actions.ts',
    'src/app/patterns/workspaces/conversation/conversation.ts',
    'src/app/patterns/workspaces/copy-text/copy-text.ts',
    'src/app/patterns/workspaces/file-filter-dialog/file-filter-dialog.ts',
    'src/app/patterns/workspaces/file-tree/file-tree.ts',
    'src/app/patterns/workspaces/file-viewer/file-viewer.ts',
    'src/app/patterns/workspaces/harness-setup/harness-setup.ts',
    'src/app/patterns/workspaces/plugins-section/plugins-section.ts',
    'src/app/patterns/workspaces/prompt-composer/prompt-composer.ts',
    'src/app/patterns/workspaces/sign-in-notice/sign-in-notice.ts',
    'src/app/patterns/workspaces/slot-status/slot-status.ts',
    'src/app/patterns/workspaces/starting-log/starting-log.ts',
    // Group 5, the release request routes.
    'src/app/routes/projects/[[]slug]/release-requests/release-requests.page.ts',
    'src/app/routes/projects/[[]slug]/release-requests/[[]requestId]/release-request.page.ts',
    'src/app/patterns/release-requests/active-runs/active-runs.ts',
    'src/app/patterns/release-requests/approval-requirements/approval-requirements.ts',
    'src/app/patterns/release-requests/commit-changes/commit-changes.ts',
    'src/app/patterns/release-requests/release-approval/release-approval.ts',
    'src/app/patterns/release-requests/release-automations/release-automations.ts',
    'src/app/patterns/release-requests/release-changes/release-changes.ts',
    'src/app/patterns/release-requests/release-conflict/release-conflict.ts',
    'src/app/patterns/release-requests/release-lane-header/release-lane-header.ts',
    'src/app/patterns/release-requests/release-lifecycle/release-lifecycle.ts',
    'src/app/patterns/release-requests/release-menu/release-menu.ts',
    'src/app/patterns/release-requests/release-request-row/release-request-row.ts',
    'src/app/patterns/release-requests/release-runs/release-runs.ts',
    'src/app/patterns/release-requests/release-withdraw/release-withdraw.ts',
    'src/app/patterns/release-requests/run-reports/run-reports.ts',
    'src/app/patterns/release-requests/upstream-override/upstream-override.ts',
    'src/app/patterns/system/runner-slots/runner-slots.ts',
  ];
  /** The root services holding the resources those share: no store, no client. */
  const services = [
    // Group 1.
    'src/app/core/projects/selected-project.ts',
    'src/app/core/projects/project-release-requests.ts',
    'src/app/core/projects/project-detail.ts',
    'src/app/core/workspaces/project-active-agents.ts',
    // Group 2.
    'src/app/core/loc/lines-of-code.ts',
    'src/app/core/ui-builder/contracts-catalog.ts',
    'src/app/core/ui-builder/routes-bundles.ts',
    'src/app/core/contracts/contracts-bundles.ts',
    // Group 5.
    'src/app/core/githost/raw-images.ts',
  ];
  return [
    { files: [...components, ...services], rules: { 'qits/reads-through-resources': 'error' } },
    {
      files: components,
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      },
      rules: { 'qits/data-through-fields': 'error' },
    },
  ];
}

/**
 * qits-1270: platform state goes stale only through the one qits-events subscription
 * (`DomainEvents`, read through `refreshOn` in `src/app/core/events/`), never through a stream of
 * its own, a poll or a refresh timer. Outside `core/events/`, refuse each kind; a file named below
 * is allowed exactly the kinds it needs, each with its reason.
 */
function stalenessBans() {
  const where =
    'Platform state refreshes from DomainEvents (refreshOn, src/app/core/events/), never from a stream, poll or timer of its own (qits-1270).';
  /** Names a refresh calls: refresh*, reload*, load*, fetch*, poll*, tick*. */
  const refreshName = '/^(?:[Rr]efresh|[Rr]eload|[Ll]oad|[Ff]etch|[Pp]oll|[Tt]ick)/';
  const setTimeout =
    ":matches(CallExpression[callee.name='setTimeout'], CallExpression[callee.property.name='setTimeout'])";
  const kinds = {
    eventSource: [
      { selector: "Identifier[name='EventSource']", message: `No EventSource. ${where}` },
      {
        selector: "ImportSpecifier[imported.name='EVENT_SOURCE']",
        message: `No EVENT_SOURCE outside core/events. ${where}`,
      },
    ],
    interval: [
      {
        selector:
          ":matches(CallExpression[callee.name='setInterval'], CallExpression[callee.property.name='setInterval'])",
        message: `No setInterval. ${where}`,
      },
    ],
    rxjsTimers: [
      {
        selector:
          'ImportDeclaration[source.value=/^rxjs/] > ImportSpecifier[imported.name=/^(?:interval|timer)$/]',
        message: `No rxjs interval or timer. ${where}`,
      },
    ],
    refreshTimer: [
      {
        // A callback that calls a refresh: setTimeout(() => void this.refresh(), …).
        selector: `${setTimeout} > :matches(ArrowFunctionExpression, FunctionExpression):first-child :matches(CallExpression[callee.name=${refreshName}], CallExpression[callee.property.name=${refreshName}])`,
        message: `No refresh timer. ${where}`,
      },
      {
        // A refresh handed as the callback: setTimeout(this.refresh, …), setTimeout(load, …).
        selector: `${setTimeout} > :matches(Identifier[name=${refreshName}], MemberExpression[property.name=${refreshName}]):first-child`,
        message: `No refresh timer. ${where}`,
      },
    ],
  };
  const except = (files, ...allowed) => ({
    files,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...Object.entries(kinds).flatMap(([kind, bans]) => (allowed.includes(kind) ? [] : bans)),
      ],
    },
  });
  return [
    except(['src/**/*.ts']),
    // The one stream, its transport and the refresh debounce live here.
    { files: ['src/app/core/events/**/*.ts'], rules: { 'no-restricted-syntax': 'off' } },
    // Specs and their fixtures fake the streams and drive the timers.
    { files: ['**/*.spec.ts', 'src/testing/**/*.ts'], rules: { 'no-restricted-syntax': 'off' } },
    // A container start's log: one process's own byte stream, not a domain event.
    except(['src/app/core/workspaces/process-log.ts'], 'eventSource'),
    // TEMPORARY (qits-1270): qits-workspaces' per-slot hint channel (`commands`, `prompt-draft`,
    // `files`), which no qits-events event replaces yet.
    except(['src/app/core/workspaces/workspace-hints.ts'], 'eventSource'),
    // TEMPORARY (qits-1270): the 3 s transcript poll (TRANSCRIPT_POLL_MS); the workspace daemon
    // offers no transcript stream.
    except(
      ['src/app/routes/projects/[[]slug]/agents/[[]agentId]/chat/agent-chat.page.ts'],
      'interval',
    ),
  ];
}

/**
 * Reach core/, ui/, patterns/ and layout/ through their aliases ($core/…, $ui/…, $patterns/…,
 * $layout/…, see tsconfig.json), never by a relative climb. Everywhere: no relative path that names
 * one of the four. Inside them, also no climb that stays in the tree (`../platform/…` from core/auth/).
 */
function climbBans() {
  const message =
    'Import core/, ui/, patterns/ and layout/ through $core/, $ui/, $patterns/ or $layout/.';
  const named = {
    regex: '^\\.{1,2}/(?:\\.\\./)*(?:.*/)?(?:core|ui|patterns|layout)(?:/|$)',
    message,
  };
  const ban = (files, ...regexes) => ({
    files,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [named, ...regexes.map((regex) => ({ regex, message }))] },
      ],
    },
  });
  return [
    ban(['src/**/*.ts']),
    // core/<domain>/x.ts: one `../` leaves the domain but stays in core.
    ban(['src/app/core/*/**/*.ts'], '^\\.\\./(?!\\.\\./)'),
    // patterns/<domain>/<component>/x.ts and ui/components/<component>/x.ts: one or two `../` stay.
    ban(
      ['src/app/patterns/*/*/**/*.ts', 'src/app/ui/*/*/**/*.ts'],
      '^\\.\\./(?:\\.\\./)?(?!\\.\\./)',
    ),
    // layout/<component>/x.ts: one `../` stays in layout.
    ban(['src/app/layout/*/**/*.ts'], '^\\.\\./(?!\\.\\./)'),
  ];
}
