import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * Flat ESLint config. Intentionally lenient to start: it establishes lint infrastructure and
 * catches real mistakes (unused disable directives, obvious errors) without drowning the codebase
 * in style churn. Tighten rules incrementally.
 */
export default tseslint.config(
  {
    ignores: [
      'out/**',
      'release/**',
      'dist/**',
      'dist-electron/**',
      'node_modules/**',
      '**/*.d.ts'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase deliberately uses `any` at a few IPC/JSON boundaries; not a bug signal here.
      '@typescript-eslint/no-explicit-any': 'off',
      // Unused-locals is already handled (off) in tsconfig; keep ESLint from duplicating the noise,
      // but still flag unused args/vars unless prefixed with _.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // TypeScript already resolves identifiers/globals, so ESLint's no-undef is redundant here
      // and misfires on Node/DOM globals (setTimeout, URL) — the typescript-eslint recommendation.
      'no-undef': 'off',
      // Several capture/redaction regexes intentionally match NUL / control characters.
      'no-control-regex': 'off'
    }
  },
  {
    // Node/CLI scripts and test loaders run outside the TS app; allow require-style/globals.
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', '*.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly' }
    }
  }
)
