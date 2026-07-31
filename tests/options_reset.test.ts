import { describe, expect, it } from 'vitest';
import { BOOL_SETTINGS, SETTING_RANGES } from '../src/game/settings';
import { isSettingKey, scopedSettingDefaults } from '../src/ui/options_reset';

// The Esc options window paints one "Reset to Defaults" button per sub-view
// (Graphics / Audio / Controller), but the button used to call Settings.reset(),
// which restores EVERY setting: resetting Audio silently wiped the player's
// Graphics, Interface and Controller choices too. scopedSettingDefaults turns the
// keys a sub-view actually rendered into the exact set of restores it may perform.
describe('scopedSettingDefaults', () => {
  it('resolves the shipped default for a numeric key', () => {
    expect(scopedSettingDefaults(['sfxVolume'])).toEqual([
      { key: 'sfxVolume', value: SETTING_RANGES.sfxVolume.def },
    ]);
  });

  it('resolves the shipped default for a boolean key', () => {
    expect(scopedSettingDefaults(['voiceEnabled'])).toEqual([
      { key: 'voiceEnabled', value: BOOL_SETTINGS.voiceEnabled.def },
    ]);
  });

  it('keeps first-render order and drops repeats', () => {
    const out = scopedSettingDefaults(['musicVolume', 'sfxVolume', 'musicVolume']);
    expect(out.map((d) => d.key)).toEqual(['musicVolume', 'sfxVolume']);
  });

  it('returns ONLY the keys asked for, never the whole settings object', () => {
    // The whole point: an Audio reset must not carry graphicsPreset or uiScale.
    const out = scopedSettingDefaults(['sfxVolume', 'musicVolume', 'voiceEnabled']);
    const keys = out.map((d) => d.key);
    expect(keys).toEqual(['sfxVolume', 'musicVolume', 'voiceEnabled']);
    expect(keys).not.toContain('graphicsPreset');
    expect(keys).not.toContain('uiScale');
    expect(keys.length).toBeLessThan(Object.keys(SETTING_RANGES).length);
  });

  it('drops an unknown key instead of throwing, so one stray id cannot break Reset', () => {
    expect(scopedSettingDefaults(['sfxVolume', 'notASetting'])).toEqual([
      { key: 'sfxVolume', value: SETTING_RANGES.sfxVolume.def },
    ]);
    expect(scopedSettingDefaults([])).toEqual([]);
  });

  it('every default it hands back is the one Settings itself would restore', () => {
    // Polarity guard: reading the wrong table (or a stale copy of it) would make
    // the scoped reset restore something that is not the shipped default.
    const all = scopedSettingDefaults([
      ...Object.keys(SETTING_RANGES),
      ...Object.keys(BOOL_SETTINGS),
    ]);
    expect(all.length).toBe(Object.keys(SETTING_RANGES).length + Object.keys(BOOL_SETTINGS).length);
    for (const { key, value } of all) {
      const expected =
        key in BOOL_SETTINGS
          ? BOOL_SETTINGS[key as keyof typeof BOOL_SETTINGS].def
          : SETTING_RANGES[key as keyof typeof SETTING_RANGES].def;
      expect(value, key).toBe(expected);
    }
  });
});

describe('isSettingKey', () => {
  it('accepts real numeric and boolean setting keys and rejects anything else', () => {
    expect(isSettingKey('sfxVolume')).toBe(true);
    expect(isSettingKey('voiceEnabled')).toBe(true);
    expect(isSettingKey('nope')).toBe(false);
    // Object.hasOwn, not `in`: a prototype member must not read as a setting.
    expect(isSettingKey('toString')).toBe(false);
    expect(isSettingKey('constructor')).toBe(false);
  });
});
