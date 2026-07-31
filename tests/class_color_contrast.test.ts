import { describe, expect, it } from 'vitest';
import { CLASSES } from '../src/sim/content/classes';
import { CLASS_CHIPS } from '../src/guide/data';

// The class palette is not decoration: it is the only thing distinguishing one player's
// chat name, party frame, and nameplate from another's, and it is painted on the dark
// panel background. WCAG 2.1 AA wants 4.5:1 for small text. The pre-v0.32 shaman blue
// (0x0070de) measured 3.80:1 here and failed that, which is why the palette was retuned.
// This test is the tripwire: any future colour edit must keep every class readable.
const PANEL_BASE = 0x15151f; // --panel-base in index.html, the darkest chat backdrop
const AA_SMALL_TEXT = 4.5;

function relativeLuminance(hex: number): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((hex >> 16) & 255) +
    0.7152 * channel((hex >> 8) & 255) +
    0.0722 * channel(hex & 255)
  );
}

function contrastRatio(a: number, b: number): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('class colour palette', () => {
  it('keeps every class readable on the panel background', () => {
    const failing: string[] = [];
    for (const [id, def] of Object.entries(CLASSES)) {
      const ratio = contrastRatio(def.color, PANEL_BASE);
      if (ratio < AA_SMALL_TEXT) failing.push(`${id}: ${ratio.toFixed(2)}:1`);
    }
    expect(failing).toEqual([]);
  });

  it('gives every class its own colour', () => {
    // Deliberately a plain distinctness check, not a perceptual-distance one. Contrast
    // ratio compares luminance, so it rates the warrior orange and the shaman blue as
    // 1.10:1 despite them being obviously different to the eye; there is no cheap correct
    // metric for "can a player tell these apart" and a wrong one would just get muted.
    // The failure this actually guards is the real one: a copy-pasted duplicate value.
    const seen = new Map<number, string>();
    const duplicates: string[] = [];
    for (const [id, def] of Object.entries(CLASSES)) {
      const owner = seen.get(def.color);
      if (owner) duplicates.push(`${id} shares ${owner}'s colour`);
      else seen.set(def.color, id);
    }
    expect(duplicates).toEqual([]);
  });

  it('keeps the guide mirror in step with the sim table', () => {
    // src/guide/data.ts repeats the palette as CSS hex for the public wiki. A drift here
    // means the wiki shows a class in a colour the game never uses.
    const drift: string[] = [];
    for (const entry of CLASS_CHIPS) {
      const simDef = CLASSES[entry.id as keyof typeof CLASSES];
      if (!simDef) continue;
      const simHex = `#${simDef.color.toString(16).padStart(6, '0')}`;
      if (simHex !== entry.color) drift.push(`${entry.id}: guide ${entry.color} vs sim ${simHex}`);
    }
    expect(drift).toEqual([]);
  });
});
