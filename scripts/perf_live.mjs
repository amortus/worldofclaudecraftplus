// Live, USER-DRIVEN performance capture on the REAL GPU.
// Opens a visible Chrome (real GPU, not SwiftShader), boots the game offline at the
// ultra tier, then samples per-frame for LIVE_MS while YOU play in the window (move,
// jump, rotate, drag, spam abilities) to reproduce the freeze. At the end it writes a
// report classifying every hitch (shader-compile / asset-upload / view-build /
// long-task[JS/GC] / other) via the profiler's attributeFreezes, plus draw/texture/
// light/shadow counts. This is the real-GPU + real-inputs capture the headless
// SwiftShader profiler cannot do.
//
//   npm run dev   (:5173)  in another shell, THEN:
//   node scripts/perf_live.mjs
//   env: LIVE_MS (default 150000), LIVE_CLS (default warrior), LIVE_OUT (report path)
import fs from 'node:fs';
import { Profiler } from './profiler/harness.mjs';

const MS = Number(process.env.LIVE_MS ?? 150000);
const CLS = process.env.LIVE_CLS ?? 'warrior';
const OUT = process.env.LIVE_OUT ?? 'scripts/perf_live_report.json';

const p = new Profiler({ width: 1600, height: 900, dpr: 1 });
await p.launch();

// CONFIRM we are on the real GPU (the whole point) - SwiftShader would invalidate this.
const gpu = await p.page.evaluate(() => {
  try {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    if (!g) return 'no-webgl';
    const e = g.getExtension('WEBGL_debug_renderer_info');
    return e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : 'no-debug-ext';
  } catch (err) {
    return 'err:' + String(err);
  }
});
console.log('[perf_live] GPU renderer:', gpu);
const swiftshader = /swiftshader|software|llvmpipe/i.test(gpu);
if (swiftshader) console.log('[perf_live] WARNING: this is a SOFTWARE GPU - results are NOT representative.');

await p.enter({ mode: 'offline', cls: CLS, tier: 'ultra' });
console.log(`[perf_live] READY - game booted at ULTRA. PLAY NOW for ${MS / 1000}s in the window:`);
console.log('[perf_live]   move + jump + rotate camera + drag mouse + spam ability keys, reproduce the freeze.');

const s = await p.sample({ ms: MS, label: 'live' });

const endStats = await p.page.evaluate(() => {
  const g = window.__game;
  const r = g && g.renderer;
  const info = r && r.webgl && r.webgl.info;
  let lights = 0;
  let shadowLights = 0;
  try {
    r.scene.traverse((o) => {
      if (o.isLight) {
        lights++;
        if (o.castShadow) shadowLights++;
      }
    });
  } catch {}
  let shadowMap = null;
  try {
    const sh = r.webgl.shadowMap;
    shadowMap = { enabled: !!sh.enabled, autoUpdate: !!sh.autoUpdate, type: sh.type };
  } catch {}
  return {
    render: info ? { calls: info.render.calls, triangles: info.render.triangles } : null,
    memory: info ? { geometries: info.memory.geometries, textures: info.memory.textures } : null,
    programs: info && info.programs ? info.programs.length : null,
    lights,
    shadowLights,
    shadowMap,
    pixelRatio: (() => {
      try {
        return r.webgl.getPixelRatio();
      } catch {
        return null;
      }
    })(),
  };
});

const report = {
  gpu,
  softwareGpu: swiftshader,
  ms: MS,
  cls: CLS,
  frame: s.frame,
  freezes: s.freezes,
  endStats,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('[perf_live] WROTE', OUT);
try {
  console.log('[perf_live] frame:', JSON.stringify(s.frame));
  console.log('[perf_live] freezes:', JSON.stringify(s.freezes).slice(0, 1200));
} catch {}
await p.browser.close();
