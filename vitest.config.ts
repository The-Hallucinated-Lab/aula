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
      {
        // The scaffolding CLI. Node, no DOM, and it runs from TypeScript
        // source without a build — which is only possible because
        // `erasableSyntaxOnly` is enforced repo-wide.
        test: {
          name: 'cli',
          root: 'tools/cli',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        // The main process is Node, not a document. Keeping it a separate
        // project means a test here cannot accidentally lean on a DOM the real
        // runtime does not have.
        test: {
          name: 'electron',
          root: 'apps/desktop',
          environment: 'node',
          include: ['electron/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text-summary', 'json-summary', 'html'],
      include: [
        'packages/core/src/**',
        'apps/desktop/src/**',
        'apps/desktop/electron/**',
        'tools/cli/src/**',
      ],
      exclude: ['**/*.test.*', '**/*.d.ts'],
    },
  },
})
