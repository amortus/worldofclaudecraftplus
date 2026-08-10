// The corpse-run panel inside the death overlay.
//
// A self-contained HUD module the HUD composes, not another banner section in
// hud.ts: it builds its own DOM (so `index.html` needs no new markup), owns the
// two resurrection buttons, and repaints from one flat view per frame.
//
// The split follows `unit_portrait.ts` / `unit_portrait_painter.ts`: `ghostPanelView`
// is a pure function of the world's `GhostView` that a Vitest imports directly,
// and the DOM half below is a thin consumer that only writes what changed.
// Repainting is signature-gated, so a ghost standing still costs no DOM writes,
// which matters on the reference phone.

import { corpseDistanceText, spiritHealerText } from './ghost_feedback';
import { t } from './i18n';
import type { GhostView } from '../world_api';

/** Everything the panel draws, decided without touching the DOM. */
export interface GhostPanelView {
  title: string;
  corpseLine: string;
  healerLine: string;
  corpseLabel: string;
  healerLabel: string;
  /** The corpse button is hidden outright when the death left no body. */
  corpseVisible: boolean;
  corpseEnabled: boolean;
  healerEnabled: boolean;
}

export function ghostPanelView(ghost: GhostView): GhostPanelView {
  return {
    title: t('hudChrome.ghost.ghostTitle'),
    corpseLine: corpseDistanceText(ghost.corpseDistance, ghost.corpseInRange),
    healerLine: spiritHealerText(ghost.spiritHealerInRange),
    corpseLabel: t('hudChrome.ghost.resurrectAtCorpse'),
    healerLabel: t('hudChrome.ghost.resurrectAtHealer'),
    corpseVisible: ghost.corpse !== null,
    corpseEnabled: ghost.corpseInRange,
    healerEnabled: ghost.spiritHealerInRange,
  };
}

/**
 * A repaint signature: the panel rewrites the DOM only when one of these
 * actually changed. Distances are bucketed to whole yards because that is the
 * precision the readout shows, so a walking ghost repaints at most once a yard
 * instead of twenty times a second.
 */
export function ghostPanelSignature(ghost: GhostView | null): string {
  if (!ghost) return '';
  const yards = ghost.corpseDistance === null ? 'none' : String(Math.round(ghost.corpseDistance));
  return `${yards}|${ghost.corpseInRange ? 1 : 0}|${ghost.spiritHealerInRange ? 1 : 0}|${
    ghost.corpse ? 1 : 0
  }`;
}

export interface GhostPanelHandlers {
  onResurrectAtCorpse(): void;
  onResurrectAtSpiritHealer(): void;
}

export interface MountedGhostPanel {
  /** Paint the ghost state, or hide the panel entirely when null. */
  update(ghost: GhostView | null): void;
  /** Force the next `update` to repaint (used on a language change). */
  invalidate(): void;
}

function button(id: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'btn';
  el.id = id;
  el.addEventListener('click', () => {
    if (!el.disabled) onClick();
  });
  return el;
}

/**
 * Build the panel into the death overlay and return its updater. Everything is
 * created here rather than authored in `index.html`, so the death overlay's
 * existing markup (the heading, Release Spirit, the two ad buttons) is untouched
 * and this module owns its whole surface.
 */
export function mountGhostPanel(
  overlay: HTMLElement,
  handlers: GhostPanelHandlers,
): MountedGhostPanel {
  // The overlay's own "You have died." heading, captured BEFORE this panel adds
  // its own: while the spirit is out it is replaced rather than stacked, so the
  // overlay never shows two headings. Left untouched (and re-shown) otherwise,
  // so its `data-i18n` re-localization keeps working.
  const deathHeading = overlay.querySelector('h2');

  const root = document.createElement('div');
  root.id = 'ghost-panel';
  root.style.display = 'none';
  // The overlay itself goes click-through while the spirit is out (see
  // setVisible), so the panel has to claim pointer events back for its buttons.
  root.style.pointerEvents = 'auto';
  root.style.flexDirection = 'column';
  root.style.alignItems = 'center';
  root.style.gap = '10px';

  const title = document.createElement('h2');
  title.id = 'ghost-panel-title';
  root.appendChild(title);

  const corpseLine = document.createElement('div');
  corpseLine.id = 'ghost-corpse-line';
  corpseLine.style.color = '#cfd8e3';
  root.appendChild(corpseLine);

  const buttons = document.createElement('div');
  buttons.style.display = 'flex';
  buttons.style.gap = '10px';
  buttons.style.flexWrap = 'wrap';
  buttons.style.justifyContent = 'center';
  const corpseBtn = button('ghost-rez-corpse', handlers.onResurrectAtCorpse);
  const healerBtn = button('ghost-rez-healer', handlers.onResurrectAtSpiritHealer);
  buttons.appendChild(corpseBtn);
  buttons.appendChild(healerBtn);
  root.appendChild(buttons);

  const healerLine = document.createElement('div');
  healerLine.id = 'ghost-healer-line';
  healerLine.style.color = '#9aa6b2';
  healerLine.style.fontSize = '13px';
  root.appendChild(healerLine);

  overlay.appendChild(root);

  let lastSig: string | null = null;
  let visible = false;

  const setVisible = (next: boolean): void => {
    if (visible === next) return;
    visible = next;
    root.style.display = next ? 'flex' : 'none';
    if (deathHeading instanceof HTMLElement) deathHeading.style.display = next ? 'none' : '';
    // The death overlay covers the whole viewport and sits above the canvas, so
    // leaving it hit-testable would swallow mouselook and click-to-move for the
    // ENTIRE corpse run: a ghost could only turn with the keyboard. A body on the
    // ground is not going anywhere, so the overlay keeps its clicks then; a
    // released spirit is, so it goes click-through and only this panel catches.
    overlay.style.pointerEvents = next ? 'none' : '';
  };

  return {
    invalidate(): void {
      lastSig = null;
    },
    update(ghost: GhostView | null): void {
      if (!ghost) {
        setVisible(false);
        lastSig = null;
        return;
      }
      setVisible(true);
      const sig = ghostPanelSignature(ghost);
      if (sig === lastSig) return;
      lastSig = sig;
      const view = ghostPanelView(ghost);
      title.textContent = view.title;
      corpseLine.textContent = view.corpseLine;
      healerLine.textContent = view.healerLine;
      corpseBtn.style.display = view.corpseVisible ? '' : 'none';
      corpseBtn.textContent = view.corpseLabel;
      corpseBtn.disabled = !view.corpseEnabled;
      corpseBtn.style.opacity = view.corpseEnabled ? '1' : '0.5';
      healerBtn.textContent = view.healerLabel;
      healerBtn.disabled = !view.healerEnabled;
      healerBtn.style.opacity = view.healerEnabled ? '1' : '0.5';
    },
  };
}
