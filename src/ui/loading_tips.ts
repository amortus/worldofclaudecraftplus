// Cycling loading-screen tips. A long "Loading world.. N/206" is dead time, so rotate a
// short, spoiler-free gameplay hint every few seconds while the world streams in. One
// interval, looped; started when the loading screen shows and stopped when it hides.
import { t, type TranslationKey } from './i18n';

const TIP_KEYS: readonly TranslationKey[] = [
  'hudChrome.loadingTips.map',
  'hudChrome.loadingTips.quests',
  'hudChrome.loadingTips.inspect',
  'hudChrome.loadingTips.camera',
  'hudChrome.loadingTips.chat',
  'hudChrome.loadingTips.rested',
  'hudChrome.loadingTips.talents',
  'hudChrome.loadingTips.vendor',
  'hudChrome.loadingTips.group',
  'hudChrome.loadingTips.classes',
];

let tipTimer: number | undefined;

/** Begin cycling tips into `el` (resolved fresh each call so a locale switch re-renders).
 *  Safe to call repeatedly; a null element or empty list is a no-op. */
export function startLoadingTips(el: HTMLElement | null, periodMs = 5000): void {
  stopLoadingTips();
  if (!el) return;
  const tips = TIP_KEYS.map((k) => t(k));
  if (tips.length === 0) return;
  // Vary the first tip so a quick reload is not always the same line (UI timing only).
  let i = Math.floor(performance.now() / periodMs) % tips.length;
  const show = (): void => {
    el.textContent = tips[i % tips.length];
    i += 1;
  };
  show();
  tipTimer = window.setInterval(show, periodMs);
}

export function stopLoadingTips(): void {
  if (tipTimer !== undefined) {
    clearInterval(tipTimer);
    tipTimer = undefined;
  }
}
