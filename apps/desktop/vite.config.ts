import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

/**
 * Two build targets share this config:
 *  - the renderer (React app), which also runs standalone in a browser
 *  - the Electron main + preload bundles, emitted to dist-electron/
 *
 * `npm run dev` starts Vite and launches Electron against it.
 * `npm run build:web` skips Electron entirely.
 */
export default defineConfig(({ mode }) => ({
  // Relative base so `file://` loading works in the packaged app.
  base: './',
  plugins: [
    react(),
    ...(mode === 'web'
      ? []
      : [
          electron({
            main: {
              entry: 'electron/main.ts',
              vite: {
                build: {
                  outDir: 'dist-electron',
                  rollupOptions: { external: ['electron'] },
                },
              },
            },
            preload: {
              input: 'electron/preload.ts',
              vite: {
                build: {
                  outDir: 'dist-electron',
                  rollupOptions: {
                    external: ['electron'],
                    // Emit an unambiguous CommonJS preload. Naming a CJS bundle
                    // ".mjs" makes Electron parse it as ESM and the bridge dies
                    // silently, taking the title bar and file dialogs with it.
                    output: { format: 'cjs', entryFileNames: 'preload.cjs' },
                  },
                },
              },
            },
          }),
        ]),
  ],
  build: {
    outDir: 'dist',
    // The catalogue and engine are large but must load before first paint;
    // a single chunk beats a waterfall of small ones here.
    chunkSizeWarningLimit: 1200,
    sourcemap: mode !== 'production',
  },
  worker: {
    format: 'es',
  },
}))
