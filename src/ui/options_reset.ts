// Scoped "Reset to Defaults" for the Esc options sub-views (Graphics / Audio /
// Controller). Each sub-view paints its own footer with a Reset button, but the
// button used to call Settings.reset(), which restores EVERY setting: resetting
// Audio silently wiped the player's Graphics, Interface and Controller choices too.
//
// Pure and DOM-free (a Vitest imports it directly). It reads only the two default
// tables in src/game/settings.ts, which are plain data, so the answer is decided in
// one place instead of being re-derived at each footer call site.

import { BOOL_SETTINGS, type GameSettings, SETTING_RANGES } from '../game/settings';

export type SettingKey = keyof GameSettings;

/** One key restored to its shipped default. */
export interface SettingDefault {
  readonly key: SettingKey;
  readonly value: number | boolean;
}

const isBoolKey = (key: string): key is Extract<SettingKey, keyof typeof BOOL_SETTINGS> =>
  Object.hasOwn(BOOL_SETTINGS, key);
const isNumericKey = (key: string): key is Extract<SettingKey, keyof typeof SETTING_RANGES> =>
  Object.hasOwn(SETTING_RANGES, key);

/** True when `key` names a real persisted setting (numeric or boolean). */
export function isSettingKey(key: string): key is SettingKey {
  return isBoolKey(key) || isNumericKey(key);
}

/**
 * The `{key, default}` pairs for the settings a sub-view actually rendered, in first
 * -render order and deduped. Unknown keys are dropped rather than throwing: the
 * caller collects them from live control-building code, and a stray id must not take
 * the whole Reset button down with it.
 */
export function scopedSettingDefaults(keys: Iterable<string>): SettingDefault[] {
  const out: SettingDefault[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key) || !isSettingKey(key)) continue;
    seen.add(key);
    out.push({
      key,
      value: isBoolKey(key) ? BOOL_SETTINGS[key].def : SETTING_RANGES[key].def,
    });
  }
  return out;
}
