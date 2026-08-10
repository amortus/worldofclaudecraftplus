// Play Asset Delivery staging + verification for the Android build.
//
// `npx cap sync android` deletes and re-copies dist/ into
// android/app/src/main/assets/public, so the hashed media set lands back in the
// BASE module every time. This script runs right after the sync and moves
// dist/media out of the base module and into the install-time asset pack at
// android/mediapack.
//
// The destination path mirrors the base module exactly (assets/public/media),
// because install-time asset packs are merged into the app's AssetManager
// namespace: Capacitor's WebViewLocalServer resolves http://localhost/media/x
// by calling context.getAssets().open("public/media/x"), and that lookup spans
// the base APK and every installed split. No native bridge, no JS change, and
// the plain web build never sees any of this.
//
// Usage:
//   node scripts/android_asset_pack.mjs stage    (default)
//   node scripts/android_asset_pack.mjs verify [path/to/app-release.aab]

import { cpSync, existsSync, mkdirSync, openSync, readSync, closeSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const APP_ASSETS = path.join(root, 'android/app/src/main/assets/public');
const PACK_MODULE = path.join(root, 'android/mediapack');
const PACK_ASSETS = path.join(PACK_MODULE, 'src/main/assets/public');
const MEDIA_DIR = 'media';
const DEFAULT_AAB = path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab');

function walk(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

function measure(dir) {
  if (!existsSync(dir)) return { files: 0, bytes: 0 };
  const files = walk(dir);
  return { files: files.length, bytes: files.reduce((n, f) => n + statSync(f).size, 0) };
}

function mib(bytes) {
  return `${(bytes / 1048576).toFixed(2)} MiB`;
}

function stage() {
  if (!existsSync(PACK_MODULE)) {
    console.error(`missing asset pack module at ${path.relative(root, PACK_MODULE)}`);
    process.exit(1);
  }
  const src = path.join(APP_ASSETS, MEDIA_DIR);
  const dest = path.join(PACK_ASSETS, MEDIA_DIR);

  if (!existsSync(src)) {
    // Idempotent: a second run after a sync-less rebuild is a no-op as long as
    // the pack is already populated.
    const already = measure(dest);
    if (already.files > 0) {
      console.log(`asset pack already staged: ${already.files} files, ${mib(already.bytes)}`);
      return;
    }
    console.error(
      `no media found at ${path.relative(root, src)} and the pack is empty. ` +
        'Run the native build and `npx cap sync android` first.',
    );
    process.exit(1);
  }

  const moved = measure(src);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(path.dirname(dest), { recursive: true });
  // Copy-then-remove rather than a bare rename. On Windows the Gradle daemon keeps
  // handles open on android/app/src/main/assets after a build, so renaming the source
  // directory fails with EPERM on every run after the first. That failure was silent
  // in practice: the pack stayed empty, the media stayed in the BASE module, and
  // gradle then had nothing to rebuild, so a STALE aab sat on disk while `verify`
  // happily read it and passed.
  cpSync(src, dest, { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      rmSync(src, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      break;
    } catch (err) {
      if (attempt >= 3) {
        console.error(`FAIL: could not remove ${path.relative(root, src)} after staging.`);
        console.error('Media would ship in BOTH the base module and the pack. Close any');
        console.error('running Gradle daemon (./gradlew --stop) and re-run.');
        throw err;
      }
    }
  }
  if (existsSync(src)) {
    console.error(`FAIL: ${path.relative(root, src)} still exists after staging`);
    process.exit(1);
  }

  const base = measure(APP_ASSETS);
  console.log(
    `staged ${moved.files} media files (${mib(moved.bytes)}) into the mediapack asset pack; ` +
      `base module web assets now ${base.files} files (${mib(base.bytes)})`,
  );
}

// Minimal zip central-directory reader. An .aab is a zip, and the central
// directory alone gives every entry name plus its compressed and uncompressed
// size, so we can prove where the media landed without decompressing anything
// and without bundletool (which is not installed here).
function readZipEntries(file) {
  const size = statSync(file).size;
  const fd = openSync(file, 'r');
  try {
    // End of central directory record, scanning back over the max comment size.
    const tailLen = Math.min(size, 0x10000 + 22);
    const tail = Buffer.alloc(tailLen);
    readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('not a zip file (no end of central directory)');

    let count = tail.readUInt16LE(eocd + 10);
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);

    // Zip64: the 32-bit fields saturate past 4 GiB or 65535 entries.
    if (cdOffset === 0xffffffff || count === 0xffff || cdSize === 0xffffffff) {
      let loc = -1;
      for (let i = eocd - 20; i >= 0; i--) {
        if (tail.readUInt32LE(i) === 0x07064b50) {
          loc = i;
          break;
        }
      }
      if (loc < 0) throw new Error('zip64 locator not found');
      const z64Offset = Number(tail.readBigUInt64LE(loc + 8));
      const z64 = Buffer.alloc(56);
      readSync(fd, z64, 0, 56, z64Offset);
      count = Number(z64.readBigUInt64LE(32));
      cdSize = Number(z64.readBigUInt64LE(40));
      cdOffset = Number(z64.readBigUInt64LE(48));
    }

    const cd = Buffer.alloc(cdSize);
    readSync(fd, cd, 0, cdSize, cdOffset);

    const entries = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory header');
      const compressed = cd.readUInt32LE(p + 20);
      const uncompressed = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
      entries.push({ name, compressed, uncompressed });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally {
    closeSync(fd);
  }
}

function verify(aabPath) {
  const file = aabPath ?? DEFAULT_AAB;
  if (!existsSync(file)) {
    console.error(`no bundle at ${path.relative(root, file)}`);
    process.exit(1);
  }
  const entries = readZipEntries(file);

  const modules = new Map();
  for (const e of entries) {
    const top = e.name.split('/')[0];
    if (top === 'BUNDLE-METADATA' || top === 'META-INF') continue;
    const m = modules.get(top) ?? { files: 0, compressed: 0, uncompressed: 0, media: 0 };
    m.files++;
    m.compressed += e.compressed;
    m.uncompressed += e.uncompressed;
    if (e.name.startsWith(`${top}/assets/public/media/`)) m.media++;
    modules.set(top, m);
  }

  console.log(`bundle: ${path.relative(root, file)} (${mib(statSync(file).size)} on disk)`);
  console.log('module              files   compressed   uncompressed   media files');
  for (const [name, m] of [...modules].sort()) {
    console.log(
      `${name.padEnd(20)}${String(m.files).padStart(5)}${mib(m.compressed).padStart(13)}${mib(m.uncompressed).padStart(15)}${String(m.media).padStart(14)}`,
    );
  }

  const base = modules.get('base') ?? { media: 0 };
  const pack = modules.get('mediapack') ?? { media: 0 };
  let failed = false;
  if (base.media !== 0) {
    console.error(`FAIL: ${base.media} media files are still in the base module`);
    failed = true;
  }
  if (pack.media === 0) {
    console.error('FAIL: the mediapack asset pack carries no media files');
    failed = true;
  }
  if (failed) process.exit(1);
  console.log(`OK: ${pack.media} media files live only in the mediapack asset pack`);
}

const cmd = process.argv[2] ?? 'stage';
if (cmd === 'stage') stage();
else if (cmd === 'verify') verify(process.argv[3]);
else {
  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}
