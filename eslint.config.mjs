// @ts-check
import tseslint from 'typescript-eslint';
import qits from '@qits/angular/eslint';

export default tseslint.config(
  { ignores: ['dist/', '.angular/', 'src/app/api/'] },
  { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
  ...qits.configs.recommended,
  ...climbBans(),
);

/**
 * Reach core/, ui/ and patterns/ through their aliases ($core/…, $ui/…, $patterns/…, see
 * tsconfig.json), never by a relative climb. Everywhere: no relative path that names one of the
 * three. Inside them, also no climb that stays in the tree (`../platform/…` from core/auth/).
 */
function climbBans() {
  const message = 'Import core/, ui/ and patterns/ through $core/, $ui/ or $patterns/.';
  const named = { regex: '^\\.{1,2}/(?:\\.\\./)*(?:.*/)?(?:core|ui|patterns)(?:/|$)', message };
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
  ];
}
