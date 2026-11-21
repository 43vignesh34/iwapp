// Shared ESLint preset. Each workspace has a two-line eslint.config.js that calls this.
import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Module boundaries (CLAUDE.md → Coding conventions → Modules, and ADR 0001).
 * Each folder in src/modules/<domain>/ is a module. Code in one module may import another
 * module only through that module's index.ts, never its routes, service or repo directly.
 * Inside its own module, a file may import anything.
 */
const moduleBoundaries = {
  plugins: { boundaries },
  settings: {
    'boundaries/elements': [{ type: 'module', pattern: 'src/modules/*', capture: ['domain'] }],
  },
  rules: {
    'boundaries/dependencies': [
      'error',
      {
        default: 'allow',
        policies: [
          {
            // Later policies win, so start by forbidding every module → module import…
            from: { element: { type: 'module' } },
            disallow: { to: { element: { type: 'module' } } },
            message:
              'Import other modules only through their index.ts ({{ to.element.captured.domain }} module)',
          },
          {
            // …then allow importing a module's public index.ts…
            from: { element: { type: 'module' } },
            allow: { to: { element: { type: 'module', fileInternalPath: 'index.ts' } } },
          },
          {
            // …and allow any import inside the same module.
            from: { element: { type: 'module' } },
            allow: {
              to: {
                element: {
                  type: 'module',
                  captured: { domain: '{{ from.element.captured.domain }}' },
                },
              },
            },
          },
        ],
      },
    ],
  },
};

/**
 * @param {{ tsconfigRootDir: string, moduleBoundaries?: boolean }} options
 *   tsconfigRootDir:  the workspace folder, so type-aware rules find the right tsconfig.json.
 *   moduleBoundaries: turn on the module boundaries rule (apps/api only).
 */
export function iwappEslint({ tsconfigRootDir, moduleBoundaries: withBoundaries = false }) {
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

    withBoundaries ? { files: ['src/**/*.ts'], ...moduleBoundaries } : {},

    // Plain JS files (config files) aren't in a tsconfig, so skip the type-aware rules for them.
    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: { globals: globals.node },
    },
  );
}
