// Self-contained "connection lost, reconnecting" banner for the online world.
// It creates its own DOM and appends it to document.body (nothing lives in
// index.html) and paints the pure countdown math from reconnect_status_core.
// main.ts wires it to ClientWorld's onConnectionLost / onReconnected; the
// FATAL path (onDisconnect: retries exhausted, kick) stays on main.ts's
// fatalOverlay, which sits above this banner (z 200 vs 190).
//
// All text goes through t(); the DOM is built with createElement/textContent
// (no innerHTML), so there is nothing to esc() here.

import { t } from './i18n';
import { reconnectStatusView } from './reconnect_status_core';

// How long the "Connection restored." confirmation lingers before the banner
// removes itself: long enough to read, short enough not to nag.
const RESTORED_LINGER_MS = 2000;
// Repaint faster than 1 Hz so the seconds countdown never visibly skips.
const TICK_MS = 250;

export class ReconnectOverlay {
  private root: HTMLDivElement | null = null;
  private statusEl: HTMLDivElement | null = null;
  private countdownEl: HTMLDivElement | null = null;
  private tickTimer: number | undefined;
  private hideTimer: number | undefined;
  private attempt = 1;
  private maxAttempts = 1;
  private nextRetryAtMs = 0;

  // Show (or update) the banner for the retry that was just armed.
  show(attempt: number, maxAttempts: number, nextRetryAtMs: number): void {
    this.attempt = attempt;
    this.maxAttempts = maxAttempts;
    this.nextRetryAtMs = nextRetryAtMs;
    // A reconnect cycle restarting while the "restored" flash is still up
    // must cancel the pending removal, or the new banner would vanish.
    if (this.hideTimer !== undefined) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }
    this.ensureDom();
    this.render();
    if (this.tickTimer === undefined) {
      this.tickTimer = window.setInterval(() => this.render(), TICK_MS);
    }
  }

  // Rejoin succeeded: flash the confirmation briefly, then remove.
  showRestored(): void {
    if (!this.root) return; // never shown, nothing to confirm
    this.stopTicking();
    if (this.statusEl) this.statusEl.textContent = t('hudChrome.reconnect.restored');
    if (this.countdownEl) this.countdownEl.textContent = '';
    this.hideTimer = window.setTimeout(() => this.dismiss(), RESTORED_LINGER_MS);
  }

  // Immediate removal with no confirmation flash - used when the FATAL
  // overlay takes over so the two never stack.
  dismiss(): void {
    this.stopTicking();
    if (this.hideTimer !== undefined) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }
    this.root?.remove();
    this.root = null;
    this.statusEl = null;
    this.countdownEl = null;
  }

  private stopTicking(): void {
    if (this.tickTimer !== undefined) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }
  }

  private ensureDom(): void {
    if (this.root) return;
    const root = document.createElement('div');
    root.id = 'reconnect-overlay';
    // Dark-fantasy banner consistent with the HUD theme: falls back to fixed
    // parchment/gold tones when the theme variables are unavailable.
    // pointer-events none: the world (and the fatal overlay's button, should
    // it appear) stays clickable underneath.
    root.style.cssText = [
      'position:fixed',
      'top:16%',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:190',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:4px',
      'padding:12px 22px',
      'max-width:90vw',
      'background:rgba(12,9,6,0.92)',
      'border:1px solid var(--color-border, #7a6335)',
      'border-radius:6px',
      'box-shadow:0 0 18px rgba(0,0,0,0.7)',
      'color:var(--color-text-light, #e8dcc0)',
      'font-family:var(--font-heading, serif)',
      'font-size:15px',
      'text-align:center',
      'text-shadow:1px 1px 2px #000',
      'pointer-events:none',
    ].join(';');
    const statusEl = document.createElement('div');
    const countdownEl = document.createElement('div');
    countdownEl.style.cssText = 'font-size:12px;color:var(--color-text-muted, #b3a684)';
    root.appendChild(statusEl);
    root.appendChild(countdownEl);
    document.body.appendChild(root);
    this.root = root;
    this.statusEl = statusEl;
    this.countdownEl = countdownEl;
  }

  private render(): void {
    if (!this.statusEl || !this.countdownEl) return;
    const view = reconnectStatusView(this.attempt, this.maxAttempts, this.nextRetryAtMs, Date.now());
    this.statusEl.textContent = t('hudChrome.reconnect.attempt', {
      attempt: view.attempt,
      max: view.maxAttempts,
    });
    this.countdownEl.textContent = view.retryingNow
      ? t('hudChrome.reconnect.now')
      : t('hudChrome.reconnect.retryIn', { seconds: view.secondsUntilRetry });
  }
}
