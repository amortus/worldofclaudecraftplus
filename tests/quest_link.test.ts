import { describe, expect, it } from 'vitest';
import {
  encodeItemLink,
  encodeQuestLink,
  isLinkableId,
  parseChatSegments,
  tryEncodeItemLink,
  tryEncodeQuestLink,
} from '../src/ui/quest_link';

describe('quest_link', () => {
  it('encodes a questId into a token', () => {
    expect(encodeQuestLink('q_wolves')).toBe('[[q:q_wolves]]');
  });

  it('round-trips a single link embedded in text', () => {
    const text = `Check this out ${encodeQuestLink('q_wolves')}`;
    expect(parseChatSegments(text)).toEqual([
      { kind: 'text', value: 'Check this out ' },
      { kind: 'quest', questId: 'q_wolves' },
    ]);
  });

  it('parses multiple links with text between and after', () => {
    const text = `${encodeQuestLink('q_a')} and ${encodeQuestLink('q_b')} done`;
    expect(parseChatSegments(text)).toEqual([
      { kind: 'quest', questId: 'q_a' },
      { kind: 'text', value: ' and ' },
      { kind: 'quest', questId: 'q_b' },
      { kind: 'text', value: ' done' },
    ]);
  });

  it('returns plain text unchanged when there are no links', () => {
    expect(parseChatSegments('just talking')).toEqual([{ kind: 'text', value: 'just talking' }]);
  });

  it('treats malformed/empty tokens as plain text', () => {
    expect(parseChatSegments('[[q:]] [[q]] [[x:q_a]]')).toEqual([
      { kind: 'text', value: '[[q:]] [[q]] [[x:q_a]]' },
    ]);
  });

  it('handles empty string', () => {
    expect(parseChatSegments('')).toEqual([{ kind: 'text', value: '' }]);
  });

  it('encodes an itemId into a token', () => {
    expect(encodeItemLink('sword_iron')).toBe('[[i:sword_iron]]');
  });

  it('round-trips a single item link embedded in text', () => {
    const text = `Look at ${encodeItemLink('sword_iron')}!`;
    expect(parseChatSegments(text)).toEqual([
      { kind: 'text', value: 'Look at ' },
      { kind: 'item', itemId: 'sword_iron' },
      { kind: 'text', value: '!' },
    ]);
  });

  it('parses quest and item links mixed in one message', () => {
    const text = `${encodeQuestLink('q_a')} drops ${encodeItemLink('gem_ruby')}`;
    expect(parseChatSegments(text)).toEqual([
      { kind: 'quest', questId: 'q_a' },
      { kind: 'text', value: ' drops ' },
      { kind: 'item', itemId: 'gem_ruby' },
    ]);
  });

  it('treats an unknown link prefix as plain text', () => {
    expect(parseChatSegments('[[x:foo]] [[i:]]')).toEqual([
      { kind: 'text', value: '[[x:foo]] [[i:]]' },
    ]);
  });
});

// The charset cases every agreement sweep below runs, linkable and not. Shared so
// the predicate and both guarded encoders are bound to the SAME id set: an arm that
// only saw the linkable half would pass on an always-true guard.
const CHARSET_CASES = [
  'copper_ore',
  'ARCANE_dust_2',
  '_leading_underscore',
  '9',
  'odd-id',
  'odd.id',
  'odd id',
  'odd:id',
  'odd]]id',
  '',
];

// The encode guard: a token whose id the parser cannot match is NOT dropped by
// parseChatSegments, it survives as a TEXT segment, so the player and every
// recipient read the literal "[[i:...]]" source instead of a link. Every production
// encode site therefore goes through tryEncode*, which answers the charset question
// once, beside the regex that decides it.
describe('isLinkableId agrees with the parser it guards', () => {
  const parsesAsOneItemLink = (id: string): boolean => {
    const segments = parseChatSegments(encodeItemLink(id));
    return segments.length === 1 && segments[0].kind === 'item' && segments[0].itemId === id;
  };

  it.each(CHARSET_CASES)('%o: the predicate matches what the parser does', (id) => {
    expect(isLinkableId(id)).toBe(parsesAsOneItemLink(id));
  });

  it('rejects the punctuated shapes a content id could plausibly take', () => {
    expect(isLinkableId('odd-id.with punctuation')).toBe(false);
    expect(isLinkableId('q_wolves')).toBe(true);
  });
});

