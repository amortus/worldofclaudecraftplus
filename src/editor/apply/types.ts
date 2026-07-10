// Shared shapes for the dev-only write-back, kept dependency-free so the pure model
// (src/editor/model.ts) can build apply ops without importing edit_source.ts (which
// pulls in the TypeScript compiler and must never reach the client bundle).

// A property path into a data-as-code object literal and a primitive value: for a
// match it is the value the literal must currently hold; for an update it is the new
// value to write.
export interface PathVal {
  path: string[];
  value: string | number;
}

// One record edit the dev server applies: locate the unique literal matching `match`
// (original values) and set `updates` (new values). `posPath` is only informational.
export interface ApplyOp {
  key: string;
  kind: string;
  label: string;
  match: PathVal[];
  updates: PathVal[];
}

export interface ApplyReport {
  applied: number;
  files: string[];
  skipped: { label: string; reason: string }[];
}
