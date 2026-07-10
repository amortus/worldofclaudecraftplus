// The dev-only write-back's AST locator: it must find exactly one literal, preserve
// surrounding formatting, refuse ambiguity, and handle negatives + string quoting.

import { describe, expect, it } from 'vitest';
import { applyEdits, locateObjectEdit, type PathVal } from '../src/editor/apply/edit_source';

const SRC = `export const ZONE1_CAMPS = [
  // the wolf pack north of town
  { mobId: 'forest_wolf', center: { x: -7, z: 63 }, radius: 22, count: 7 },
  { mobId: 'brown_bear', center: { x: 40, z: 40 }, radius: 5, count: 2 },
];
`;

const ok = (r: ReturnType<typeof locateObjectEdit>) => {
  if ('error' in r) throw new Error(r.error);
  return r.edits;
};

describe('locateObjectEdit', () => {
  it('moves a camp by matching mobId + original center, preserving formatting/comments', () => {
    const match: PathVal[] = [
      { path: ['mobId'], value: 'forest_wolf' },
      { path: ['center', 'x'], value: -7 },
      { path: ['center', 'z'], value: 63 },
    ];
    const updates: PathVal[] = [
      { path: ['center', 'x'], value: 12 },
      { path: ['center', 'z'], value: 20 },
    ];
    const out = applyEdits(SRC, ok(locateObjectEdit(SRC, match, updates)));
    expect(out).toContain("{ mobId: 'forest_wolf', center: { x: 12, z: 20 }, radius: 22, count: 7 }");
    expect(out).toContain('// the wolf pack north of town'); // comment untouched
    expect(out).toContain("center: { x: 40, z: 40 }"); // other camp untouched
  });

  it('edits a scalar field (count) in place', () => {
    const out = applyEdits(
      SRC,
      ok(locateObjectEdit(SRC, [{ path: ['mobId'], value: 'brown_bear' }], [{ path: ['count'], value: 9 }])),
    );
    expect(out).toContain("{ mobId: 'brown_bear', center: { x: 40, z: 40 }, radius: 5, count: 9 }");
  });

  it('edits a string field with single-quoted output', () => {
    const out = applyEdits(
      SRC,
      ok(locateObjectEdit(SRC, [{ path: ['mobId'], value: 'brown_bear' }], [{ path: ['mobId'], value: 'grizzly' }])),
    );
    expect(out).toContain("mobId: 'grizzly'");
  });

  it('refuses an ambiguous match (returns error, no edit)', () => {
    const dup = `const A = [
      { kind: 'tree', x: 1, z: 1 },
      { kind: 'tree', x: 2, z: 2 },
    ];`;
    const r = locateObjectEdit(dup, [{ path: ['kind'], value: 'tree' }], [{ path: ['x'], value: 9 }]);
    expect('error' in r && r.error).toMatch(/ambiguous/);
  });

  it('reports no match', () => {
    const r = locateObjectEdit(SRC, [{ path: ['mobId'], value: 'dragon' }], [{ path: ['count'], value: 1 }]);
    expect('error' in r && r.error).toMatch(/no source literal/);
  });

  it('reports a missing update path rather than corrupting the file', () => {
    const r = locateObjectEdit(SRC, [{ path: ['mobId'], value: 'forest_wolf' }], [{ path: ['elite'], value: 1 }]);
    expect('error' in r && r.error).toMatch(/not found/);
  });
});
