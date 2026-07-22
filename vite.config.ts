import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// Untyped zero-dep build helper (same convention as the other scripts/*.mjs tools).
// vite.config.ts is outside tsconfig `include`, so this import is never type-checked.
import { templateModulepreload } from './scripts/i18n_modulepreload.mjs';
// Dev-only (`apply: 'serve'`) write-back endpoint for the map editor; never in a build.
import { editorApplyPlugin } from './src/editor/apply/dev_plugin';

const root = fileURLToPath(new URL('.', import.meta.url));

// `#bot-detector` → the private detector if its clone is present, else the no-op
// stub. Mirrors scripts/build_server.mjs (bundle) and tsconfig.json `paths` (tsc).
const privateBotDetector = fileURLToPath(new URL('private/bot_detector/src/index.ts', import.meta.url));
const botDetectorImpl = existsSync(privateBotDetector)
  ? privateBotDetector
  : fileURLToPath(new URL('server/bot_detector/stub.ts', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as { version?: string };

// The native/AAB build (`npm run build:native`) sets VITE_NATIVE_APP=1. The dev-only
// marker map editor (editor.html) is a web/desktop authoring aid, so it is EXCLUDED
// from the native input below: it must never ship inside the packaged mobile app.
const isNativeBuild = process.env.VITE_NATIVE_APP === '1';

function env(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function gitSha(): string | undefined {
  try {
    return execSync('git rev-parse --short=12 HEAD', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

const appVersion = pkg.version ?? env(['APP_VERSION', 'npm_package_version']) ?? '0.0.0';
const appBuildDate = env(['APP_BUILD_DATE', 'BUILD_DATE']) ?? new Date().toISOString();
const appBuildId = env([
  'APP_BUILD_ID',
  'APP_BUILD_NUMBER',
  'BUILD_NUMBER',
  'GITHUB_RUN_NUMBER',
  'RENDER_BUILD_ID',
  'RENDER_GIT_COMMIT',
  'VERCEL_GIT_COMMIT_SHA',
  'CF_PAGES_COMMIT_SHA',
]) ?? gitSha() ?? appBuildDate.replace(/[-:TZ.]/g, '').slice(0, 12);

// Pretty-URL aliases for standalone static HTML pages. Mirrors the production
// server rewrite in server/main.ts so these paths resolve in dev and preview too.
const STATIC_PAGE_ALIASES = new Map([
  ['/links', '/links.html'],
  ['/links/', '/links.html'],
  ['/social', '/links.html'],
  ['/social/', '/links.html'],
  ['/social-media-links', '/links.html'],
  ['/social-media-links/', '/links.html'],
  ['/play', '/play.html'],
  ['/play/', '/play.html'],
  ['/privacy', '/privacy.html'],
  ['/privacy/', '/privacy.html'],
  ['/terms', '/terms.html'],
  ['/terms/', '/terms.html'],
  ['/merch', '/merch.html'],
  ['/merch/', '/merch.html'],
  ['/press', '/press.html'],
  ['/press/', '/press.html'],
  ['/data-deletion', '/data-deletion.html'],
  ['/data-deletion/', '/data-deletion.html'],
  ['/support', '/support.html'],
  ['/support/', '/support.html'],
  ['/wiki', '/guide.html'],
  ['/wiki/', '/guide.html'],
  // Dev-only marker map editor (noindex). Mirrors the server alias in server/main.ts.
  ['/editor', '/editor.html'],
  ['/editor/', '/editor.html'],
]);
// The Guide is the site wiki: a client-routed SPA at /wiki. Deep paths like
// /wiki/classes/warrior have no static file, so any extensionless /wiki* request falls
// back to guide.html (mirrored in server/main.ts serveStatic). Asset requests under
// /wiki keep their extension and are left alone so they 404 rather than serving HTML.
function isGuideSpaPath(pathOnly: string): boolean {
  if (pathOnly !== '/wiki' && !pathOnly.startsWith('/wiki/')) return false;
  const last = pathOnly.slice(pathOnly.lastIndexOf('/') + 1);
  return !last.includes('.');
}
function staticPageAliasPlugin() {
  const rewrite = (req: { url?: string }) => {
    const url = req.url ?? '';
    const pathOnly = url.split('?')[0];
    const target = STATIC_PAGE_ALIASES.get(pathOnly) ?? (isGuideSpaPath(pathOnly) ? '/guide.html' : undefined);
    if (target) req.url = target + url.slice(pathOnly.length);
  };
  const attach = (server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) => {
    server.middlewares.use((req, _res, next) => { rewrite(req); next(); });
  };
  return { name: 'woc-static-page-alias', configureServer: attach, configurePreviewServer: attach };
}

// Phase 4 (i18n Lazy Locales): after the production build, resolve each lazy locale
// chunk's content-hashed URL from Vite's manifest and template a { locale: hashedChunkUrl }
// lookup into dist/index.html. The inline boot <script> reads it to modulepreload a stored
// non-en visitor's locale chunk before main parses. Build-only: in dev the inline script's
// sentinel stays undefined (no-op). The manifest is metadata, so enabling it does not move
// the resolved-table SHA. See scripts/i18n_modulepreload.mjs.
function i18nModulepreloadPlugin() {
  let outDir = path.resolve(root, 'dist');
  let base = '/';
  return {
    name: 'woc-i18n-modulepreload',
    apply: 'build' as const,
    configResolved(cfg: { root: string; base: string; build: { outDir: string } }) {
      base = cfg.base || '/';
      outDir = path.isAbsolute(cfg.build.outDir)
        ? cfg.build.outDir
        : path.resolve(cfg.root, cfg.build.outDir);
    },
    closeBundle() {
      const { map } = templateModulepreload({ root, outDir, base });
      // eslint-disable-next-line no-console
      console.log(`[i18n] modulepreload: templated ${Object.keys(map).length} locale chunk URLs into index.html`);
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [staticPageAliasPlugin(), i18nModulepreloadPlugin(), editorApplyPlugin()],
  resolve: { alias: { '#bot-detector': botDetectorImpl } },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_ID__: JSON.stringify(appBuildId.slice(0, 12)),
    __APP_BUILD_DATE__: JSON.stringify(appBuildDate),
  },
  // Parent dir has a postcss.config.js with Tailwind — ignore it; this project has no CSS pipeline.
  css: {
    postcss: {
      plugins: [],
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/admin/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
      // MediaWiki community wiki runs as its own container on :8080. Proxy /wiki*
      // to it so the in-app "Browse the Wiki" link resolves in dev too — mirrors
      // the prod reverse-proxy route (nginx /wiki -> :8080). Needs the container
      // up: `docker compose up -d mediawiki mediawiki-db`.
      '/wiki': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // Emit dist/.vite/manifest.json so the Phase 4 modulepreload hook can resolve each
    // lazy locale chunk's content-hashed filename. Metadata only - does not perturb the
    // bundle or move the resolved-table SHA.
    manifest: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        admin: fileURLToPath(new URL('admin.html', import.meta.url)),
        play: fileURLToPath(new URL('play.html', import.meta.url)),
        guide: fileURLToPath(new URL('guide.html', import.meta.url)),
        // Dev-only marker editor: web/desktop authoring aid, kept out of the native
        // build so the packaged mobile app never bundles it (see isNativeBuild).
        ...(isNativeBuild ? {} : { editor: fileURLToPath(new URL('editor.html', import.meta.url)) }),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'vendor-three';
          if (id.includes('node_modules/')) return 'vendor';
        },
      },
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
    // Runs per test file. Node 22+ exposes a broken localStorage global that beats
    // jsdom's implementation, which is one root of our historically flaky
    // jsdom-environment tests; see the setup file for the full story.
    setupFiles: ['./tests/jsdom_local_storage_setup.ts'],
  },
});