describe('the guarded encoders return null exactly when the parser would balk', () => {
  // Bound to parseChatSegments, NOT to isLinkableId: a non-null return must
  // ROUND-TRIP through the real parser, which is what keeps a future charset edit
  // from quietly widening one side of the pair.
  const parserKeeps = (id: string, kind: 'item' | 'quest'): boolean => {
    const segments = parseChatSegments(kind === 'item' ? encodeItemLink(id) : encodeQuestLink(id));
    return segments.length === 1 && segments[0].kind === kind;
  };

  it.each(CHARSET_CASES)('%o: tryEncodeItemLink matches the parser', (id) => {
    const token = tryEncodeItemLink(id);
    expect(token !== null).toBe(parserKeeps(id, 'item'));
    if (token !== null) expect(parseChatSegments(token)).toEqual([{ kind: 'item', itemId: id }]);
  });

  it.each(CHARSET_CASES)('%o: tryEncodeQuestLink matches the parser', (id) => {
    const token = tryEncodeQuestLink(id);
    expect(token !== null).toBe(parserKeeps(id, 'quest'));
    if (token !== null) expect(parseChatSegments(token)).toEqual([{ kind: 'quest', questId: id }]);
  });

  it('emits the same token the raw encoder does for an id it accepts', () => {
    // The guard must not change the wire shape of a link that works today, or
    // every shipped item and quest link would move.
    expect(tryEncodeItemLink('sword_iron')).toBe(encodeItemLink('sword_iron'));
    expect(tryEncodeQuestLink('q_wolves')).toBe(encodeQuestLink('q_wolves'));
  });

  it('returns null, not a doomed token, for the punctuated shapes', () => {
    // Polarity: an always-null pair would satisfy the sweeps above only if
    // isLinkableId were also always false, so pinning both ends means neither can
    // drift alone.
    expect(tryEncodeItemLink('odd-id.with punctuation')).toBeNull();
    expect(tryEncodeQuestLink('q-odd.quest')).toBeNull();
  });
});

describe('every chat-link encode site in src/ goes through the guard', () => {
  // Routing today's three call sites through the guard is worth little if the
  // fourth one can skip it, and a reviewer cannot see that from hud.ts.
  it('leaves the raw encoders referenced only by the module that owns them', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join, relative } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const repoRoot = fileURLToPath(new URL('..', import.meta.url));
    const QUEST_LINK_FILE = 'src/ui/quest_link.ts';
    // Mirrors the stripComments precedent in tests/architecture.test.ts: block
    // comments blanked (line count preserved), then line comments, keeping the
    // '//' inside a "://" URL. Load-bearing in BOTH directions: without it this
    // module's own prose naming the encoders reports phantom offenders, and a call
    // commented out rather than deleted keeps the sweep green.
    const stripComments = (src: string): string =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        // ~5MB of generated data-as-code that can never reference a function.
        if (name === 'i18n.resolved.generated') continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(full);
      }
      return out;
    };
    const posixRel = (f: string) => relative(repoRoot, f).replaceAll('\\', '/');
    // Name-based, not specifier-based: it must catch an import clause, a re-export
    // and `ql.encodeItemLink(...)` off a namespace import alike. The capital E is
    // what keeps the guarded tryEncode* pair from matching.
    const RAW_ENCODER_RE = /\b(?:encodeItemLink|encodeQuestLink)\b/;
    const files = walk(join(repoRoot, 'src'));
    expect(files.length).toBeGreaterThan(200);
    expect(files.map(posixRel)).toContain(QUEST_LINK_FILE);
    const offenders = files
      .map(posixRel)
      .filter(
        (rel) =>
          rel !== QUEST_LINK_FILE &&
          RAW_ENCODER_RE.test(stripComments(readFileSync(join(repoRoot, rel), 'utf8'))),
      )
      .sort();
    expect(
      offenders,
      'use tryEncodeItemLink / tryEncodeQuestLink instead: the raw encoders skip the id\n' +
        'charset check and ship literal "[[i:...]]" source text to the player',
    ).toEqual([]);

    // Teeth: a regex typo here would make the sweep vacuously green.
    expect(RAW_ENCODER_RE.test("import { encodeItemLink } from './quest_link';")).toBe(true);
    expect(RAW_ENCODER_RE.test('return ql.encodeQuestLink(questId);')).toBe(true);
    expect(RAW_ENCODER_RE.test('const token = tryEncodeItemLink(itemId);')).toBe(false);
    expect(RAW_ENCODER_RE.test(stripComments('// never call encodeItemLink here'))).toBe(false);
    expect(RAW_ENCODER_RE.test(stripComments('const t = encodeItemLink(id); // raw'))).toBe(true);
    expect(stripComments("const url = 'https://example.com/a';")).toContain('https://');
  });
});
