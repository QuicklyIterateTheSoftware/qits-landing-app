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
);

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
