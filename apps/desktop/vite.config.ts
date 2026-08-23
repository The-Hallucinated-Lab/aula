import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

/**
 * Content-Security-Policy for the renderer.
 *
 * The packaged app loads from `file://`, where response headers do not exist,
 * so the policy has to travel inside the document. `default-src 'none'` makes
 * the list below exhaustive: no remote script, no remote stylesheet, no font
 * from a CDN, no XHR, no WebSocket, no frame.
 *
 * `style-src` allows inline because React writes `style` attributes — a
 * styling channel, not a script channel, and `script-src` stays locked.
 *
 * `connect-src 'none'` is the load-bearing one. The renderer talks to nothing.
 * The local model is reached through a main-process IPC relay, which this
 * policy does not govern and therefore cannot be widened by tampering with the
 * page.
 */
const PRODUCTION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'none'",
  "worker-src 'self' blob:",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ')

/**
 * Development needs three holes the shipped policy must never have: Vite's
 * injected inline bootstrap, its HMR WebSocket, and the eval-shaped module
 * runner. They are granted here and nowhere else, so a mistake cannot leak
 * into a build.
 */
const DEVELOPMENT_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws: http://localhost:*",
  "worker-src 'self' blob:",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'aula-csp',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const policy = ctx.server ? DEVELOPMENT_CSP : PRODUCTION_CSP
        return html.replace(
          '<!--CSP-->',
          `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        )
      },
    },
  }
}

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
    contentSecurityPolicy(),
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
