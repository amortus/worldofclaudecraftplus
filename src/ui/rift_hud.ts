// The on-screen furniture for procedural Rifts: the in-rift floor tracker and
// the overworld portal card.
//
// The thin-consumer half of the split (skills_panel.ts is the template). Every
// decision arrived already made from rift_ui_model.ts and every word from
// rift_ui_labels.ts; this module only builds markup, wires taps and keys, and
// keeps the ARIA contract. It owns no game state.
//
// Both surfaces live here because they share ONE thing that cannot be split
// across files without going out of sync: the right-column anchor stack. They
// are also mutually exclusive in practice (the portal card is overworld
// furniture, the tracker is inside an instance), so they occupy the same slot.
//
// It mints its own elements and stylesheet on first paint rather than reading
// them out of index.html, so composing the feature is a single call from Hud
// and the shared HTML needs no change.
//
// THE TRACKER IS AUTOMATIC. There is no keybind: while a run is active it is
// on screen, because "which floor am I on and how long can my party still
// follow me in" is not something a player should have to go looking for.
//
// THE COUNTDOWN TICKS LOCALLY. It is derived from the run's `entranceClosesAt`
// timestamp against the wall clock on the frame we paint, so it costs no extra
// network traffic. The card's structure is rebuilt only when the run itself
// changes; a plain second passing rewrites one text node.
//
// PHONE LAYOUT (src/ui/CLAUDE.md: verify portrait AND landscape). Desktop puts
// the stack in the right column below the quest tracker. Portrait phones drop
// it further down that column, clear of the scaled minimap, the buff bar and
// the quest tracker above it and of the thumb joysticks below. Landscape phones
// hide the quest tracker entirely and squeeze the right column, so the stack
// moves to the free band across the top centre, between the 0.6-scaled player
// frame on the left and the 0.46-scaled minimap on the right.

import { esc } from './esc';
import { t } from './i18n';
import {
  buildRiftPortalView,
  buildRiftTrackerView,
  type RiftPortalInfo,
  type RiftPortalRow,
  type RiftRunInfo,
  type RiftTrackerView,
} from './rift_ui_model';
import {
  riftCountdownText,
  riftFloorAria,
  riftFloorLine,
  riftMechanicHint,
  riftMechanicName,
  riftRankAria,
  riftRankGlyph,
  riftRankName,
  riftThemeName,
  riftZoneName,
} from './rift_ui_labels';

const STACK_ID = 'rift-hud';
const TRACKER_ID = 'rift-tracker';
const PORTALS_ID = 'rift-portals';
const STYLE_ID = 'rift-hud-style';

/** Hud-supplied glue. Everything is a callback, so this module never learns
 *  which world it is looking at (the `SkillsPanelDeps` shape). */
