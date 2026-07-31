import { beforeAll, describe, expect, it, vi } from 'vitest';

// hud.ts transitively imports the character-asset module, whose import-time GLB
// preload sweep cannot run under Node; stub it (the aura_set_signature precedent).
vi.mock('../src/render/characters/assets', () => ({
  preloadMechAssets: () => Promise.resolve(),
}));
vi.mock('../src/render/characters/portrait', () => ({
  onPortraitsReady: () => {},
  portraitsReady: () => false,
  playerPortraitDataUrl: () => null,
  visualPortraitDataUrl: () => null,
}));

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS } from '../src/sim/data';
import { itemDisplayName } from '../src/ui/entity_i18n';
import { Hud } from '../src/ui/hud';
import {
  ensureLocaleLoaded,
  formatMoney,
  formatNumber,
  setLanguage,
  supportedLanguages,
  t,
} from '../src/ui/i18n';

// The vendor-sell combat-log line. The sim emits "Sold <name>[ xN] for <money>." and
// the client re-localizes it in Hud.localizeLootText. A GREEDY single capture feeds
// "Amber Hide x2" whole into the exact-name lookup, which only matches bare item
// names: the lookup misses and the raw English name (plus the sim's bare "xN"
// spelling) leaks into an otherwise-localized sentence. Every sibling arm (listed /
// bought / reclaimed) already splits the suffix off; this one did not.
//
// Exercised through a bare Hud prototype: localizeLootText is private and reads no
// instance state on this path.
interface LootTextHarness {
  localizeLootText(text: string): string;
}
const harness = (): LootTextHarness => Object.create(Hud.prototype) as unknown as LootTextHarness;

describe('vendor sell log line', () => {
  it('still localizes a single-item sale (no xN suffix)', () => {
    try {
      setLanguage('en');
      const expected = t('hud.logs.soldItem', {
        item: itemDisplayName(ITEMS.amber_hide),
        money: formatMoney(4),
      });
      expect(harness().localizeLootText('Sold Amber Hide for 4c.')).toBe(expected);
    } finally {
      setLanguage('en');
    }
  });

  it('localizes a STACKED sale instead of leaking the raw English name', () => {
    try {
      setLanguage('en');
      const expectedItem = `${itemDisplayName(ITEMS.amber_hide)} ${t('itemUi.bags.stackCount', {
        count: formatNumber(2, { maximumFractionDigits: 0 }),
      })}`;
      const out = harness().localizeLootText('Sold Amber Hide x2 for 8c.');
      expect(out).toBe(t('hud.logs.soldItem', { item: expectedItem, money: formatMoney(8) }));
      // The regression this guards: with a greedy capture the whole "Amber Hide x2"
      // went into the exact-name lookup, so the item slot kept the sim's raw
      // spelling instead of the localized name plus the localized stack count.
      expect(out).toContain(
        t('itemUi.bags.stackCount', { count: formatNumber(2, { maximumFractionDigits: 0 }) }),
      );
    } finally {
      setLanguage('en');
    }
  });

  it('splits the suffix off a MULTI-WORD item name rather than swallowing it', () => {
    // The lazy capture has to stop at the real " xN", not at the first space.
    const out = harness().localizeLootText('Sold Amber Hide x12 for 1g 2s 3c.');
    expect(out).toContain(itemDisplayName(ITEMS.amber_hide));
    expect(out).toContain(
      t('itemUi.bags.stackCount', { count: formatNumber(12, { maximumFractionDigits: 0 }) }),
    );
  });

  it('does not steal the bulk-junk sale line, which has its own arm', () => {
    const out = harness().localizeLootText('Sold 3 junk items for 1s.');
    expect(out).toBe(
      t('hud.logs.soldJunkMany', {
        count: formatNumber(3, { maximumFractionDigits: 0 }),
        money: formatMoney(100),
      }),
    );
  });

  it('recognizes the exact sentence sim.ts emits, template and all', () => {
    // Binds the arm to the SOURCE rather than to a string typed here: a reworded
    // emit must fail this instead of silently falling through to raw English.
    const src = readFileSync(fileURLToPath(new URL('../src/sim/sim.ts', import.meta.url)), 'utf8');
    expect(src).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the source literally contains this template expression
      "`Sold ${def.name}${sellCount > 1 ? ' x' + sellCount : ''} for ${formatMoney(payout)}.`",
    );
  });
});

// pt_BR is this fork's DEFAULT locale, so a leak here is what most players see.
// The locales lazy-load on this branch, hence the ensureLocaleLoaded sweep.
describe('every locale renders the stacked sale through t(), not raw English', () => {
  beforeAll(async () => {
    for (const lang of supportedLanguages) await ensureLocaleLoaded(lang);
  });

  it.each(supportedLanguages)('%s', (lang) => {
    try {
      setLanguage(lang);
      const item = `${itemDisplayName(ITEMS.amber_hide)} ${t('itemUi.bags.stackCount', {
        count: formatNumber(2, { maximumFractionDigits: 0 }),
      })}`;
      const out = harness().localizeLootText('Sold Amber Hide x2 for 8c.');
      expect(out, lang).toBe(t('hud.logs.soldItem', { item, money: formatMoney(8) }));
      // The item slot must carry the LOCALIZED stack count, never the sim's bare
      // "x2" spelling that a greedy capture would have left glued to the name.
      expect(out, lang).toContain(
        t('itemUi.bags.stackCount', { count: formatNumber(2, { maximumFractionDigits: 0 }) }),
      );
    } finally {
      setLanguage('en');
    }
  });
});
