// Thin DOM consumer for the Dungeon Finder: the queue window and the ready-check
// dialog.
//
// The consumer half of the pure-core + thin-consumer split (skills_panel.ts and
// rift_hud.ts are the templates). Every decision arrived already made from
// lfg_ui_model.ts and every word from lfg_ui_labels.ts; this module only builds
// markup, wires taps and keys, and keeps the ARIA contract. It owns no game
// state at all: the only things it remembers are the player's current SELECTION
// (which dungeon row, which roles) and the open proposal, both of which are
// pure UI state with no authority behind them.
//
// It mints its own elements and stylesheet on first paint rather than reading
// them out of index.html, so composing the feature is a single call from Hud and
// the shared HTML needs no change.
//
// NEVER `lfg` IN AN ID, KEY OR LABEL. `lfg` is already a joinable chat channel
// (`/join lfg`, the channel tab bar, every persisted channel set), so the queue
// answers to `dungeonFinder` everywhere a string is user-visible or addressable:
// `#dungeon-finder-window`, `hudChrome.dungeonFinder.*`, "Dungeon Finder". Only
// the four SimEvent names keep the historical spelling, and they live entirely
// inside lfg_ui_model.ts.
//
// THE READY CHECK IS ITS OWN MODAL, NOT A `confirmDialog`. Hud's confirmDialog is
// a static two-button modal; a ready check needs a live countdown, a progress
// bar that drains, and to dismiss ITSELF when the window shuts. What DOES go
// through confirmDialog is the destructive press next door: leaving the queue
// while a ready check is open is a decline and costs the same 120 s, so it asks
// first (see `requestLeave`). The ready check itself deliberately never asks:
// it has a 40 s window, and a second modal between the player and Accept is how
// a group times out.
//
// PHONE LAYOUT (src/ui/CLAUDE.md: verify portrait AND landscape). The window is
// a managed `.window.panel` centred on first open exactly as the Skills panel
// is, so it inherits Hud's drag layer and the same 84vh / 94vh short-viewport
// rule. The ready-check modal is centred on the viewport in both orientations
// and its two buttons are a full-width row on a narrow screen, so neither ever
// lands under a thumb joystick.

import { esc } from './esc';
import { t } from './i18n';
import {
  type LfgListingLike,
  type LfgListingRow,
  type LfgQueueView,
  type LfgProposalInfo,
  type LfgReadyCheckView,
  type LfgRoleId,
  type LfgStatusInfo,
  DUNGEON_FINDER_DECLINE_PENALTY_SEC,
  LFG_ROLE_IDS,
  buildLfgListingsView,
  buildLfgQueueView,
  buildReadyCheckView,
  reconcileReadyCheck,
  resolveRequestedRoles,
} from './lfg_ui_model';
import {
  lfgAbandonConfirmText,
  lfgCooldownText,
  lfgDungeonName,
  lfgGroupSizeText,
  lfgJoinAria,
  lfgLevelBandText,
  lfgLevelsToGoText,
  lfgLockedRowAria,
  lfgAssignedRoleText,
  lfgQueuedForText,
  lfgQueuedPlayersText,
  lfgReadyCheckText,
  lfgReadyTallyText,
  lfgRelaxText,
  lfgRequiresLevelText,
  lfgRoleCountAria,
  lfgRoleCountText,
  lfgRoleEnoughText,
  lfgRoleName,
  lfgRoleShortText,
  lfgRoleToggleAria,
  lfgStateText,
  lfgTierName,
  lfgTimeText,
  lfgWaitAria,
  lfgWaitText,
} from './lfg_ui_labels';
import { svgIcon } from './ui_icons';

const PANEL_ID = 'dungeon-finder-window';
const READY_ID = 'dungeon-finder-ready';
const STYLE_ID = 'dungeon-finder-style';

/** The proposal slice this module reads. Structural, so `IWorld`'s own
 *  `LfgProposalInfo` satisfies it without this module importing the seam. */
export interface LfgProposalLike {
  proposalId: string;
  dungeonId: string;
  expiresAt: number;
  role?: string;
  size?: number;
  acceptedCount?: number;
  responded?: boolean;
}

/**
 * Hud-supplied glue. Everything is a callback so this module never learns which
 * world it is looking at (the `SkillsPanelDeps` / `RiftHudDeps` shape).
 */
export interface DungeonFinderDeps {
  /** What the queue offers, from `IWorld.dungeonFinderOffers()`. */
  listings(): readonly LfgListingLike[];
  /** The live status for the local player, or null before the first readout. */
  status(): LfgStatusInfo | null;
  /**
   * The live ready check, from `IWorld.dungeonFinderProposal`.
   *
   * The `lfgProposal` EVENT is what raises the dialog (it is instant and it is
   * the pinned contract), but the world's own copy is what keeps it honest: a
   * client that reconnects mid-check, or one that missed the event, still gets
   * the dialog, and a proposal that vanished server-side takes the dialog with
   * it instead of leaving a dead countdown on screen.
   */
  proposal(): LfgProposalLike | null;
  playerLevel(): number;
  /** The roles this player's CLASS can fill. An empty list still leaves them
   *  queueable as damage; `resolveRequestedRoles` enforces that. */
  eligibleRoles(): readonly string[];
  /** Wall clock, injected so a test can drive the countdown. */
  now?(): number;
  onJoin(dungeonId: string, roles: readonly string[]): void;
  onLeave(): void;
  onRespond(proposalId: string, accept: boolean): void;
  /** Hud's own `confirmDialog`, for the one destructive press that can afford to
   *  wait for an answer. */
  confirm(options: {
    title: string;
    body: string;
    okText: string;
    cancelText: string;
    onOk(): void;
  }): void;
  /** Called when the window closes, so Hud can drop its own open flag. */
  onClose?(): void;
}

let deps: DungeonFinderDeps | null = null;
let opener: HTMLElement | null = null;

