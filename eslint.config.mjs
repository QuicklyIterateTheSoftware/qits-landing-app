// @ts-check
import tseslint from 'typescript-eslint';
import qits from '@qits/angular/eslint';

export default tseslint.config(
  { ignores: ['dist/', '.angular/', 'src/app/api/'] },
  { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
  ...qits.configs.recommended,
);
