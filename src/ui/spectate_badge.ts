import { t } from './i18n';

export interface SpectateBadge {
  update(name: string | null): void;
}

// Fixed gold banner shown while a moderator is spectating a player. This fork keeps
// its HUD CSS inline in index.html (there is no src/styles/hud.css), so the badge
// carries its own styles here and stays a fully self-contained module.
const BADGE_CSS = [
  'position:fixed',
  'top:max(14px, env(safe-area-inset-top))',
  'left:50%',
  'z-index:220',
  'transform:translateX(-50%)',
  'padding:7px 18px',
  'border:1px solid var(--gold, #ffd100)',
  'border-radius:var(--radius-md, 8px)',
  'background:rgba(12, 9, 5, 0.92)',
  'box-shadow:0 6px 18px rgba(0, 0, 0, 0.5)',
  'color:var(--gold, #ffd100)',
  'font:700 13px var(--title-font, Georgia)',
  'letter-spacing:0.5px',
  'pointer-events:none',
].join(';');

export function createSpectateBadge(): SpectateBadge {
  const element = document.createElement('div');
  element.id = 'spectate-badge';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.style.cssText = BADGE_CSS;
  element.hidden = true;
  document.body.appendChild(element);

  let currentName: string | null = null;
  const render = (): void => {
    element.hidden = currentName === null;
    element.textContent =
      currentName === null ? '' : t('hudChrome.spectate.banner', { name: currentName });
  };
  document.addEventListener('woc:languagechange', render);

  return {
    update(name) {
      if (name === currentName) return;
      currentName = name;
      render();
    },
  };
}
