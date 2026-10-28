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
      'qits/browser-spec-data-from-golden-masters': [
        'error',
        { allowTokens: ['EVENT_SOURCE', 'WEB_SOCKET'] },
      ],
    },
  },
  ...climbBans(),
  ...stalenessBans(),
);

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
    // Under `ng serve` only: provides EVENT_SOURCE with the bearer, plumbing rather than staleness.
    except(['src/app/core/auth/dev-bearer.ts'], 'eventSource'),
    // Under `ng serve` only: refreshes the dev bearer before it expires, not platform state.
    except(['src/app/core/auth/dev-tokens.ts'], 'refreshTimer'),
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
