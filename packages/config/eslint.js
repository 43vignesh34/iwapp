// Shared ESLint preset. Each workspace has a two-line eslint.config.js that calls this.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * @param {{ tsconfigRootDir: string }} options
 *   tsconfigRootDir: the workspace folder, so type-aware rules find the right tsconfig.json.
 */
export function iwappEslint({ tsconfigRootDir }) {
  return defineConfig(
    globalIgnores(['dist/**', 'coverage/**', '.turbo/**']),
    js.configs.recommended,

    // Type-aware rules: they use the TypeScript compiler to catch bugs plain lint can't
    // (floating promises, unsafe `any` flowing through, impossible conditions).
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    { languageOptions: { parserOptions: { projectService: true, tsconfigRootDir } } },

    {
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/consistent-type-imports': 'error',
      },
    },

    // Plain JS files (config files) aren't in a tsconfig, so skip the type-aware rules for them.
    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: { globals: globals.node },
    },
  );
}
