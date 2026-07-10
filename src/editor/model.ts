// Map-editor data model. Pure: turns the sim's zone content into a flat list of
// editable entities and serializes edits back out. No DOM. The `point` on each entity
// is a LIVE reference into the source object, so dragging mutates the same {x, z} the
// canvas/scene reads, and export reflects the current state. Property edits, clones,
// and deletes mutate the same cloned content the app owns.
//
// This is an authoring aid: it never feeds the running sim. It reads content that is
// the source of truth and emits a patch a human pastes back into the zone files.

import type { CampDef, GroundObjectDef, NpcDef, ZoneDef } from '../sim/types';
import type { ApplyOp, PathVal } from './apply/types';
import type { Vec2 } from './view';

export type EntityKind = 'hub' | 'graveyard' | 'lake' | 'poi' | 'camp' | 'npc' | 'object';

// A single editable field on an entity, rendered as one input in the property panel.
// `set` returns false to reject an invalid value (e.g. a non-number), leaving the
// source untouched so the input can revert.
export interface EditProp {
  key: string;
  label: string;
  type: 'number' | 'text';
  get(): string;
  set(raw: string): boolean;
}

export interface EditorEntity {
  key: string; // stable across a session, even after clones/deletes reorder arrays
  kind: EntityKind;
  label: string;
  zoneId: string | null; // which zone's z-band contains it, for grouping/export
  radius: number; // world-space size for drawing + picking (yards)
  point: Vec2; // LIVE reference: mutate point.x / point.z to move it
  source: object; // the underlying content record (for identity + patch export)
  props: EditProp[]; // editable non-position fields for the property panel
  removable: boolean; // hub/graveyard are singletons per zone: not removable
  clone?: () => void; // append a duplicate to the right array (append-safe)
  remove?: () => void; // remove from its array/map
}

export interface ZoneContent {
  zones: ZoneDef[];
  camps: CampDef[];
  npcs: Record<string, NpcDef>;
  objects: GroundObjectDef[];
  roads?: readonly (readonly Vec2[])[]; // drawn as polylines; not editable
}

const POINT_RADIUS = 2;

// Stable synthetic id per source point object. Keyed by the LIVE point ref (unique
// per marker), so a record keeps its identity when arrays are spliced/appended, while
// a freshly cloned record (new point object) gets a fresh id and reads as "added".
const eids = new WeakMap<object, number>();
let eidSeq = 0;
function eidOf(pointRef: object): number {
  let e = eids.get(pointRef);
  if (e === undefined) {
    e = ++eidSeq;
    eids.set(pointRef, e);
  }
  return e;
}

const numProp = (
  key: string,
  label: string,
  get: () => number,
  set: (v: number) => void,
): EditProp => ({
  key,
  label,
  type: 'number',
  get: () => String(get()),
  set: (raw) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return false;
    set(v);
    return true;
  },
});

const textProp = (
  key: string,
  label: string,
  get: () => string,
  set: (v: string) => void,
): EditProp => ({ key, label, type: 'text', get, set: (raw) => (set(raw), true) });

