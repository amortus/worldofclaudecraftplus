// Dev-only write-back endpoint. A vite plugin that, ONLY while `npm run dev` is
// running (`apply: 'serve'`), exposes POST /editor/apply. It takes the editor's apply
// ops, locates each record's unique source literal across src/sim/content/*.ts, and
// rewrites just the changed values, backing each touched file up to <file>.bak first.
//
// This never ships: vite plugins are Node-side config, absent from the client bundle,
// and `apply: 'serve'` keeps it out of `vite build`. It writes ONLY under
// src/sim/content, and refuses any op whose match is not unique (0 or >1 literals, or
// a match in more than one file), so it can never corrupt a file by guessing.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { applyEdits, locateObjectEdit, type TextEdit } from './edit_source';
import type { ApplyOp, ApplyReport } from './types';

export function editorApplyPlugin(): Plugin {
  return {
    name: 'woc-editor-apply',
    apply: 'serve', // dev server only; never part of a production build
    configureServer(server) {
      const contentDir = join(server.config.root, 'src', 'sim', 'content');
      server.middlewares.use('/editor/apply', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const ops: ApplyOp[] = JSON.parse(body).ops ?? [];
            const report = applyOps(contentDir, ops);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(report));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });
    },
  };
}

function applyOps(contentDir: string, ops: readonly ApplyOp[]): ApplyReport {
  const files = readdirSync(contentDir).filter((f) => f.endsWith('.ts'));
  const texts = new Map<string, string>();
  for (const f of files) texts.set(f, readFileSync(join(contentDir, f), 'utf8'));

  const pendingByFile = new Map<string, TextEdit[]>();
  const skipped: { label: string; reason: string }[] = [];
  let applied = 0;

  for (const op of ops) {
    const hits: { file: string; edits: TextEdit[] }[] = [];
    let ambiguous = false;
    for (const [file, text] of texts) {
      const r = locateObjectEdit(text, op.match, op.updates, file);
      if ('edits' in r) hits.push({ file, edits: r.edits });
      else if (r.error.startsWith('ambiguous')) ambiguous = true;
    }
    if (ambiguous) {
      skipped.push({ label: op.label, reason: 'multiple literals matched in a file; edit it by hand' });
      continue;
    }
    if (hits.length === 0) {
      skipped.push({ label: op.label, reason: 'source literal not found' });
      continue;
    }
    if (hits.length > 1) {
      skipped.push({ label: op.label, reason: `matched in ${hits.length} files; edit it by hand` });
      continue;
    }
    const { file, edits } = hits[0];
    const acc = pendingByFile.get(file) ?? [];
    acc.push(...edits);
    pendingByFile.set(file, acc);
    applied++;
  }

  const changedFiles: string[] = [];
  for (const [file, edits] of pendingByFile) {
    const original = texts.get(file)!;
    writeFileSync(join(contentDir, `${file}.bak`), original, 'utf8'); // backup before write
    writeFileSync(join(contentDir, file), applyEdits(original, edits), 'utf8');
    changedFiles.push(file);
  }

  return { applied, files: changedFiles, skipped };
}