// UI-only selection state. Deliberately NOT derived from the world: a player
// browsing rows while queued for something else must not have the list yanked
// out from under them by a status tick.
let selectedDungeonId: string | null = null;
let selectedRoles: Set<LfgRoleId> | null = null;

// The open ready check, stamped with the moment the client first saw it (the
// event carries only a deadline, and the drain bar needs a span).
let proposal: LfgProposalInfo | null = null;
// The proposal this client has already answered, so a second press is a no-op
// even before the world's own copy catches up.
let answeredProposalId: string | null = null;
// The proposal whose window ran out. Never raised again, so a world copy that
// lags the deadline by a few frames cannot loop the dialog open.
let expiredProposalId: string | null = null;
// When the world last CONFIRMED the open proposal, so the close-side grace runs
// from a real confirmation rather than from the moment the event arrived.
let proposalConfirmedAt: number | null = null;
// What had focus before the ready check took it, so answering gives it back.
let readyOpener: HTMLElement | null = null;

/** How long the dialog survives after the world STOPS reporting a proposal it
 *  had been confirming. Online, a snapshot can lag an event, and a ready check
 *  that blinks out is worse than one that lingers two seconds. */
const PROPOSAL_RECONCILE_GRACE_MS = 2000;
/** Body class that lifts Hud's `#confirm-dialog` above our modal scrim while a
 *  ready check owns the screen. Without it the abandon confirmation renders
 *  UNDER the scrim while focus silently moves to its OK button, which is a
 *  120 second penalty one blind Enter away. */
const READY_BODY_CLASS = 'df-ready-open';

// Change gates, so an unchanged frame costs one string build and no DOM write.
let listSig = '';
let statusSig = '';
let waitSig = '';
let readySig = '';
let readyTimeSig = '';

function nowMs(): number {
  return deps?.now?.() ?? Date.now();
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // width:100% + max-width (never a viewport unit): it keeps a 12px gutter on a
  // 360px portrait phone instead of butting against both screen edges, and the
  // body scrolls rather than the page.
  style.textContent = `
  #${PANEL_ID} {
    /* No transform centring: Hud's managed-window layer positions every
       .window.panel by writing style.left/top in pixels, and a translate would
       double-offset the panel the moment a player drags it. */
    position: fixed; left: 0; top: 0;
    width: calc(100% - 24px); max-width: 420px; max-height: 84vh;
    padding: 10px 12px 12px; display: none; flex-direction: column;
    z-index: 45; font-family: var(--ui-font);
  }
  #${PANEL_ID}[data-open="1"] { display: flex; }
  #${PANEL_ID} .df-body { overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; }
  #${PANEL_ID} .df-intro { color: #998d6a; font-size: 12px; margin: 0 0 8px; }
  #${PANEL_ID} .df-card {
    border: 1px solid #3b2e19; border-radius: 6px; background: #0e0c08cc;
    padding: 8px 9px; margin-bottom: 8px;
  }
  #${PANEL_ID} .df-heading {
    font-family: var(--title-font); color: var(--gold); font-size: 13px;
    letter-spacing: .5px; text-transform: uppercase; margin: 0 0 6px;
  }
  #${PANEL_ID} .df-state { color: #e7d8b6; font-size: 13px; }
  #${PANEL_ID} .df-line { color: #c6b892; font-size: 12px; margin-top: 3px; }
  #${PANEL_ID} .df-time { color: #e7d8b6; font-variant-numeric: tabular-nums; }
  #${PANEL_ID} .df-roles-count { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; list-style: none; }
  #${PANEL_ID} .df-count {
    min-width: 40px; min-height: 40px; padding: 4px 8px; border-radius: 4px; flex: 1 1 auto;
    border: 1px solid #3b2e19; background: #12100b; font-size: 12px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-variant-numeric: tabular-nums;
  }
  /* The "enough / not enough" state is spelled out in the accessible name and
     carried by the mark below the number, never by colour alone. */
  #${PANEL_ID} .df-count-mark { font-size: 11px; margin-top: 2px; color: #998d6a; }
  #${PANEL_ID} .df-count.df-ok { border-color: #4c6b32; }
  #${PANEL_ID} .df-count.df-ok .df-count-mark { color: #7fdc4f; }
  #${PANEL_ID} .df-list { display: flex; flex-direction: column; gap: 6px; }
  #${PANEL_ID} .df-row {
    display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
    min-height: 40px; padding: 6px 8px; border-radius: 4px;
    border: 1px solid #3b2e19; background: #12100b; color: #e7d8b6;
    font-family: var(--ui-font); font-size: 13px; cursor: pointer;
  }
  #${PANEL_ID} .df-row[aria-checked="true"] { border-color: var(--gold); background: #1b1509; }
  #${PANEL_ID} .df-row[aria-disabled="true"] { opacity: .6; cursor: default; }
  #${PANEL_ID} .df-row-main { flex: 1 1 auto; min-width: 0; }
  #${PANEL_ID} .df-row-name { color: #f0e4c4; }
  #${PANEL_ID} .df-row-meta { display: block; color: #998d6a; font-size: 12px; }
  #${PANEL_ID} .df-row-mark {
    flex: 0 0 auto; font-size: 11px; color: #ffb066; text-align: right; max-width: 40%;
  }
  #${PANEL_ID} .df-role-toggles { display: flex; flex-wrap: wrap; gap: 6px; }
  #${PANEL_ID} .df-role {
    min-width: 40px; min-height: 40px; flex: 1 1 auto; padding: 4px 8px; border-radius: 4px;
    border: 1px solid #3b2e19; background: #12100b; color: #d5c19a;
    font-family: var(--ui-font); font-size: 13px; cursor: pointer;
  }
  #${PANEL_ID} .df-role[aria-pressed="true"] { border-color: var(--gold); background: #1b1509; color: #ffe9a0; }
  /* aria-disabled, never the disabled attribute: a disabled button leaves the
     tab order, which would make "not available to your class" unannounceable. */
  #${PANEL_ID} .df-role[aria-disabled="true"] { opacity: .5; cursor: default; }
  #${PANEL_ID} .df-actions { display: flex; gap: 8px; margin-top: 8px; }
  #${PANEL_ID} .df-actions .btn { flex: 1 1 auto; min-height: 40px; }
  #${PANEL_ID} .df-empty { color: #998d6a; font-size: 13px; padding: 10px 2px; }
  #${PANEL_ID} .x-btn { min-width: 40px; min-height: 40px; display: inline-flex; align-items: center; justify-content: center; }
  #${PANEL_ID} :focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 2px; }

  /* --- the ready check ---------------------------------------------------- */
  #${READY_ID} {
    position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: calc(100% - 24px); max-width: 380px;
    padding: 12px 14px 14px; display: none; flex-direction: column;
    /* Above every managed window and above confirm-dialog: nothing may cover a
       40 second decision. */
    z-index: 220; font-family: var(--ui-font);
  }
  #${READY_ID}[data-open="1"] { display: flex; }
  #${READY_ID} .df-ready-title {
    font-family: var(--title-font); color: var(--gold); font-size: 16px; margin: 0 0 6px;
  }
  #${READY_ID} .df-ready-body { color: #e7d8b6; font-size: 14px; margin: 0 0 8px; }
  #${READY_ID} .df-ready-clock {
    font-family: var(--title-font); font-size: 30px; line-height: 1.1; text-align: center;
    color: #f0e4c4; font-variant-numeric: tabular-nums; margin: 2px 0 6px;
  }
  #${READY_ID} .df-ready-clock.df-urgent { color: #ff9a5a; }
  #${READY_ID} .df-ready-bar {
    position: relative; height: 10px; border-radius: 3px; margin-bottom: 10px;
    background: #05050a; border: 1px solid #3b2e19; overflow: hidden;
  }
  #${READY_ID} .df-ready-fill { height: 100%; background: linear-gradient(180deg, #d9a441, #8a5f18); }
  #${READY_ID} .df-ready-bar.df-urgent .df-ready-fill { background: linear-gradient(180deg, #ff9a5a, #9a4a12); }
  /* Both consequences, always visible, always ABOVE the buttons: the player has
     to be able to read what each answer costs before reaching for one. */
  #${READY_ID} .df-cost { color: #ffb066; font-size: 12px; margin: 0 0 3px; }
  #${READY_ID} .df-ready-actions { display: flex; gap: 8px; margin-top: 8px; }
  #${READY_ID} .df-ready-actions .btn { flex: 1 1 auto; min-height: 44px; font-size: 15px; }
  #${READY_ID} .df-expired { color: #ff9a8a; font-size: 13px; margin-top: 8px; }
  #${READY_ID} :focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 2px; }
  #dungeon-finder-scrim {
    position: fixed; inset: 0; background: #000000a6; z-index: 210; display: none;
  }
  #dungeon-finder-scrim[data-open="1"] { display: block; }
  /* The ONE thing outside this feature the ready check has to reach: Hud's
     shared confirm dialog is placed by the managed-window layer around z-index
     50-89, which is under our scrim. While a ready check owns the screen, the
     abandon confirmation must sit on top of it or the player answers a
     120-second question they cannot see. */
  body.${READY_BODY_CLASS} #confirm-dialog { z-index: 240; }

  /* Landscape phone: the viewport is short, so give both surfaces their height
     back and shrink the chrome padding rather than letting them clip. */
  @media (max-height: 500px) {
    #${PANEL_ID} { max-height: 94vh; padding: 6px 8px 8px; }
    #${READY_ID} { padding: 8px 10px 10px; max-width: 440px; }
    #${READY_ID} .df-ready-clock { font-size: 22px; margin: 0 0 4px; }
    #${READY_ID} .df-ready-actions .btn { min-height: 40px; }
  }
  @media (prefers-reduced-motion: reduce) {
    #${PANEL_ID}, #${PANEL_ID} *, #${READY_ID}, #${READY_ID} * {
      transition: none !important; animation: none !important;
    }
  }`;
  document.head.appendChild(style);
}