export function buildEntities(content: ZoneContent): EditorEntity[] {
  const out: EditorEntity[] = [];
  const zoneOf = (p: Vec2) => zoneIdAt(content.zones, p);

  for (const z of content.zones) {
    out.push({
      key: `hub:${eidOf(z.hub)}`,
      kind: 'hub',
      label: `${z.name} hub (${z.hub.name})`,
      zoneId: z.id,
      radius: z.hub.radius,
      point: z.hub,
      source: z.hub,
      props: [
        textProp('name', 'Name', () => z.hub.name, (v) => (z.hub.name = v)),
        numProp('radius', 'Radius', () => z.hub.radius, (v) => (z.hub.radius = v)),
      ],
      removable: false,
    });
    out.push({
      key: `graveyard:${eidOf(z.graveyard)}`,
      kind: 'graveyard',
      label: `${z.name} graveyard`,
      zoneId: z.id,
      radius: POINT_RADIUS,
      point: z.graveyard,
      source: z.graveyard,
      props: [],
      removable: false,
    });
    z.lakes.forEach((lake, i) => {
      out.push({
        key: `lake:${eidOf(lake)}`,
        kind: 'lake',
        label: `${z.name} lake ${i + 1}`,
        zoneId: z.id,
        radius: lake.radius,
        point: lake,
        source: lake,
        props: [numProp('radius', 'Radius', () => lake.radius, (v) => (lake.radius = v))],
        removable: true,
        clone: () => z.lakes.push({ ...lake, x: lake.x + 8, z: lake.z + 8 }),
        remove: () => spliceRef(z.lakes, lake),
      });
    });
    z.pois.forEach((poi) => {
      out.push({
        key: `poi:${eidOf(poi)}`,
        kind: 'poi',
        label: poi.label,
        zoneId: z.id,
        radius: POINT_RADIUS,
        point: poi,
        source: poi,
        props: [textProp('label', 'Label', () => poi.label, (v) => (poi.label = v))],
        removable: true,
        clone: () => z.pois.push({ ...poi, x: poi.x + 8, z: poi.z + 8 }),
        remove: () => spliceRef(z.pois, poi),
      });
    });
  }

  content.camps.forEach((camp) => {
    out.push({
      key: `camp:${eidOf(camp.center)}`,
      kind: 'camp',
      label: `${camp.mobId} x${camp.count}`,
      zoneId: zoneOf(camp.center),
      radius: Math.max(POINT_RADIUS, camp.radius),
      point: camp.center,
      source: camp,
      props: [
        textProp('mobId', 'Mob id', () => camp.mobId, (v) => (camp.mobId = v)),
        numProp('count', 'Count', () => camp.count, (v) => (camp.count = Math.max(1, Math.round(v)))),
        numProp('radius', 'Radius', () => camp.radius, (v) => (camp.radius = v)),
      ],
      removable: true,
      // Appended to the tail so it never shifts the world-gen rng draw order of the
      // existing camps (see the CAMPS ordering note in src/sim/data.ts).
      clone: () =>
        content.camps.push({ ...camp, center: { x: camp.center.x + 8, z: camp.center.z + 8 } }),
      remove: () => spliceRef(content.camps, camp),
    });
  });

  for (const [id, npc] of Object.entries(content.npcs)) {
    if (npc.dynamic) continue; // not surface-placed; nothing to position on the map
    out.push({
      key: `npc:${eidOf(npc.pos)}`,
      kind: 'npc',
      label: npc.name,
      zoneId: zoneOf(npc.pos),
      radius: POINT_RADIUS,
      point: npc.pos,
      source: npc,
      props: [
        textProp('name', 'Name', () => npc.name, (v) => (npc.name = v)),
        textProp('title', 'Title', () => npc.title, (v) => (npc.title = v)),
        numProp('facing', 'Facing (rad)', () => npc.facing, (v) => (npc.facing = v)),
      ],
      removable: true,
      clone: () => {
        const nid = uniqueNpcId(content.npcs, id);
        content.npcs[nid] = { ...structuredClone(npc), id: nid, pos: { x: npc.pos.x + 8, z: npc.pos.z + 8 } };
      },
      remove: () => {
        delete content.npcs[id];
      },
    });
  }

  content.objects.forEach((obj) => {
    obj.positions.forEach((pos) => {
      out.push({
        key: `object:${eidOf(pos)}`,
        kind: 'object',
        label: obj.name,
        zoneId: zoneOf(pos),
        radius: POINT_RADIUS,
        point: pos,
        source: pos,
        props: [textProp('name', 'Object name', () => obj.name, (v) => (obj.name = v))],
        removable: true,
        clone: () => obj.positions.push({ x: pos.x + 8, z: pos.z + 8 }),
        remove: () => {
          spliceRef(obj.positions, pos);
          if (obj.positions.length === 0) spliceRef(content.objects, obj);
        },
      });
    });
  });

  return out;
}

function spliceRef<T>(arr: T[], item: T): void {
  const i = arr.indexOf(item);
  if (i >= 0) arr.splice(i, 1);
}

function uniqueNpcId(npcs: Record<string, NpcDef>, base: string): string {
  let n = 2;
  let id = `${base}_copy`;
  while (npcs[id]) id = `${base}_copy${n++}`;
  return id;
}

// The zone whose [zMin, zMax] band contains the point, or null. Zones partition the
// world by z; this is only for grouping handles, never for sim logic.
export function zoneIdAt(zones: readonly ZoneDef[], p: Vec2): string | null {
  for (const z of zones) {
    if (p.z >= z.zMin && p.z <= z.zMax) return z.id;
  }
  return null;
}

// ---- Position-only diff (kept for the existing tests + a quick "moved" summary) ----

export function snapshot(entities: readonly EditorEntity[]): Map<string, Vec2> {
  const m = new Map<string, Vec2>();
  for (const e of entities) m.set(e.key, { x: e.point.x, z: e.point.z });
  return m;
}

export interface MovedEntity {
  key: string;
  kind: EntityKind;
  label: string;
  zoneId: string | null;
  from: Vec2;
  to: Vec2;
}

