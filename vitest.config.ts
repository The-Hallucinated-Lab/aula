import { defineConfig } from 'vitest/config'

/**
 * Two very different kinds of test share one runner.
 *
 * `core` is pure computation — no DOM, no globals — so it runs in Node, which
 * is both faster and a standing check that the domain package really is
 * host-agnostic. `desktop` needs a document, so it gets happy-dom.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: 'packages/core',
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'desktop',
          root: 'apps/desktop',
          environment: 'happy-dom',
          include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text-summary', 'json-summary', 'html'],
      include: ['packages/core/src/**', 'apps/desktop/src/**'],
      exclude: ['**/*.test.*', '**/*.d.ts'],
    },
  },
})
