// The fishing bite cue: the on-screen prompt that opens when the fish bites and
// closes when the reel window runs out.
//
// A cue, not a log line. The chat line (gathering_feedback.ts) is the record;
// this is the thing a player reacts to inside a three-to-four-second window, so
// it is large, centred above the action bar, and on touch it is the reel BUTTON
// itself: a phone player has nowhere else to press.
//
// Self-contained by design (its own element + stylesheet, created on first
// show), so Hud composes it with one call and index.html does not change.
//
// ACCESSIBILITY (src/ui/CLAUDE.md): `role="status"` + `aria-live="assertive"` so
// the cue is announced the instant it appears, a real button with an accessible
// name and a 40x40 floor, keyboard-reachable, and the depleting window bar is a
// `role="timer"` whose text is spoken rather than a bare animation. Under
// `prefers-reduced-motion` the bar stops animating and simply holds its label.

import { esc } from './esc';
import { fishingBiteAria, fishingBiteWindowLabel } from './gathering_feedback';
import { t } from './i18n';

const CUE_ID = 'fishing-bite-cue';
const STYLE_ID = 'fishing-bite-cue-style';

export interface FishingBiteCueDeps {
  /** Fired when the player presses the cue. Hud routes it to the reel command. */
  onReel(): void;
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  #${CUE_ID} {
    position: fixed; left: 50%; bottom: 168px; transform: translateX(-50%);
    width: calc(100% - 32px); max-width: 280px;
    display: none; flex-direction: column; align-items: center; gap: 6px;
    min-height: 40px; padding: 10px 14px; z-index: 46;
    border: 2px solid var(--gold-dim); border-radius: 8px;
    background: var(--panel-bg); box-shadow: 0 2px 16px #000c;
    color: var(--gold); font-family: var(--title-font); font-size: 15px;
    text-align: center; cursor: var(--cursor-point);
  }
  #${CUE_ID}[data-open="1"] { display: flex; }
  #${CUE_ID} .fb-window {
    width: 100%; height: 8px; border-radius: 3px; overflow: hidden;
    background: #05050a; border: 1px solid #3b2e19;
  }
  #${CUE_ID} .fb-window-fill {
    height: 100%; width: 100%; background: linear-gradient(180deg, #d9a441, #8a5f18);
    transform-origin: left center;
  }
  #${CUE_ID} .fb-secs { font-family: var(--ui-font); font-size: 12px; color: #d5c19a; }
  #${CUE_ID}:focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 3px; }
  @media (prefers-reduced-motion: no-preference) {
    #${CUE_ID}[data-open="1"] .fb-window-fill { transition: width linear var(--fb-window, 3s); }
  }
  /* Landscape phone: the action bar sits higher, so lift the cue clear of it. */
  @media (max-height: 500px) {
    #${CUE_ID} { bottom: 120px; padding: 6px 10px; font-size: 13px; }
  }`;
  document.head.appendChild(style);
}

function ensureCue(deps: FishingBiteCueDeps): HTMLButtonElement {
  const existing = document.getElementById(CUE_ID);
  if (existing) return existing as HTMLButtonElement;
  ensureStyles();
  const el = document.createElement('button');
  el.id = CUE_ID;
  el.type = 'button';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'assertive');
  el.addEventListener('click', () => {
    hideFishingBiteCue();
    deps.onReel();
  });
  (document.getElementById('ui') ?? document.body).appendChild(el);
  return el;
}

/**
 * Open the cue for `windowSeconds`, the reel window the equipped rod bought. It
 * closes itself when the window elapses, so a missed reel never leaves a stale
 * prompt on screen; a landed or escaped event should still call
 * `hideFishingBiteCue` so the cue clears on the same tick as the outcome.
 */
export function showFishingBiteCue(windowSeconds: number, deps: FishingBiteCueDeps): void {
  const el = ensureCue(deps);
  const seconds = Math.max(0, windowSeconds);
  el.setAttribute('aria-label', fishingBiteAria());
  el.style.setProperty('--fb-window', `${seconds}s`);
  el.innerHTML =
    `<span>${esc(t('hudChrome.professions.fishing.bite'))}</span>` +
    `<span class="fb-window" role="timer" aria-label="${esc(fishingBiteWindowLabel(seconds))}">` +
    `<span class="fb-window-fill"></span></span>` +
    `<span class="fb-secs">${esc(fishingBiteWindowLabel(seconds))}</span>`;
  el.dataset.open = '1';

  // Start the depletion on the next frame: setting the width in the same frame
  // the element became visible would skip the transition entirely.
  const fill = el.querySelector<HTMLElement>('.fb-window-fill');
  if (fill) requestAnimationFrame(() => { fill.style.width = '0%'; });

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = seconds > 0 ? setTimeout(hideFishingBiteCue, seconds * 1000) : null;
}

export function hideFishingBiteCue(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  const el = document.getElementById(CUE_ID);
  if (!el) return;
  delete el.dataset.open;
  el.innerHTML = '';
}

export function isFishingBiteCueOpen(): boolean {
  return document.getElementById(CUE_ID)?.dataset.open === '1';
}