export interface RiftHudDeps {
  /** The active run, or null when the player is not in a rift. */
  run(): RiftRunInfo | null;
  /** Every portal the client knows about; the panel narrows to `zoneId`. */
  portals(): readonly RiftPortalInfo[];
  /** The zone the player is standing in, or null to show every portal. */
  zoneId(): string | null;
  /** Wall clock, injected so a test can drive the countdown. */
  now?(): number;
  /** The player asked to step through. Hud raises the confirmation. */
  onEnter(portalId: string): void;
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  #${STACK_ID} {
    position: fixed; right: 14px; top: 380px;
    width: 240px; max-width: calc(100% - 24px);
    display: none; flex-direction: column; gap: 8px;
    z-index: 18; font-family: var(--ui-font); pointer-events: none;
  }
  #${STACK_ID}[data-open="1"] { display: flex; }
  #${STACK_ID} .rh-card {
    pointer-events: auto;
    border: 1px solid #3b2e19; border-radius: 6px;
    background: linear-gradient(170deg, #14100acc, #080704dd);
    box-shadow: 0 0 10px #000a; padding: 7px 9px 8px;
  }
  #${STACK_ID} .rh-head {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    border-bottom: 1px solid #ffd10033; padding-bottom: 3px; margin-bottom: 5px;
  }
  #${STACK_ID} .rh-title {
    font-family: var(--title-font); font-size: 13px; color: var(--gold);
    letter-spacing: .5px; text-transform: uppercase;
  }
  /* Rank badge: the glyph is the primary channel, the pip row the second and
     the name the third. Colour is never on its own. */
  #${STACK_ID} .rh-rank { display: inline-flex; align-items: center; gap: 5px; }
  #${STACK_ID} .rh-rank-glyph {
    font-family: var(--title-font); font-size: 15px; font-weight: 700; line-height: 1;
    min-width: 17px; text-align: center; text-shadow: 0 0 6px #000;
  }
  #${STACK_ID} .rh-rank-pips { display: inline-flex; gap: 2px; }
  #${STACK_ID} .rh-pip { width: 4px; height: 10px; border-radius: 1px; opacity: .95; }
  #${STACK_ID} .rh-rank-name { font-size: 11px; color: #d5c19a; }
  #${STACK_ID} .rh-floor {
    font-family: var(--title-font); font-size: 14px; color: #f0e4c4;
    font-variant-numeric: tabular-nums;
  }
  #${STACK_ID} .rh-bar {
    position: relative; height: 6px; margin: 5px 0 5px; border-radius: 3px;
    background: #05050a; border: 1px solid #3b2e19; overflow: hidden;
  }
  #${STACK_ID} .rh-fill { height: 100%; background: linear-gradient(180deg, #d9a441, #8a5f18); }
  #${STACK_ID} .rh-line { font-size: 11px; color: #c6b892; margin-top: 2px; }
  #${STACK_ID} .rh-line b { color: #e7d8b6; font-weight: 500; }
  #${STACK_ID} .rh-time { font-variant-numeric: tabular-nums; color: #e7d8b6; }
  #${STACK_ID} .rh-time.rh-urgent { color: #ff9a5a; }
  #${STACK_ID} .rh-sealed { color: #7fdc4f; }
  #${STACK_ID} .rh-row {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 0; border-top: 1px solid #ffd1001a;
  }
  #${STACK_ID} .rh-row:first-of-type { border-top: 0; }
  #${STACK_ID} .rh-row-main { flex: 1 1 auto; min-width: 0; }
  #${STACK_ID} .rh-zone { font-size: 12px; color: #e7d8b6; }
  #${STACK_ID} .rh-enter {
    flex: 0 0 auto; min-width: 40px; min-height: 40px; padding: 0 10px;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid #6a5220; border-radius: 4px; background: #1b1509;
    color: var(--gold); font-family: var(--title-font); font-size: 12px; cursor: pointer;
  }
  #${STACK_ID} .rh-enter:hover { background: #241c0c; color: #ffe9a0; }
  #${STACK_ID} :focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 2px; }
  /* Portrait phone: stay in the right column, but below the scaled minimap,
     the buff bar and the quest tracker, and above the thumb joysticks. */
  body.mobile-touch #${STACK_ID} {
    right: max(10px, env(safe-area-inset-right));
    top: calc(max(8px, env(safe-area-inset-top)) + 322px);
    width: 190px; font-size: 11px;
  }
  body.mobile-touch #${STACK_ID} .rh-floor { font-size: 13px; }
  body.mobile-touch #${STACK_ID} .rh-title { font-size: 12px; }
  /* Landscape phone: the right column is squeezed and the quest tracker is
     hidden, so take the free band across the top centre instead. */
  @media (orientation: landscape) {
    body.mobile-touch #${STACK_ID} {
      right: auto; left: 50%; transform: translateX(-50%);
      top: max(6px, env(safe-area-inset-top));
      width: min(300px, calc(100vw - 320px)); min-width: 176px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    #${STACK_ID}, #${STACK_ID} * { transition: none !important; animation: none !important; }
  }`;
  document.head.appendChild(style);
}

function ensureStack(): HTMLElement {
  const existing = document.getElementById(STACK_ID);
  if (existing) return existing;
  ensureStyles();
  const el = document.createElement('div');
  el.id = STACK_ID;
  el.innerHTML =
    `<section id="${TRACKER_ID}" class="rh-card" hidden></section>` +
    `<section id="${PORTALS_ID}" class="rh-card" hidden></section>`;
  (document.getElementById('ui') ?? document.body).appendChild(el);
  return el;
}

/** The rank badge: glyph, pip ladder, name. Three independent channels for one
 *  fact, so the rung survives greyscale and colour blindness. */
function rankBadgeHtml(rank: RiftTrackerView['rank'], pips: number, color: string): string {
  const pipHtml = Array.from({ length: 4 }, (_, i) =>
    `<span class="rh-pip" style="background:${esc(i < pips ? color : '#3b2e19')}"></span>`,
  ).join('');
  return (
    `<span class="rh-rank" role="img" aria-label="${esc(riftRankAria(rank))}">` +
    `<span class="rh-rank-glyph" style="color:${esc(color)}" aria-hidden="true">${esc(riftRankGlyph(rank))}</span>` +
    `<span class="rh-rank-pips" aria-hidden="true">${pipHtml}</span>` +
    `<span class="rh-rank-name" aria-hidden="true">${esc(riftRankName(rank))}</span>` +
    `</span>`
  );
}

// ---------------------------------------------------------------------------
// Floor tracker
// ---------------------------------------------------------------------------

/** Everything except the ticking clock. Rebuilding on a change to THIS is what
 *  lets a plain second passing rewrite one text node instead of the card. */
function trackerSignature(view: RiftTrackerView): string {
  return [
    view.rank,
    view.floor.current,
    view.floor.total,
    view.themeId,
    view.mechanicId,
    view.bossFloor ? 1 : 0,
    view.sealed ? 1 : 0,
  ].join('|');
}

function trackerHtml(view: RiftTrackerView): string {
  const floorLine = riftFloorLine(view.floor.current, view.floor.total);
  const aria = riftFloorAria(
    view.floor.current,
    view.floor.total,
    view.themeId,
    view.mechanicId,
    view.bossFloor,
  );
  const finalTag = view.floor.isFinal
    ? ` <span class="rh-rank-name">${esc(t('hudChrome.rift.tracker.finalFloor'))}</span>`
    : '';
  return (
    `<div class="rh-head">` +
    `<span class="rh-title">${esc(t('hudChrome.rift.tracker.title'))}</span>` +
    rankBadgeHtml(view.rank, view.rankPips, view.rankColor) +
    `</div>` +
    `<div class="rh-floor" role="status">${esc(floorLine)}${finalTag}</div>` +
    `<div class="rh-bar" role="progressbar" aria-valuemin="1" aria-valuemax="${view.floor.total}"` +
    ` aria-valuenow="${view.floor.current}" aria-valuetext="${esc(aria)}"` +
    ` aria-label="${esc(t('hudChrome.rift.tracker.progressLabel'))}">` +
    `<div class="rh-fill" style="width:${view.floor.percent}%"></div></div>` +
    `<div class="rh-line"><b>${esc(riftThemeName(view.themeId))}</b></div>` +
    `<div class="rh-line">${esc(
      t('hudChrome.rift.tracker.trial', {
        mechanic: riftMechanicName(view.mechanicId, view.bossFloor),
      }),
    )}</div>` +
    `<div class="rh-line rh-entrance"></div>`
  );
}

/** The entrance line, rewritten every frame the second changes. `role="timer"`
 *  with `aria-live="off"`: a screen reader must not read a ticking clock aloud
 *  once a second, so the words live in the element's own accessible name and
 *  the reader picks them up on demand. */
function entranceHtml(view: RiftTrackerView): string {
  if (view.sealed) {
    return `<span class="rh-sealed">${esc(t('hudChrome.rift.tracker.sealed'))}</span>`;
  }
  if (view.entrance.expired) {
    return `<span class="rh-sealed">${esc(t('hudChrome.rift.tracker.entranceClosed'))}</span>`;
  }
  const time = riftCountdownText(view.entrance);
  const urgent = view.entrance.totalSeconds <= 60 ? ' rh-urgent' : '';
  const label = t('hudChrome.rift.tracker.entranceAria', { time });
  // Split the localized sentence AROUND the digits rather than assuming the
  // clock sits at one end: a locale is free to put the time first.
  const MARK = String.fromCharCode(1);
  const [head, tail = ''] = t('hudChrome.rift.tracker.entranceOpen', { time: MARK }).split(MARK);
  return (
    `<span role="timer" aria-live="off" aria-label="${esc(label)}">` +
    `${esc(head)}<span class="rh-time${urgent}">${esc(time)}</span>${esc(tail)}` +
    `</span>`
  );
}

// ---------------------------------------------------------------------------
// Portal card
// ---------------------------------------------------------------------------

function portalRowHtml(row: RiftPortalRow): string {
  const time = riftCountdownText(row.countdown);
  const status =
    row.phase === 'pending'
      ? t('hudChrome.rift.portal.opensIn', { time })
      : t('hudChrome.rift.portal.collapsesIn', { time });
  const enter = row.enterable
    ? `<button type="button" class="rh-enter" data-portal="${esc(row.portalId)}"` +
      ` aria-label="${esc(t('hudChrome.rift.portal.enterAria', { zone: riftZoneName(row.zoneId), rank: riftRankGlyph(row.rank) }))}">` +
      `${esc(t('hudChrome.rift.portal.enter'))}</button>`
    : '';
  return (
    `<div class="rh-row">` +
    `<span class="rh-row-main">` +
    `<span class="rh-zone">${esc(riftZoneName(row.zoneId))}</span><br>` +
    rankBadgeHtml(row.rank, row.rankPips, row.rankColor) +
    `<div class="rh-line"><span class="rh-time">${esc(status)}</span></div>` +
    `</span>` +
    enter +
    `</div>`
  );
}

function portalsHtml(rows: readonly RiftPortalRow[]): string {
  return (
    `<div class="rh-head">` +
    `<span class="rh-title">${esc(t('hudChrome.rift.portal.title'))}</span>` +
    `</div>` +
    rows.map(portalRowHtml).join('')
  );
}

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

let deps: RiftHudDeps | null = null;
let trackerSig = '';
let entranceSig = '';
let portalSig = '';

function nowMs(): number {
  return deps?.now?.() ?? Date.now();
}

/** Compose the rift furniture into the HUD. One call, then `renderRiftHud()`
 *  every frame; there is no open/close because the surfaces decide for
 *  themselves whether they have anything to say. */
export function mountRiftHud(next: RiftHudDeps): void {
  deps = next;
  ensureStack();
  trackerSig = '';
  entranceSig = '';
  portalSig = '';
}

/** Per-frame repaint. Cheap on an unchanged frame: it compares signatures
 *  before it touches the DOM, so a stationary run costs one string build. */
export function renderRiftHud(): void {
  if (!deps) return;
  const stack = document.getElementById(STACK_ID);
  if (!stack) return;
  const tracker = document.getElementById(TRACKER_ID);
  const portals = document.getElementById(PORTALS_ID);
  if (!tracker || !portals) return;
  const now = nowMs();

  const run = deps.run();
  if (run) {
    const view = buildRiftTrackerView(run, now);
    const sig = trackerSignature(view);
    if (sig !== trackerSig) {
      trackerSig = sig;
      entranceSig = '';
      tracker.innerHTML = trackerHtml(view);
    }
    const entrance = tracker.querySelector('.rh-entrance');
    const eSig = `${view.sealed ? 's' : ''}${view.entrance.totalSeconds}`;
    if (entrance && eSig !== entranceSig) {
      entranceSig = eSig;
      entrance.innerHTML = entranceHtml(view);
    }
    if (tracker.hidden) tracker.hidden = false;
  } else if (!tracker.hidden) {
    tracker.hidden = true;
    tracker.innerHTML = '';
    trackerSig = '';
    entranceSig = '';
  }

  // The portal card is overworld furniture: never draw it over a live run.
  const zoneId = deps.zoneId();
  const rows = run
    ? []
    : buildRiftPortalView(deps.portals(), now, zoneId ? { zoneId } : {}).rows;
  const pSig = rows.map((r) => `${r.portalId}:${r.phase}:${r.countdown.totalSeconds}`).join(',');
  if (pSig !== portalSig) {
    portalSig = pSig;
    if (rows.length === 0) {
      portals.hidden = true;
      portals.innerHTML = '';
    } else {
      portals.innerHTML = portalsHtml(rows);
      portals.hidden = false;
      portals.querySelectorAll<HTMLElement>('[data-portal]').forEach((btn) => {
        btn.addEventListener('click', () => deps?.onEnter(btn.dataset.portal ?? ''));
      });
    }
  }

  const open = !tracker.hidden || !portals.hidden;
  if (open) stack.dataset.open = '1';
  else delete stack.dataset.open;
}

/** Drop every change gate and repaint from scratch. The HUD calls this after a
 *  language switch, where the STATE is unchanged (so the signatures would
 *  suppress the write) but every word in the card is now stale. */
export function refreshRiftHud(): void {
  trackerSig = '';
  entranceSig = '';
  portalSig = '';
  renderRiftHud();
}

/** Tear the furniture down (leaving a world, logging out). */
export function unmountRiftHud(): void {
  document.getElementById(STACK_ID)?.remove();
  deps = null;
  trackerSig = '';
  entranceSig = '';
  portalSig = '';
}
