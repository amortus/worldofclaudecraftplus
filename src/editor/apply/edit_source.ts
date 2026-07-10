// The technical core of the dev-only write-back: locate one object literal in a
// data-as-code source file by a set of original property values, and produce the exact
// text edits that set some of its properties to new values. It works on the TypeScript
// AST for robust location but returns byte-span text replacements, so surrounding
// formatting/comments are preserved untouched. It is deliberately strict: if the match
// is not UNIQUE (0 or >1 candidates), it refuses and reports, never guessing.
//
// Pure and host-agnostic (takes/returns strings), so it is unit-tested directly. The
// vite dev plugin is the only caller; nothing here touches the filesystem.

import ts from 'typescript';
import type { PathVal } from './types';

// Re-exported for callers/tests; the type lives in the dependency-free ./types so the
// pure model can share it without importing the TypeScript compiler.
export type { PathVal } from './types';

export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

export type LocateResult = { edits: TextEdit[] } | { error: string };

const EPS = 1e-6;

export function locateObjectEdit(
  source: string,
  match: PathVal[],
  updates: PathVal[],
  fileName = 'content.ts',
): LocateResult {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true);
  const candidates: ts.ObjectLiteralExpression[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node) && objectMatches(node, match)) {
      candidates.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (candidates.length === 0) return { error: 'no source literal matched' };
  if (candidates.length > 1) return { error: `ambiguous: ${candidates.length} literals matched` };

  const obj = candidates[0];
  const edits: TextEdit[] = [];
  for (const u of updates) {
    const valueNode = resolveValueNode(obj, u.path);
    if (!valueNode) return { error: `path ${u.path.join('.')} not found in matched literal` };
    edits.push({ start: valueNode.getStart(sf), end: valueNode.getEnd(), text: emit(u.value) });
  }
  return { edits };
}

// Apply pre-located edits to the source (right-to-left so earlier spans stay valid).
export function applyEdits(source: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = source;
  for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

function objectMatches(obj: ts.ObjectLiteralExpression, match: readonly PathVal[]): boolean {
  for (const m of match) {
    const node = resolveValueNode(obj, m.path);
    if (!node || !literalEquals(node, m.value)) return false;
  }
  return true;
}

// Walk a property path from an object literal down to the value node it addresses.
function resolveValueNode(obj: ts.ObjectLiteralExpression, path: readonly string[]): ts.Expression | null {
  let current: ts.ObjectLiteralExpression | null = obj;
  for (let i = 0; i < path.length; i++) {
    if (!current) return null;
    let value: ts.Expression | null = null;
    for (const p of current.properties) {
      if (ts.isPropertyAssignment(p) && propName(p.name) === path[i]) {
        value = p.initializer;
        break;
      }
    }
    if (value === null) return null;
    if (i === path.length - 1) return value;
    current = ts.isObjectLiteralExpression(value) ? value : null;
  }
  return null;
}

function propName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

// Compare an AST value node to an expected primitive. Handles negative numbers (a
// PrefixUnaryExpression) and both quote styles for strings.
function literalEquals(node: ts.Expression, value: string | number): boolean {
  if (typeof value === 'number') {
    const n = numericValue(node);
    return n !== null && Math.abs(n - value) < EPS;
  }
  return ts.isStringLiteral(node) && node.text === value;
}

function numericValue(node: ts.Expression): number | null {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    if (node.operator === ts.SyntaxKind.MinusToken) return -Number(node.operand.text);
    if (node.operator === ts.SyntaxKind.PlusToken) return Number(node.operand.text);
  }
  return null;
}

// Render a value back to source text. Numbers verbatim; strings single-quoted to match
// the repo style, with single quotes and backslashes escaped.
function emit(value: string | number): string {
  if (typeof value === 'number') return String(value);
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