export function diffMoved(
  entities: readonly EditorEntity[],
  base: Map<string, Vec2>,
  precision = 2,
): MovedEntity[] {
  const moved: MovedEntity[] = [];
  for (const e of entities) {
    const was = base.get(e.key);
    if (!was) continue;
    const to = { x: round(e.point.x, precision), z: round(e.point.z, precision) };
    const from = { x: round(was.x, precision), z: round(was.z, precision) };
    if (to.x !== from.x || to.z !== from.z) {
      moved.push({ key: e.key, kind: e.kind, label: e.label, zoneId: e.zoneId, from, to });
    }
  }
  return moved;
}

export function formatPatch(moved: readonly MovedEntity[]): string {
  if (moved.length === 0) return 'No changes.';
  const byZone = new Map<string, MovedEntity[]>();
  for (const m of moved) {
    const z = m.zoneId ?? '(unzoned)';
    (byZone.get(z) ?? byZone.set(z, []).get(z)!).push(m);
  }
  const lines: string[] = [`${moved.length} marker(s) moved:`, ''];
  for (const [zone, items] of byZone) {
    lines.push(`# ${zone}`);
    for (const m of items) {
      lines.push(`  ${m.kind}: ${m.label}: (${m.from.x}, ${m.from.z}) to (${m.to.x}, ${m.to.z})`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---- Full structured patch: moves + field edits + clones + deletes ----------------

// A per-entity snapshot taken at load, so the patch can detect position moves, field
// edits, and (by set membership) additions and deletions.
export interface BaseRec {
  key: string;
  kind: EntityKind;
  label: string;
  zoneId: string | null;
  x: number;
  z: number;
  fields: Record<string, string>;
}

export function snapshotFull(entities: readonly EditorEntity[]): Map<string, BaseRec> {
  const m = new Map<string, BaseRec>();
  for (const e of entities) {
    const fields: Record<string, string> = {};
    for (const p of e.props) fields[p.key] = p.get();
    m.set(e.key, { key: e.key, kind: e.kind, label: e.label, zoneId: e.zoneId, x: e.point.x, z: e.point.z, fields });
  }
  return m;
}

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface EntityChange {
  key: string;
  kind: EntityKind;
  label: string;
  zoneId: string | null;
  status: 'moved' | 'edited' | 'added' | 'deleted';
  from?: Vec2;
  to?: Vec2;
  fields?: FieldChange[];
  record?: object; // the source record, for added entities (paste-ready)
}

export interface Patch {
  changes: EntityChange[];
  warnings: string[];
}

export function buildPatch(
  entities: readonly EditorEntity[],
  base: Map<string, BaseRec>,
  precision = 2,
): Patch {
  const changes: EntityChange[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const e of entities) {
    seen.add(e.key);
    const was = base.get(e.key);
    if (!was) {
      changes.push({ key: e.key, kind: e.kind, label: e.label, zoneId: e.zoneId, status: 'added', record: e.source });
      continue;
    }
    const to = { x: round(e.point.x, precision), z: round(e.point.z, precision) };
    const from = { x: round(was.x, precision), z: round(was.z, precision) };
    const moved = to.x !== from.x || to.z !== from.z;
    const fields: FieldChange[] = [];
    for (const p of e.props) {
      const now = p.get();
      const before = was.fields[p.key];
      if (before !== undefined && before !== now) fields.push({ field: p.key, from: before, to: now });
    }
    if (moved && fields.length) {
      changes.push({ key: e.key, kind: e.kind, label: e.label, zoneId: e.zoneId, status: 'edited', from, to, fields });
    } else if (moved) {
      changes.push({ key: e.key, kind: e.kind, label: e.label, zoneId: e.zoneId, status: 'moved', from, to });
    } else if (fields.length) {
      changes.push({ key: e.key, kind: e.kind, label: e.label, zoneId: e.zoneId, status: 'edited', fields });
    }
  }

  for (const [key, was] of base) {
    if (!seen.has(key)) {
      changes.push({ key, kind: was.kind, label: was.label, zoneId: was.zoneId, status: 'deleted' });
    }
  }

  // Determinism guard: deleting a camp from the middle of CAMPS shifts every later
  // camp's world-gen rng draw, changing the whole world. Adds are appended (safe).
  if (changes.some((c) => c.status === 'deleted' && c.kind === 'camp')) {
    warnings.push(
      'A camp was deleted. CAMPS array order feeds world-gen rng, so removing a camp shifts every later camp. Prefer emptying its count or moving it off-map over deleting, unless you accept a reseed.',
    );
  }
  return { changes, warnings };
}

export function renderPatch(patch: Patch): string {
  const { changes, warnings } = patch;
  if (changes.length === 0) return 'No changes.';
  const byZone = new Map<string, EntityChange[]>();
  for (const c of changes) {
    const z = c.zoneId ?? '(unzoned)';
    (byZone.get(z) ?? byZone.set(z, []).get(z)!).push(c);
  }
  const lines: string[] = [`${changes.length} change(s):`, ''];
  for (const w of warnings) lines.push(`! ${w}`, '');
  for (const [zone, items] of byZone) {
    lines.push(`# ${zone}`);
    for (const c of items) {
      if (c.status === 'moved') {
        lines.push(`  MOVE ${c.kind} ${c.label}: (${c.from!.x}, ${c.from!.z}) to (${c.to!.x}, ${c.to!.z})`);
      } else if (c.status === 'edited') {
        const pos = c.to ? ` @ (${c.to.x}, ${c.to.z})` : '';
        const fs = (c.fields ?? []).map((f) => `${f.field}: ${f.from} to ${f.to}`).join(', ');
        lines.push(`  EDIT ${c.kind} ${c.label}${pos}: ${fs}`);
      } else if (c.status === 'added') {
        lines.push(`  ADD  ${c.kind} ${c.label}: ${JSON.stringify(c.record)}`);
      } else {
        lines.push(`  DEL  ${c.kind} ${c.label}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function round(v: number, precision: number): number {
  const f = 10 ** precision;
  return Math.round(v * f) / f;
}

// ---- Apply ops for the dev-only write-back -----------------------------------------

// The position property path per kind (the x/z live under this, [] = top-level x/z).
const POS_PATH: Record<EntityKind, string[]> = {
  camp: ['center'],
  npc: ['pos'],
  hub: [],
  graveyard: [],
  lake: [],
  poi: [],
  object: [],
};

// The original-value match that locates a record's source literal. Uses base (the
// load-time values, i.e. what is still in the file) plus stable ids, never the edited
// current values, so a record is found even after its fields were changed.
function matchFor(kind: EntityKind, source: object, was: BaseRec): PathVal[] {
  switch (kind) {
    case 'npc':
      return [{ path: ['id'], value: (source as NpcDef).id }];
    case 'camp':
      return [
        { path: ['mobId'], value: was.fields.mobId },
        { path: ['center', 'x'], value: was.x },
        { path: ['center', 'z'], value: was.z },
      ];
    case 'poi':
      return [{ path: ['label'], value: was.fields.label }, { path: ['x'], value: was.x }, { path: ['z'], value: was.z }];
    case 'hub':
      return [{ path: ['name'], value: was.fields.name }, { path: ['x'], value: was.x }, { path: ['z'], value: was.z }];
    case 'lake':
      return [{ path: ['x'], value: was.x }, { path: ['z'], value: was.z }, { path: ['radius'], value: Number(was.fields.radius) }];
    default: // graveyard, object: located by their (unique-enough) coordinates
      return [{ path: ['x'], value: was.x }, { path: ['z'], value: was.z }];
  }
}

// Build the auto-appliable ops (position moves + scalar field edits) plus a list of
// changes that must stay manual (adds/deletes, and the object name which lives on the
// parent record, not the position literal). Pure: does no I/O.
export function buildApplyOps(
  entities: readonly EditorEntity[],
  base: Map<string, BaseRec>,
  precision = 2,
): { ops: ApplyOp[]; skipped: { label: string; reason: string }[] } {
  const ops: ApplyOp[] = [];
  const skipped: { label: string; reason: string }[] = [];
  const present = new Set<string>();

  for (const e of entities) {
    present.add(e.key);
    const was = base.get(e.key);
    if (!was) {
      skipped.push({ label: e.label, reason: 'new record: append it manually from the patch text' });
      continue;
    }
    const moved = round(e.point.x, precision) !== round(was.x, precision) || round(e.point.z, precision) !== round(was.z, precision);
    const updates: PathVal[] = [];
    if (moved) {
      const p = POS_PATH[e.kind];
      updates.push({ path: [...p, 'x'], value: round(e.point.x, precision) });
      updates.push({ path: [...p, 'z'], value: round(e.point.z, precision) });
    }
    for (const prop of e.props) {
      const now = prop.get();
      if (was.fields[prop.key] === now) continue;
      if (e.kind === 'object' && prop.key === 'name') {
        skipped.push({ label: e.label, reason: 'object name lives on the parent record; apply it manually' });
        continue;
      }
      updates.push({ path: [prop.key], value: prop.type === 'number' ? Number(now) : now });
    }
    if (updates.length) {
      ops.push({ key: e.key, kind: e.kind, label: e.label, match: matchFor(e.kind, e.source, was), updates });
    }
  }

  // Deletions (in base but no longer present) are never auto-removed: splicing a camp
  // shifts the world-gen rng draw order (src/sim/data.ts). Report them as manual.
  for (const [key, was] of base) {
    if (!present.has(key)) {
      skipped.push({ label: was.label, reason: 'deleted record: remove it manually (camp order feeds world-gen rng)' });
    }
  }

  return { ops, skipped };
}
