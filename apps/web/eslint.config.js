import { iwappEslint } from '@iwapp/config/eslint';

export default [
  ...iwappEslint({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // TanStack Router's documented way to redirect is `throw redirect(...)`, which throws a
      // Redirect object rather than an Error. Allow exactly that type; every other throw must
      // still be an Error.
      '@typescript-eslint/only-throw-error': [
        'error',
        { allow: [{ from: 'package', package: '@tanstack/router-core', name: 'Redirect' }] },
      ],
    },
  },
];
