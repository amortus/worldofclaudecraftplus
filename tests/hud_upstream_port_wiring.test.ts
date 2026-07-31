// Wiring guards for the HUD-side halves of this port batch. The decision logic all
// lives in small pure modules with their own suites (options_reset, aura_gain_log,
// spellbook_bar_gate, glyph_sprite_cache, map_ally_markers); what those suites
// cannot see is whether hud.ts still CALLS them. Each arm below pins one call site,
// so a future edit that quietly restores the old behavior reds a test instead of
// shipping. Source-scanning follows the tests/localization_fixes.test.ts precedent:
// hud.ts is one 15k-line class whose per-frame and window methods cannot be driven
// headlessly without a full DOM.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Normalized to LF: git's autocrlf checks this tree out with CRLF on Windows, and a
// scan that keyed on the raw bytes would pass on one developer's machine and fail on
// the next for reasons that have nothing to do with the code.
const hud = readFileSync(
  fileURLToPath(new URL('../src/ui/hud.ts', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

/** The body of a method, from its signature to the first dedented closing brace. */
function methodBody(name: string): string {
  const start = hud.indexOf(name);
  expect(start, `${name} not found in hud.ts`).toBeGreaterThan(-1);
  const rest = hud.slice(start);
  const end = rest.indexOf('\n  }\n');
  expect(end, `${name} body not delimited`).toBeGreaterThan(-1);
  return rest.slice(0, end);
}

describe('options: Reset to Defaults is scoped to the open sub-view', () => {
  it('the footer resets only the keys this view rendered, never the whole store', () => {
    const body = methodBody('private settingsViewFooter(): void {');
    expect(body).toContain('scopedSettingDefaults(this.settingsViewKeys)');
    // The bug: a bare no-arg reset restores EVERY setting, so resetting Audio
    // silently wiped the player's Graphics/Interface/Controller choices.
    expect(body).not.toMatch(/settings\.reset\(\)/);
    expect(body).not.toContain('settings.all()');
  });

  it('the shell clears the collected keys so a view never inherits the last one', () => {
    expect(methodBody('private settingsViewShell(title: string): HTMLElement {')).toContain(
      'this.settingsViewKeys = []',
    );
  });

  it('every setting control helper records the key it paints', () => {
    for (const sig of [
      'private settingSlider(',
      'private settingToggle(',
      'private settingBoolToggle(',
      'private settingChoice(',
    ])
      expect(methodBody(sig), sig).toContain('this.settingsViewKeys.push(key)');
  });
});

describe('combat log: a non-player aura GAIN is not automatically an affliction', () => {
  it('the aura event case classifies through auraGainLogKeyFor', () => {
    // Two `case 'aura'` arms exist: the spatial SFX one and the combat-log one.
    // The log arm is the one that resolves the display name.
    const anchor = hud.indexOf('auraDisplayNameFromSource(ev.name)');
    expect(anchor).toBeGreaterThan(-1);
    const start = hud.lastIndexOf("case 'aura': {", anchor);
    expect(start).toBeGreaterThan(-1);
    const body = hud.slice(start, hud.indexOf('\n        }', start));
    expect(body).toContain('findAuraForGainEvent(tgt.auras, ev.name)');
    expect(body).toContain('t(auraGainLogKeyFor(matched)');
    // The bug: a hardcoded afflicted key for every gain on another unit.
    expect(body).not.toMatch(/t\('hud\.combat\.auraAfflicted'/);
  });

  it('the aura BAR shares the one classifier instead of restating the kind list', () => {
    const body = methodBody('private renderAuras(');
    expect(body).toContain('isDebuffAura(a.kind, a.value)');
    expect(body).not.toContain("'mortal_wound',");
  });
});

describe('spellbook: the per-frame toggle refresh is change-gated', () => {
  it('an unchanged frame returns before touching the DOM', () => {
    const body = methodBody('private refreshSpellbookHotbarControls(): void {');
    expect(body).toContain('this.spellbookBarGate.takeChange(this.hotbarActions)');
    // The regression: a per-frame document query plus a dataset read per row.
    expect(body).not.toContain('querySelectorAll');
    expect(body).not.toContain('dataset.abilityId');
  });

  it('the repaint walks collected refs, not a fresh element query', () => {
    const body = methodBody('private paintSpellbookHotbarControls(): void {');
    expect(body).toContain('this.spellbookToggles');
    expect(body).not.toContain('querySelectorAll');
    // The free-slot probe is hoisted out of the per-row loop.
    expect(body).toContain('const noFreeSlot = this.firstEmptyHotbarIndex() === -1');
  });

  it('the rebuild drops the stale refs and re-collects them as rows are minted', () => {
    const body = methodBody('renderSpellbook(): void {');
    expect(body).toContain('this.spellbookToggles = []');
    expect(body).toContain('this.spellbookToggles.push({ abilityId: known.def.id, btn: toggle })');
  });
});

describe('minimap: NPC quest glyphs blit from a sprite cache', () => {
  it('the marker loop no longer sets ctx.font or fillTexts per glyph', () => {
    const body = methodBody('private updateMinimap(): void {');
    expect(body).toContain('this.npcGlyphSprites.sprite(glyph, MINIMAP_NPC_GLYPH_COLOR)');
    expect(body).toContain('glyphBlitX(mx - 2, NPC_GLYPH_SPRITE_GEOM)');
    expect(body).toContain('glyphBlitY(my + 3, NPC_GLYPH_SPRITE_GEOM)');
    expect(body).not.toContain('ctx.fillText(');
    expect(body).not.toContain("ctx.font = 'bold 11px Georgia'");
  });

  it('the sprite geometry and the font it is measured against stay together', () => {
    // A sprite box too small CLIPS rather than fails, so the two must move as one.
    expect(hud).toContain("const NPC_GLYPH_FONT = 'bold 11px Georgia'");
    expect(hud).toContain(
      'const NPC_GLYPH_SPRITE_GEOM: GlyphSpriteGeometry = { size: 16, originX: 2, baselineY: 12 }',
    );
  });
});

describe('world map: party members are drawn in the live overlay pass', () => {
  it('the zone map builds its ally list through the shared marker module', () => {
    const body = methodBody('private updateMapWindow(): void {');
    expect(body).toContain('buildMapAllyMarkers({');
    expect(body).toContain('party: this.sim.partyInfo?.members ?? []');
    expect(body).toContain('classColor: classCss');
  });
});

describe('language switch: signature-gated windows are rebuilt', () => {
  it('re-localizes the windows that only repaint on their own data moving', () => {
    const body = methodBody('private refreshLocalizedDynamicUi(): void {');
    expect(body).toContain('this.renderSpellbook()');
    expect(body).toContain('this.renderTalents()');
    // The social panel's slow-band gate is a JSON signature of ids and numbers,
    // none of which move on a language switch, so the latch has to be cleared.
    expect(body).toContain("this.lastSocialContent = ''");
    expect(body).toContain('this.renderSocial()');
    // The Interface view owns the language picker and rebuilds itself (with focus
    // restoration), so a blind rebuild here would race it.
    expect(body).toContain("this.optionsView !== 'interface'");
  });
});