/**
 * True only when the panel is BOTH marked open and actually visible. Hud's
 * `closeAll` (Escape) closes the topmost `.window.panel` by writing an inline
 * `display: none`, which our own flag would otherwise never see, leaving the
 * toggle one press out of phase.
 */
function panelVisible(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.dataset.open === '1' && el.style.display !== 'none';
}

/** First-open centring, in the pixel units Hud's drag layer also writes. */
function centerPanel(el: HTMLElement): void {
  if (el.dataset.windowMoved === '1') return;
  const rect = el.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.round((window.innerWidth - rect.width) / 2))}px`;
  el.style.top = `${Math.max(8, Math.round((window.innerHeight - rect.height) / 2))}px`;
}

function ensurePanel(): HTMLElement {
  const existing = document.getElementById(PANEL_ID);
  if (existing) return existing;
  ensureStyles();
  const el = document.createElement('div');
  el.id = PANEL_ID;
  el.className = 'panel window';
  el.setAttribute('role', 'dialog');
  // Explicitly NON-modal: the world keeps running behind the window and Tab is
  // meant to leave it, so declaring aria-modal="false" is honest where a bare
  // role="dialog" would imply a focus trap that does not exist.
  el.setAttribute('aria-modal', 'false');
  el.setAttribute('aria-labelledby', `${PANEL_ID}-title`);
  el.tabIndex = -1;
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      closeDungeonFinderWindow();
    }
  });
  (document.getElementById('ui') ?? document.body).appendChild(el);
  return el;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/** The roles the player has ticked, defaulted to everything their class can do.
 *  An untouched player is therefore matched fastest, which is the sim's own rule
 *  (`resolveRoles`: an empty request means "anything"). */
function currentRoles(): LfgRoleId[] {
  const eligible = deps?.eligibleRoles() ?? [];
  const requested = selectedRoles ? [...selectedRoles] : [...defaultRoles()];
  return resolveRequestedRoles(requested, eligible);
}

function roleAvailable(role: LfgRoleId): boolean {
  const eligible = deps?.eligibleRoles() ?? [];
  return eligible.length === 0 ? role === 'dps' : eligible.includes(role);
}

/** What the toggles show before the player has touched them: the roles they are
 *  ALREADY queued as when the world reports them (so a queued player sees their
 *  real request, not a hopeful default), and otherwise everything their class
 *  can fill, which is the fastest way to match. */
function defaultRoles(): LfgRoleId[] {
  const queued = deps?.status()?.roles ?? [];
  const fromWorld = LFG_ROLE_IDS.filter((role) => queued.includes(role) && roleAvailable(role));
  return fromWorld.length > 0 ? fromWorld : LFG_ROLE_IDS.filter(roleAvailable);
}

function roleSelected(role: LfgRoleId): boolean {
  if (!roleAvailable(role)) return false;
  return selectedRoles === null ? defaultRoles().includes(role) : selectedRoles.has(role);
}

function toggleRole(role: LfgRoleId): void {
  if (!roleAvailable(role)) return;
  if (selectedRoles === null) {
    selectedRoles = new Set(defaultRoles());
  }
  if (selectedRoles.has(role)) {
    // Never let the last role be unticked: a request with nothing in it is
    // indistinguishable from "anything" to the sim, so silently turning a
    // deliberate empty pick into a full one would be a lie on screen.
    if (selectedRoles.size > 1) selectedRoles.delete(role);
  } else {
    selectedRoles.add(role);
  }
  listSig = '';
}

// ---------------------------------------------------------------------------
// Markup: the queue readout
// ---------------------------------------------------------------------------

function roleCountsHtml(view: LfgQueueView): string {
  const chips = view.roles
    .map(
      (row) =>
        `<li class="df-count${row.satisfied ? ' df-ok' : ''}"` +
        ` aria-label="${esc(lfgRoleCountAria(row.role, row.count, row.needed))}">` +
        `<span aria-hidden="true">${esc(lfgRoleCountText(row.role, row.count))}</span>` +
        `<span class="df-count-mark" aria-hidden="true">${esc(
          row.satisfied ? lfgRoleEnoughText() : lfgRoleShortText(row.needed),
        )}</span>` +
        `</li>`,
    )
    .join('');
  return (
    `<ul class="df-roles-count" role="list"` +
    ` aria-label="${esc(t('hudChrome.dungeonFinder.waitingNow'))}">${chips}</ul>`
  );
}

function statusHtml(view: LfgQueueView): string {
  const rows: string[] = [
    `<p class="df-heading">${esc(t('hudChrome.dungeonFinder.queueHeading'))}</p>`,
    `<div class="df-state">${esc(lfgStateText(view.state))}</div>`,
  ];
  if (view.dungeonId) {
    rows.push(`<div class="df-line">${esc(lfgQueuedForText(view.dungeonId))}</div>`);
  }
  if (view.queued) {
    // role="timer" with aria-live="off": a screen reader must not read a ticking
    // clock aloud once a second, so the words live in the element's own
    // accessible name and the reader picks them up on demand.
    rows.push(
      `<div class="df-line df-wait" role="timer" aria-live="off"` +
        ` aria-label="${esc(lfgWaitAria(view.wait))}">` +
        `<span class="df-time">${esc(lfgWaitText(view.wait))}</span></div>`,
    );
    // Why the wait is what it is. Strictness decays as a unit waits, so naming
    // the current step is the honest alternative to an unexplained spinner.
    rows.push(`<div class="df-line">${esc(lfgRelaxText(view.relax))}</div>`);
  }
  if (view.onCooldown) {
    rows.push(`<div class="df-line">${esc(lfgCooldownText(view.cooldown))}</div>`);
  }
  if (view.queuedPlayers !== null) {
    rows.push(`<div class="df-line">${esc(lfgQueuedPlayersText(view.queuedPlayers))}</div>`);
  }
  rows.push(roleCountsHtml(view));
  return rows.join('');
}

// ---------------------------------------------------------------------------
// Markup: the dungeon list and the role picker
// ---------------------------------------------------------------------------

function listingRowHtml(row: LfgListingRow, tabStop: boolean): string {
  const name = lfgDungeonName(row.dungeonId);
  // The three meta facts are separate ELEMENTS, never a concatenated sentence: a
  // locale is free to render them in any order and none carries another's
  // punctuation.
  const metaHtml =
    `<span class="df-row-meta">${esc(lfgLevelBandText(row.minQueueLevel, row.recommendedLevel))}</span>` +
    `<span class="df-row-meta">${esc(lfgGroupSizeText(row.groupSize, row.minGroupSize))}</span>` +
    `<span class="df-row-meta">${esc(lfgTierName(row.tier))}</span>`;
  const mark = row.eligible
    ? row.queued
      ? `<span class="df-row-mark">${esc(t('hudChrome.dungeonFinder.rowQueued'))}</span>`
      : ''
    : `<span class="df-row-mark">${esc(lfgLevelsToGoText(row.levelsToGo))}</span>`;
  // A locked row states the gate in its own accessible name, so the reason is
  // never carried by the dimmed styling alone. The two halves are joined by a
  // KEY, never by a hard-coded comma: the separator and the order are the
  // locale's to choose.
  const aria = row.eligible ? name : lfgLockedRowAria(name, row.minQueueLevel);
  return (
    `<button type="button" class="df-row" role="radio"` +
    ` aria-checked="${row.selected ? 'true' : 'false'}"` +
    (row.eligible ? '' : ' aria-disabled="true"') +
    ` tabindex="${tabStop ? '0' : '-1'}"` +
    ` data-dungeon="${esc(row.dungeonId)}"` +
    ` aria-label="${esc(aria)}">` +
    `<span class="df-row-main"><span class="df-row-name">${esc(name)}</span>${metaHtml}</span>` +
    mark +
    `</button>`
  );
}

function roleTogglesHtml(): string {
  return LFG_ROLE_IDS.map((role) => {
    const available = roleAvailable(role);
    const selected = roleSelected(role);
    return (
      `<button type="button" class="df-role" data-role="${esc(role)}"` +
      ` aria-pressed="${selected ? 'true' : 'false'}"` +
      (available ? '' : ' aria-disabled="true"') +
      ` aria-label="${esc(lfgRoleToggleAria(role, selected, available))}">` +
      `${esc(lfgRoleName(role))}</button>`
    );
  }).join('');
}

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

function emptyStatus(): LfgStatusInfo {
  return { state: 'idle', dungeonId: null, waitSeconds: 0, queuedByRole: {} };
}

/**
 * Everything about the panel EXCEPT the ticking wait clock.
 *
 * The clock is excluded on purpose. `.df-status` is a `role="status"` live
 * region, and rebuilding it once a second would have a screen reader read the
 * whole queue readout aloud every second for as long as the player waits. The
 * seconds are written into their own text node instead (see `renderDungeonFinder`),
 * inside a `role="timer" aria-live="off"` element that suppresses exactly that.
 */
function panelSignature(view: LfgQueueView): string {
  return [
    view.state,
    view.dungeonId ?? '',
    view.relax,
    view.counts.tank,
    view.counts.healer,
    view.counts.dps,
    view.queuedPlayers ?? -1,
    view.cooldown === null ? -1 : view.cooldown.totalSeconds,
    deps?.playerLevel() ?? 0,
    selectedDungeonId ?? '',
    selectedRoles ? [...selectedRoles].sort().join(',') : '*',
  ].join('|');
}

/**
 * Move the radio group's single tab stop onto one row and focus it.
 *
 * The roving index follows FOCUS, not the model's `selected` flag: the queued
 * dungeon wins the highlight, so a player browsing other rows while they wait
 * would otherwise be left standing on a row that is `tabindex="-1"` and drop
 * out of the group on the next Tab.
 */
function focusListingRow(el: HTMLElement, dungeonId: string): void {
  const rows = [...el.querySelectorAll<HTMLElement>('[data-dungeon]')];
  const target = rows.find((row) => row.dataset.dungeon === dungeonId);
  if (!target) return;
  for (const row of rows) row.tabIndex = row === target ? 0 : -1;
  target.focus();
}

function paint(el: HTMLElement): void {
  if (!deps) return;
  const status = deps.status() ?? emptyStatus();
  const view = buildLfgQueueView(status, nowMs());
  // Stamp the gates HERE rather than at the call site, so a repaint driven by a
  // click cannot be immediately undone by the next frame's gate check (which
  // would blow away the focus the click handler just placed).
  statusSig = panelSignature(view);
  listSig = statusSig;
  waitSig = String(view.wait.totalSeconds);
  const listings = buildLfgListingsView(deps.listings(), {
    playerLevel: deps.playerLevel(),
    selectedDungeonId,
    queuedDungeonId: view.dungeonId,
  });
  const target = listings.selectedDungeonId;

  // The radio group's single tab stop. It follows the selection, but a player
  // too low for EVERY dungeon has no selection at all, and a group where every
  // row is tabindex="-1" is a list no keyboard or screen reader can reach. The
  // rows are aria-disabled rather than disabled precisely so they stay
  // readable, so the first row takes the tab stop in that case.
  const tabStopId = listings.selectedDungeonId ?? listings.rows[0]?.dungeonId ?? null;

  const listHtml = listings.rows.length
    ? `<div class="df-list" role="radiogroup"` +
      ` aria-label="${esc(t('hudChrome.dungeonFinder.listHeading'))}">` +
      listings.rows.map((row) => listingRowHtml(row, row.dungeonId === tabStopId)).join('') +
      `</div>`
    : `<p class="df-empty">${esc(t('hudChrome.dungeonFinder.empty'))}</p>`;

  const joinDisabled = !view.canJoin || target === null;
  const actions = view.canLeave
    ? `<button type="button" class="btn" data-leave>${esc(t('hudChrome.dungeonFinder.leave'))}</button>`
    : `<button type="button" class="btn" data-join${joinDisabled ? ' disabled' : ''}` +
      (target ? ` aria-label="${esc(lfgJoinAria(target))}"` : '') +
      `>${esc(t('hudChrome.dungeonFinder.join'))}</button>`;

  el.innerHTML =
    `<div class="panel-title"><span id="${PANEL_ID}-title">${esc(t('hudChrome.dungeonFinder.title'))}</span>` +
    `<button type="button" class="x-btn" data-close aria-label="${esc(t('hudChrome.dungeonFinder.close'))}">${svgIcon('close')}</button></div>` +
    `<div class="df-body">` +
    `<p class="df-intro">${esc(t('hudChrome.dungeonFinder.subheading'))}</p>` +
    `<section class="df-card df-status" role="status">${statusHtml(view)}</section>` +
    `<section class="df-card">` +
    `<p class="df-heading">${esc(t('hudChrome.dungeonFinder.listHeading'))}</p>` +
    listHtml +
    `</section>` +
    `<section class="df-card">` +
    `<p class="df-heading">${esc(t('hudChrome.dungeonFinder.roleHeading'))}</p>` +
    `<div class="df-role-toggles" role="group" aria-label="${esc(t('hudChrome.dungeonFinder.roleHeading'))}">` +
    roleTogglesHtml() +
    `</div>` +
    `<p class="df-line">${esc(t('hudChrome.dungeonFinder.roleHint'))}</p>` +
    `</section>` +
    `<div class="df-actions">${actions}</div>` +
    `</div>`;

  el.querySelector('[data-close]')?.addEventListener('click', () => closeDungeonFinderWindow());
  el.querySelectorAll<HTMLElement>('[data-dungeon]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.getAttribute('aria-disabled') === 'true') return;
      const id = btn.dataset.dungeon ?? null;
      selectedDungeonId = id;
      paint(el);
      if (id !== null) focusListingRow(el, id);
    });
  });
  // Radio-group keyboard contract: arrows move between rows, which is what a
  // screen-reader user expects from role="radio" and what the roving tabindex
  // above is for.
  el.querySelector('[role="radiogroup"]')?.addEventListener('keydown', (raw) => {
    const ev = raw as KeyboardEvent;
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(ev.key)) return;
    const rows = [...el.querySelectorAll<HTMLElement>('[data-dungeon]')].filter(
      (row) => row.getAttribute('aria-disabled') !== 'true',
    );
    if (rows.length === 0) return;
    ev.preventDefault();
    const forward = ev.key === 'ArrowDown' || ev.key === 'ArrowRight';
    const current = rows.findIndex((row) => row === document.activeElement);
    // With nothing in the group focused, forward starts at the top and backward
    // at the bottom. Falling through to the wrap arithmetic would land backward
    // on the SECOND-to-last row, which reads as a skipped entry.
    const next =
      current < 0 ? rows[forward ? 0 : rows.length - 1] : rows[(current + (forward ? 1 : -1) + rows.length) % rows.length];
    next?.click();
  });
  el.querySelectorAll<HTMLElement>('[data-role]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role;
      if (!role || btn.getAttribute('aria-disabled') === 'true') return;
      toggleRole(role as LfgRoleId);
      paint(el);
      el.querySelector<HTMLElement>(`[data-role="${CSS.escape(role)}"]`)?.focus();
    });
  });
  el.querySelector('[data-join]')?.addEventListener('click', () => {
    if (!deps || target === null) return;
    deps.onJoin(target, currentRoles());
  });
  el.querySelector('[data-leave]')?.addEventListener('click', () => requestLeave());
}

/**
 * Leaving the queue.
 *
 * Free while merely waiting, so it goes straight through. While a ready check is
 * open it IS a decline and costs the same cooldown, so it asks first through
 * Hud's `confirmDialog` with the price named. This is the one Dungeon Finder
 * press slow enough to afford a confirmation.
 */
function requestLeave(): void {
  if (!deps) return;
  const status = deps.status();
  const proposed = status ? buildLfgQueueView(status, nowMs()).proposed : proposal !== null;
  if (!proposed) {
    deps.onLeave();
    return;
  }
  const text = lfgAbandonConfirmText(DUNGEON_FINDER_DECLINE_PENALTY_SEC);
  deps.confirm({
    title: text.title,
    body: text.body,
    okText: text.ok,
    cancelText: text.cancel,
    onOk: () => deps?.onLeave(),
  });
}

// ---------------------------------------------------------------------------
// Ready check
// ---------------------------------------------------------------------------

function ensureReady(): HTMLElement {
  const existing = document.getElementById(READY_ID);
  if (existing) return existing;
  ensureStyles();
  const scrim = document.createElement('div');
  scrim.id = 'dungeon-finder-scrim';
  const el = document.createElement('div');
  el.id = READY_ID;
  // Not `.window`: Hud's managed-window layer would let Escape's closeAll shut
  // this, and shutting a ready check IS a 300 second timeout. It carries only
  // the shared `.panel` chrome.
  el.className = 'panel';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', `${READY_ID}-title`);
  el.setAttribute('aria-describedby', `${READY_ID}-body`);
  el.tabIndex = -1;
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      // Escape MOVES FOCUS, it does not answer. Both exits from a ready check
      // are destructive (120 s or 300 s), so the reflex key must not spend one
      // on the player's behalf; it puts them one deliberate Enter from the
      // decline instead.
      ev.preventDefault();
      ev.stopPropagation();
      el.querySelector<HTMLElement>('[data-decline]')?.focus();
      return;
    }
    if (ev.key !== 'Tab') return;
    // A real focus trap, because aria-modal="true" promises one: the whole
    // screen behind this dialog is unreachable until it is answered.
    const focusable = [...el.querySelectorAll<HTMLElement>('button:not([disabled])')];
    if (focusable.length === 0) {
      // Both buttons are disarmed (answered, or the window ran out) but the
      // dialog is still up and still claims to be modal. Park focus on the
      // dialog itself rather than letting Tab escape behind a full-screen scrim
      // into controls the player cannot see.
      ev.preventDefault();
      el.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  });
  const host = document.getElementById('ui') ?? document.body;
  host.appendChild(scrim);
  host.appendChild(el);
  return el;
}

function readyHtml(view: LfgReadyCheckView): string {
  const text = lfgReadyCheckText(
    view.dungeonId,
    view.countdown,
    view.declinePenaltySeconds,
    view.timeoutPenaltySeconds,
  );
  const role = view.role ? `<p class="df-line">${esc(lfgAssignedRoleText(view.role))}</p>` : '';
  const tally =
    view.acceptedCount !== null && view.size !== null
      ? `<p class="df-line" role="status">${esc(lfgReadyTallyText(view.acceptedCount, view.size))}</p>`
      : '';
  const disabled = view.canAnswer ? '' : ' disabled';
  return (
    `<p class="df-ready-title" id="${READY_ID}-title">${esc(text.title)}</p>` +
    `<p class="df-ready-body" id="${READY_ID}-body">${esc(text.body)}</p>` +
    role +
    `<div class="df-ready-clock" role="timer" aria-live="off" aria-label="${esc(text.timeLeftAria)}">` +
    `<span data-clock>${esc(text.timeLeft)}</span></div>` +
    `<div class="df-ready-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"` +
    ` aria-valuenow="${view.percentRemaining}" aria-valuetext="${esc(text.timeLeftAria)}"` +
    ` aria-label="${esc(text.progressLabel)}">` +
    `<div class="df-ready-fill" style="width:${view.percentRemaining}%"></div></div>` +
    tally +
    // Both consequences sit ABOVE the buttons, always, in every state: this is
    // the only moment the choice exists and both answers are expensive.
    `<p class="df-cost">${esc(text.declineCost)}</p>` +
    `<p class="df-cost">${esc(text.timeoutCost)}</p>` +
    `<div class="df-ready-actions">` +
    `<button type="button" class="btn" data-decline${disabled}>${esc(text.decline)}</button>` +
    `<button type="button" class="btn cd-ok" data-accept${disabled}>${esc(text.accept)}</button>` +
    `</div>`
  );
}

function paintReady(el: HTMLElement, view: LfgReadyCheckView): void {
  // A structural repaint (the tally ticking up as others accept) must not drop
  // the player's focus on the floor mid ready check: it would leave a keyboard
  // user tabbing back to the Accept button under a draining clock.
  const focused = document.activeElement;
  const hadFocus =
    focused instanceof HTMLElement && el.contains(focused) ? focused.dataset : null;
  const restore = hadFocus?.accept !== undefined ? 'accept' : hadFocus?.decline !== undefined ? 'decline' : null;
  el.innerHTML = readyHtml(view);
  el.querySelector('[data-accept]')?.addEventListener('click', () => answer(true));
  el.querySelector('[data-decline]')?.addEventListener('click', () => answer(false));
  if (restore) el.querySelector<HTMLElement>(`[data-${restore}]`)?.focus();
}

function answer(accept: boolean): void {
  const open = proposal;
  if (!open || answeredProposalId === open.proposalId) return;
  // Latch the answer LOCALLY before dispatching, so a double press cannot send
  // two: the second would come back as `alreadyResponded` and print a refusal
  // for something the player did correctly. The dialog stays up, disarmed, and
  // shows the tally filling in until the world closes the proposal.
  answeredProposalId = open.proposalId;
  proposal = { ...open, responded: true };
  readySig = '';
  deps?.onRespond(open.proposalId, accept);
}

/** Raise the ready check for a freshly opened proposal. Called from Hud's
 *  `lfgProposal` arm; the deadline is the event's, the opened-at is now. */
export function openDungeonFinderReadyCheck(info: LfgProposalLike): void {
  // A repeat of the SAME proposal (the event and the world's own copy both
  // reporting it) must not restart the drain bar or steal focus back. A locally
  // latched answer also survives a world copy that has not caught up yet, so the
  // buttons never re-arm under the player's finger.
  if (proposal && proposal.proposalId === info.proposalId) {
    proposal = {
      ...proposal,
      ...info,
      responded: info.responded === true || proposal.responded === true,
    };
    return;
  }
  // A window that already ran out is never raised again, however long the world
  // keeps reporting it: re-raising would loop (open, repaint, expire, open).
  if (info.proposalId === expiredProposalId) return;
  answeredProposalId = null;
  proposal = { ...info, openedAt: nowMs() };
  readySig = '';
  readyTimeSig = '';
  const el = ensureReady();
  const active = document.activeElement;
  if (active instanceof HTMLElement && !el.contains(active)) readyOpener = active;
  const view = buildReadyCheckView(proposal, nowMs());
  paintReady(el, view);
  el.dataset.open = '1';
  const scrim = document.getElementById('dungeon-finder-scrim');
  if (scrim) scrim.dataset.open = '1';
  document.body.classList.add(READY_BODY_CLASS);
  // Focus lands on Accept: it is the non-destructive answer and the one a player
  // reaching for the keyboard almost always wants.
  el.querySelector<HTMLElement>('[data-accept]')?.focus();
}

export function closeDungeonFinderReadyCheck(): void {
  proposal = null;
  answeredProposalId = null;
  proposalConfirmedAt = null;
  readySig = '';
  readyTimeSig = '';
  const el = document.getElementById(READY_ID);
  if (el) {
    delete el.dataset.open;
    el.innerHTML = '';
  }
  const scrim = document.getElementById('dungeon-finder-scrim');
  if (scrim) delete scrim.dataset.open;
  document.body.classList.remove(READY_BODY_CLASS);
  // Hand focus back. The dialog is aria-modal and takes focus on open, so
  // dropping it on the floor would strand a keyboard user at document body
  // every time a ready check resolves.
  const back = readyOpener;
  readyOpener = null;
  if (back?.isConnected) back.focus();
}

export function isDungeonFinderReadyCheckOpen(): boolean {
  return proposal !== null;
}

/** Repaint the live parts of the ready check. Rebuilds the card only when the
 *  proposal itself changes; a plain second passing rewrites one text node, the
 *  bar width and two ARIA values. */
function renderReadyCheck(): void {
  // Reconcile against the world's own copy first. The event raised the dialog;
  // this is what keeps it truthful across a reconnect, a missed event, or a
  // proposal that ended server-side. The DECISION is pure (`reconcileReadyCheck`
  // in lfg_ui_model.ts, unit-tested there); this is only the effect.
  const live = deps?.proposal() ?? null;
  if (deps) {
    const action = reconcileReadyCheck({
      liveProposalId: live?.proposalId ?? null,
      localProposalId: proposal?.proposalId ?? null,
      lastConfirmedAt: proposalConfirmedAt,
      expiredProposalId,
      nowMs: nowMs(),
      graceMs: PROPOSAL_RECONCILE_GRACE_MS,
    });
    if (action === 'open' && live) {
      openDungeonFinderReadyCheck(live);
      // Stamp the confirmation AFTER the open, since a fresh open resets it.
      if (proposal?.proposalId === live.proposalId) proposalConfirmedAt = nowMs();
    } else if (action === 'close') {
      closeDungeonFinderReadyCheck();
    }
  }
  if (!proposal) return;
  const el = document.getElementById(READY_ID);
  if (!el) return;
  const view = buildReadyCheckView(proposal, nowMs());
  const sig = `${view.proposalId}|${view.dungeonId}|${view.role ?? ''}|${view.acceptedCount ?? -1}|${view.size ?? -1}|${view.responded ? 1 : 0}`;
  if (sig !== readySig) {
    readySig = sig;
    readyTimeSig = '';
    paintReady(el, view);
  }
  const timeSig = `${view.countdown.totalSeconds}|${view.percentRemaining}|${view.urgent ? 1 : 0}`;
  if (timeSig !== readyTimeSig) {
    readyTimeSig = timeSig;
    const text = lfgReadyCheckText(
      view.dungeonId,
      view.countdown,
      view.declinePenaltySeconds,
      view.timeoutPenaltySeconds,
    );
    const clockWrap = el.querySelector<HTMLElement>('.df-ready-clock');
    const clock = el.querySelector<HTMLElement>('[data-clock]');
    if (clock) clock.textContent = text.timeLeft;
    if (clockWrap) {
      clockWrap.setAttribute('aria-label', text.timeLeftAria);
      clockWrap.classList.toggle('df-urgent', view.urgent);
    }
    const bar = el.querySelector<HTMLElement>('.df-ready-bar');
    const fill = el.querySelector<HTMLElement>('.df-ready-fill');
    if (fill) fill.style.width = `${view.percentRemaining}%`;
    if (bar) {
      bar.setAttribute('aria-valuenow', String(view.percentRemaining));
      bar.setAttribute('aria-valuetext', text.timeLeftAria);
      bar.classList.toggle('df-urgent', view.urgent);
    }
  }
  if (view.expired) {
    // The window shut. Disarm the buttons so a late press cannot fire a doomed
    // answer, and let the sim's own `lfgDeny` (timedOut) deliver the penalty
    // line; the dialog itself steps aside a moment later.
    el.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.disabled = true;
    });
    // Remember WHICH proposal ran out. The world can keep reporting it for a few
    // frames after the deadline, and without this the reconcile above would
    // raise it again on the very next frame, forever.
    expiredProposalId = view.proposalId;
    proposal = null;
    answeredProposalId = null;
    proposalConfirmedAt = null;
    window.setTimeout(() => closeDungeonFinderReadyCheck(), 1500);
  }
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/** Compose the Dungeon Finder into the HUD. One call from Hud, then
 *  `renderDungeonFinder()` every frame. */
export function mountDungeonFinder(next: DungeonFinderDeps): void {
  deps = next;
  ensureStyles();
  listSig = '';
  statusSig = '';
  waitSig = '';
  readySig = '';
  readyTimeSig = '';
}

export function isDungeonFinderWindowOpen(): boolean {
  return panelVisible(document.getElementById(PANEL_ID));
}

export function openDungeonFinderWindow(): void {
  if (!deps) return;
  const el = ensurePanel();
  const active = document.activeElement;
  if (!panelVisible(el) && active instanceof HTMLElement && active !== el) opener = active;
  // Clear any inline `display: none` Hud's closeAll wrote, so the stylesheet's
  // own `[data-open="1"]` rule takes over again.
  el.style.removeProperty('display');
  el.dataset.open = '1';
  listSig = '';
  statusSig = '';
  waitSig = '';
  paint(el);
  centerPanel(el);
  el.focus();
}

export function closeDungeonFinderWindow(): void {
  const el = document.getElementById(PANEL_ID);
  if (!panelVisible(el)) return;
  delete el.dataset.open;
  el.style.removeProperty('display');
  el.innerHTML = '';
  listSig = '';
  statusSig = '';
  waitSig = '';
  const back = opener;
  opener = null;
  if (back?.isConnected) back.focus();
  deps?.onClose?.();
}

/** The one call a keybind or a micro-button needs. */
export function toggleDungeonFinderWindow(): void {
  if (isDungeonFinderWindowOpen()) closeDungeonFinderWindow();
  else openDungeonFinderWindow();
}

/**
 * Per-frame repaint. Cheap on an unchanged frame: it compares signatures before
 * it touches the DOM, so a stationary queue costs one string build.
 *
 * The ready check repaints even while the WINDOW is shut, which is the whole
 * point: a proposal can pop at any moment and the player must never have to have
 * the Dungeon Finder open to see it.
 */
export function renderDungeonFinder(): void {
  if (!deps) return;
  renderReadyCheck();
  const el = document.getElementById(PANEL_ID);
  if (!panelVisible(el)) return;
  const status = deps.status() ?? emptyStatus();
  const view = buildLfgQueueView(status, nowMs());
  const sig = panelSignature(view);
  if (sig !== statusSig || sig !== listSig) {
    paint(el);
    return;
  }
  // A plain second passing rewrites ONE text node and one accessible name, and
  // never the live region around them.
  const nextWait = String(view.wait.totalSeconds);
  if (nextWait === waitSig) return;
  waitSig = nextWait;
  const wrap = el.querySelector<HTMLElement>('.df-wait');
  if (!wrap) return;
  wrap.setAttribute('aria-label', lfgWaitAria(view.wait));
  const time = wrap.querySelector<HTMLElement>('.df-time');
  if (time) time.textContent = lfgWaitText(view.wait);
}

/** Drop every change gate and repaint from scratch. Hud calls this after a
 *  language switch, where the STATE is unchanged (so the signatures would
 *  suppress the write) but every word on screen is now stale. */
export function refreshDungeonFinder(): void {
  listSig = '';
  statusSig = '';
  waitSig = '';
  readySig = '';
  readyTimeSig = '';
  const el = document.getElementById(PANEL_ID);
  if (panelVisible(el)) paint(el);
  renderReadyCheck();
}

/** Tear the furniture down (leaving a world, logging out). */
export function unmountDungeonFinder(): void {
  closeDungeonFinderReadyCheck();
  document.getElementById(PANEL_ID)?.remove();
  document.getElementById(READY_ID)?.remove();
  document.getElementById('dungeon-finder-scrim')?.remove();
  document.body.classList.remove(READY_BODY_CLASS);
  deps = null;
  selectedDungeonId = null;
  selectedRoles = null;
  expiredProposalId = null;
  proposalConfirmedAt = null;
  readyOpener = null;
}
