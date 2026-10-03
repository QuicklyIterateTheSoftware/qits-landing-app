// @ts-check
import tseslint from 'typescript-eslint';
import qits from '@qits/angular/eslint';

export default tseslint.config(
  { ignores: ['dist/', '.angular/', 'src/app/api/'] },
  { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
  ...qits.configs.recommended,
  {
    files: ['**/*.ts'],
    // EVENT_SOURCE is a transport seam (a fake stream that never connects); its payloads still go
    // through assertRecorded.
    rules: {
      'qits/browser-spec-data-from-golden-masters': ['error', { allowTokens: ['EVENT_SOURCE'] }],
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
