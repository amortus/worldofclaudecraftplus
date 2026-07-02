import type { Role, SavedLoadout, TalentAllocation } from './sim/content/talents';
import type { GuildLeaderboardPage, LeaderboardPage } from './sim/leaderboard_page';
import type { Ante, LootTier, PickAction, VisibleCell } from './sim/lockpick';
import type { MarketQuery } from './sim/market_query';
import type { ResolvedAbility } from './sim/sim';
import {
  type ArenaCombatant,
  type ArenaFormat,
  type ArenaStanding,
  type DelveObjectiveState,
  type Entity,
  type EquipSlot,
  type InvSlot,
  type LootRollChoice,
  type LootRollPrompt,
  type MasterLootSettings,
  type MasterLootThreshold,
  type MoveInput,
  OVERHEAD_EMOTE_IDS,
  type OverheadEmoteId,
  type PetMode,
  type PlayerClass,
  type QuestProgress,
  type QuestState,
  type ResourceType,
} from './sim/types';

export type { GuildLeaderboardPage, LeaderboardPage } from './sim/leaderboard_page';

export interface PartyMemberInfo {
  pid: number;
  name: string;
  cls: PlayerClass;
  level: number;
  hp: number;
  mhp: number;
  res: number;
  mres: number;
  rtype: ResourceType | null;
  x: number;
  z: number;
  dead: number;
  inCombat: number;
  group: 1 | 2;
}

export interface PartyInfo {
  leader: number;
  raid: boolean;
  master: MasterLootSettings;
  members: PartyMemberInfo[];
}

export interface TradeOffer {
  items: InvSlot[];
  copper: number;
}

export interface TradeInfo {
  otherPid: number;
  otherName: string;
  myOffer: TradeOffer;
  theirOffer: TradeOffer;
  myAccepted: boolean;
  theirAccepted: boolean;
}

export interface DuelInfo {
  otherPid: number;
  otherName: string;
  state: 'countdown' | 'active';
}

export interface DelveRunInfo {
  delveId: string;
  tierId: string;
  slot: number;
  origin: { x: number; z: number };
  moduleIndex: number;
  moduleCount: number;
  modules: string[];
  objective: DelveObjectiveState;
  affixes: string[];
  completed: boolean;
  exitPortalOpen: boolean;
  /** §7.6: this run rolled Bountiful: the reward chest is a purple Coffer that
   * only yields to a Hard + Premium-ante solve and guarantees a signature rare. */
  bountiful: boolean;
}

// Render-safe projection of an active lockpicking attempt. Only ever holds cells
// inside the fog window, the full lock layout never reaches the client.
export interface LockpickView {
  sessionId: string;
  objectId: number;
  w: number;
  h: number;
  col: number;
  row: number;
  page: number;
  pageCount: number;
  tries: number;
  triesTotal: number;
  lootTier: LootTier;
  allowed: Exclude<PickAction, 'abort'>[];
  visible: VisibleCell[];
  // Per-step budget (ms) for the server-authoritative clock, or null for no
  // clock. The HUD renders a countdown from this; it never enforces it.
  stepTimeoutMs: number | null;
}

export interface DelveCompanionInfo {
  companionId: string;
  entityId: number;
  rank: number;
  hp: number;
  maxHp: number;
}

export interface DelveDailyInfo {
  date: string;
  firstClearXp: string[];
  markClears: number;
}

// A Marks-vendor (Brother Halven) shop entry resolved against the player's clears:
// the static price/item plus its unlock state and a presentation breakdown of the
// gate, so the shop tab can show why a locked offer is locked. Structurally matches
// the sim's `DelveShopOffer`; both Sim and ClientWorld return that here.
export interface DelveShopOfferView {
  itemId: string;
  marks: number;
  unlocked: boolean;
  requiresHeroicClear: boolean;
  requiresClears: number; // >0 for a `clears:N` gate; 0 otherwise
}

export const OVERHEAD_EMOTES = [
  { id: 'wave', label: 'Wave' },
  { id: 'laugh', label: 'LOL' },
  { id: 'question', label: 'Bro?' },
  { id: 'cheer', label: 'Cheer' },
  { id: 'dance', label: 'Dance' },
  { id: 'point', label: 'Point' },
  { id: 'flex', label: 'Flex' },
  { id: 'salute', label: 'Salute' },
  { id: 'cry', label: 'Cry' },
  { id: 'bow', label: 'Bow' },
  { id: 'clap', label: 'Clap' },
  { id: 'roar', label: 'Roar' },
  { id: 'kneel', label: 'Kneel' },
] as const satisfies readonly { id: OverheadEmoteId; label: string }[];

export type { OverheadEmoteId };

export function isOverheadEmoteId(value: unknown): value is OverheadEmoteId {
  return typeof value === 'string' && (OVERHEAD_EMOTE_IDS as readonly string[]).includes(value);
}

// Persistent social state, mirrored from the server's SocialService. Mirrors
// server/social.ts shapes; kept here so the HUD has no server-side imports.
export type PresenceStatus = 'online' | 'combat' | 'dungeon' | 'dead';
export type GuildRank = 'leader' | 'officer' | 'member';

export interface FriendInfo {
  id: number;
  name: string;
  cls: string;
  level: number;
  realm: string;
  online: boolean;
  zone?: string;
  status?: PresenceStatus;
  // live world position of an online character, for plotting on the map
  x?: number;
  z?: number;
}

export interface GuildMemberInfo extends FriendInfo {
  rank: GuildRank;
}

export interface GuildInfo {
  id: number;
  name: string;
  rank: GuildRank;
  members: GuildMemberInfo[];
}

export interface SocialInfo {
  friends: FriendInfo[];
  blocks: { id: number; name: string }[];
  guild: GuildInfo | null;
}

export interface CharacterSearchResult {
  name: string;
  cls: string;
  level: number;
}

// One ranked row of the lifetime-XP leaderboard (Max-Level XP Overflow). Always
// computed server-side; the client only displays it.
export interface LeaderboardEntry {
  rank: number;
  name: string;
  cls: PlayerClass;
  level: number;
  virtualLevel: number;
  lifetimeXp: number;
  prestigeRank: number;
  realm?: string; // present on the global (cross-realm) home-page board
}

// One ranked row of the GUILD high-score board. A guild's score is the SUM of
// every member's lifetimeXp; memberCount and topLevel are shown alongside. Like
// LeaderboardEntry it is always computed server-side (guilds live only in the
// server social DB, never in the deterministic sim), so the offline Sim ranks no
// guilds and the client only displays what the server ranked.
export interface GuildLeaderboardEntry {
  rank: number;
  name: string;
  memberCount: number;
  totalLifetimeXp: number;
  topLevel: number;
  realm?: string; // present on the global (cross-realm) board
}

export type { ArenaCombatant, ArenaFormat, ArenaStanding };

export interface ArenaLadderEntry {
  pid: number;
  name: string;
  cls: PlayerClass;
  rating: number;
  wins: number;
  losses: number;
}

// Live 2v2 Fiesta state for the local player, polled by the HUD each frame.
export interface FiestaAugmentOffer {
  tier: 'silver' | 'gold' | 'prismatic';
  wave: number;
  choices: string[]; // augment ids; localized + described client-side
}
// One combatant's line on the scoreboard.
export interface FiestaScoreboardPlayer {
  pid: number;
  name: string;
  cls: PlayerClass;
  kills: number;
  down: boolean; // currently benched, awaiting respawn
  me: boolean;
}

// A ring power-up as the renderer/HUD sees it.
export interface FiestaPowerupView {
  id: number;
  defId: string; // POWERUPS id (localized client-side)
  x: number;
  z: number;
  state: 'spawning' | 'ready';
  frac: number; // spawning: telegraph progress 0..1; ready: lifetime remaining 0..1
  color: number; // orb/telegraph colour (hex)
}

export interface FiestaMatchInfo {
  team: 'A' | 'B';
  scoreA: number;
  scoreB: number;
  myScore: number; // my team's tally
  theirScore: number;
  scoreLimit: number;
  wave: number;
  totalWaves: number;
  // hazard ring, in WORLD coordinates so the renderer can draw it directly
  ring: { cx: number; cz: number; radius: number };
  down: boolean; // am I currently benched, awaiting respawn
  respawnIn: number; // whole seconds until I revive (0 if alive)
  augments: string[]; // augment ids I have locked in this bout
  offer: FiestaAugmentOffer | null; // a pending pick, if any
  augmentPending: number; // queued offers awaiting my next death (indicator)
  teamA: FiestaScoreboardPlayer[];
  teamB: FiestaScoreboardPlayer[];
  powerups: FiestaPowerupView[];
}

export interface ArenaInfo {
  // Backwards-compatible view of the currently selected/queued/matched bracket.
  rating: number;
  wins: number;
  losses: number;
  standings: Record<ArenaFormat, ArenaStanding>;
  format: ArenaFormat | null;
  queued: boolean;
  queueSize: number;
  // present only while in a match
  match: {
    format: ArenaFormat;
    state: 'countdown' | 'active' | 'over';
    oppName: string;
    oppClass: PlayerClass;
    oppLevel: number;
    oppPid: number;
    allies: ArenaCombatant[];
    enemies: ArenaCombatant[];
    returnIn?: number; // whole seconds left in the post-bout aftermath ('over')
    // present only for the 2v2 Fiesta party mode
    fiesta?: FiestaMatchInfo;
  } | null;
  // Backwards-compatible live ladder for the currently selected bracket.
  ladder: ArenaLadderEntry[];
  // live standings of rated players currently online, best first, by bracket
  ladders: Record<ArenaFormat, ArenaLadderEntry[]>;
}

// ---------------------------------------------------------------------------
// The World Market (the Merchant's auction house). Listings are global and
// shared by every player; collections are the per-player gold + items waiting
// to be picked up (sale proceeds, expired/returned listings).
// ---------------------------------------------------------------------------

export interface MarketListingView {
  id: number;
  sellerName: string;
  itemId: string;
  count: number;
  price: number; // total copper buyout for the whole stack
  mine: boolean; // the viewer is the seller (offer them Cancel, not Buy)
  house: boolean; // the Merchant's own standing stock
}

export interface MarketInfo {
  // The viewer's own listings (always wired, for reclaim) followed by ONE page of
  // other sellers' listings matching the active query. The server filters + paginates
  // authoritatively, so paging walks the whole market, not just a single wire window.
  listings: MarketListingView[];
  totalCount: number; // all listings matching the active filter (mine + others)
  filter: string; // the active search string (echoed back from the server)
  page: number; // current browse page (of other sellers' listings), 0-based
  pageCount: number; // total browse pages of other sellers' listings (>= 1)
  collectionCopper: number; // proceeds waiting to be collected
  collectionItems: InvSlot[]; // returned/expired items waiting to be collected
  cutPct: number; // the Merchant's cut on a sale, as a percentage
  maxListings: number; // per-seller active-listing cap
  myListingCount: number; // how many active listings the viewer already has
}

export interface AccountCosmetics {
  completedQuestIds: string[];
  mechChromaIds: string[];
}

// One raid's lockout as projected to the HUD: the dungeon id plus the time left
// until it unlocks. The seam only ever surfaces still-locked raids.
export interface RaidLockout {
  id: string;
  msRemaining: number;
}

// The surface the renderer + HUD need from a game world. The offline `Sim`
// satisfies this structurally; the online `ClientWorld` implements it by
// mirroring server snapshots and sending commands over the socket.
export interface IWorld {
  cfg: { seed: number; playerClass: PlayerClass };
  entities: Map<number, Entity>;
  /** O(cells_in_radius) spatial query over known entities. Backed by SpatialGrid in ClientWorld. */
  entitiesNearby(x: number, z: number, radius: number, fn: (e: Entity, d2: number) => void): void;
  playerId: number;
  player: Entity;
  moveInput: MoveInput;
  inventory: InvSlot[];
  vendorBuyback: InvSlot[];
  equipment: Partial<Record<EquipSlot, string>>;
  accountCosmetics: AccountCosmetics;
  copper: number;
  xp: number;
  // Post-cap progression (Max-Level XP Overflow). All server-authoritative;
  // the client renders these as-is and derives virtual level from lifetimeXp.
  lifetimeXp: number;
  prestigeRank: number;
  unlockedMilestones: string[];
  // Classic Rested XP pool (inn-rested kill-XP bonus); 0 when not rested.
  restedXp: number;
  known: ResolvedAbility[];
  questLog: Map<string, QuestProgress>;
  questsDone: Set<string>;
  /** Faction reputation: factionId -> points (relative to Neutral=0). */
  reputation: Record<string, number>;
  questState(questId: string): QuestState;
  castAbility(abilityId: string): void;
  castAbilityBySlot(slot: number): void;
  targetEntity(id: number | null): void;
  tabTarget(): void;
  targetNearestFriendly(): void;
  friendlyTabTarget(): void;
  startAutoAttack(): void;
  stopAutoAttack(): void;
  interact(): void;
  lootCorpse(id: number): void;
  submitLootRoll(rollId: number, choice: LootRollChoice): void;
  // Open need-greed rolls the local player may still answer; lets the HUD
  // reconcile prompts from authoritative state so a missed event is recoverable.
  activeLootRolls(): LootRollPrompt[];
  pickUpObject(id: number): void;
  acceptQuest(questId: string): void;
  turnInQuest(questId: string): void;
  reportTelemetry(kind: string, data: Record<string, number>): void;
  abandonQuest(questId: string): void;
  acceptLinkedQuest(questId: string, fromPid: number): void;
  equipItem(itemId: string): void;
  unequipItem(slot: EquipSlot): void;
  useItem(itemId: string): void;
  discardItem(itemId: string, count?: number): void;
  buyItem(npcId: number, itemId: string): void;
  sellItem(itemId: string, count?: number): void;
  // Sell every gray (poor-quality) item in the bags at once while a vendor is open.
  // Quest items and anything flagged noVendorSell are left untouched.
  sellAllJunk(): void;
  buyBackItem(itemId: string): void;
  changeSkin(skin: number, catalog?: 'class' | 'mech'): void;
  // Lock in a skin from the cosmetic skin-select event overlay. The server
  // re-validates the choice against the rank it rolled (skinEvent) and consumes
  // the event token; the offline Sim resolves it directly.
  claimEventSkin(skin: number): void;
  unequipMechChroma(chromaId: string): void;
  releaseSpirit(): void;
  chat(text: string): void;
  playEmote(emoteId: OverheadEmoteId): void;
  abandonPet(): void;
  renamePet(name: string): void;
  revivePet(): void;
  petAttack(): void;
  petTaunt(): void;
  setPetAutoTaunt(enabled: boolean): void;
  feedPet(itemId: string): void;
  healPet(): void;
  setPetMode(mode: PetMode): void;
  // social systems
  partyInfo: PartyInfo | null;
  tradeInfo: TradeInfo | null;
  duelInfo: DuelInfo | null;
  arenaInfo: ArenaInfo | null;
  marketInfo: MarketInfo | null;
  partyInvite(targetPid: number): void;
  partyAccept(): void;
  partyDecline(): void;
  partyLeave(): void;
  partyKick(targetPid: number): void;
  // Leader-only handoff: pass leadership to another member (roster unchanged).
  partyPromote(targetPid: number): void;
  convertPartyToRaid(): void;
  convertRaidToParty(): void;
  moveRaidMember(targetPid: number, group: 1 | 2): void;
  // master loot (leader-only setter; master looter assigns threshold drops)
  setPartyLootMaster(enabled: boolean, looter: number, threshold: MasterLootThreshold): void;
  // The master looter's checked subset: 1 pid grants directly, 2+ opens a roll.
  assignMasterLoot(rollId: number, targetPids: number[]): void;
  // raid/target markers (party-scoped): markerId 0..7, null = no mark
  markerFor(entityId: number): number | null;
  setMarker(entityId: number, markerId: number): void;
  clearMarker(entityId: number): void;
  tradeRequest(targetPid: number): void;
  tradeAccept(): void;
  tradeSetOffer(items: InvSlot[], copper: number): void;
  tradeConfirm(): void;
  tradeCancel(): void;
  duelRequest(targetPid: number): void;
  duelAccept(): void;
  duelDecline(): void;
  // the realm (world/shard) this character lives on; '' in offline play
  realm: string;
  // persistent social: friends, ignore/block, guilds (online play only)
  socialInfo: SocialInfo | null;
  friendAdd(name: string): void;
  friendRemove(name: string): void;
  blockAdd(name: string): void;
  blockRemove(name: string): void;
  guildCreate(name: string): void;
  guildInvite(name: string): void;
  guildAccept(): void;
  guildDecline(): void;
  guildLeave(): void;
  guildKick(name: string): void;
  guildPromote(name: string): void;
  guildDemote(name: string): void;
  guildTransfer(name: string): void;
  guildDisband(): void;
  // realm-scoped username typeahead for friend/ignore/guild search
  searchCharacters(query: string): Promise<CharacterSearchResult[]>;
  arenaQueueJoin(format?: ArenaFormat): void;
  arenaQueueLeave(): void;
  // 2v2 Fiesta: lock in one of the augments currently on offer
  arenaAugmentPick(augmentId: string): void;
  // World Market. The browse query (search + type/subtype/rarity filters + page) is
  // sent to the server, which filters and paginates; marketInfo mirrors the result.
  marketSearch(query: MarketQuery): void;
  marketList(itemId: string, count: number, price: number): void;
  marketBuy(listingId: number): void;
  marketCancel(listingId: number): void;
  marketCollect(): void;
  enterDungeon(dungeonId: string): void;
  leaveDungeon(): void;
  enterDelve(delveId: string, tierId: string): void;
  leaveDelve(): void;
  delveInteract(objectId: number): void;
  companionUpgrade(companionId: string): void;
  delveBuyShopItem(delveId: string, itemId: string): void;
  // Brother Halven's Marks-vendor stock for a delve, resolved against the viewer's
  // clears (unlock state per entry). The buy itself is server-authoritative.
  delveShopOffers(delveId: string): DelveShopOfferView[];
  lockpickState: LockpickView | null;
  lockpickEngage(objectId: number, ante: Ante): void;
  lockpickAction(action: PickAction): void;
  lockpickAbort(): void;
  collectDelveChestLoot(chestId: number): void;
  delveRun: DelveRunInfo | null;
  companionState: DelveCompanionInfo | null;
  delveMarks: number;
  companionUpgrades: Record<string, number>;
  delveDaily: DelveDailyInfo;
  // Still-locked raids for the local player (unlock countdown in ms), driving the
  // minimap raid-lockout badge + panel. Empty when nothing is locked.
  raidLockouts(): RaidLockout[];
  // Post-cap progression: the realm-scoped lifetime-XP leaderboard, and the
  // opt-in cosmetic prestige action. Paged server-side (a realm can hold far
  // more than one page of max-level players); page is 0-based.
  leaderboard(page?: number, pageSize?: number): Promise<LeaderboardPage>;
  // The realm-scoped guild high-score board (guilds ranked by summed member
  // lifetime XP), paged server-side the same way as the player board. Guilds are
  // a server-only social system, so the offline Sim resolves an empty page.
  guildLeaderboard(page?: number, pageSize?: number): Promise<GuildLeaderboardPage>;
  prestige(): void;
  // Talents & Specializations. State is server-authoritative; the client stages
  // edits locally and commits via applyTalents (the server re-validates).
  talents: TalentAllocation;
  talentSpec: string | null;
  talentRole: Role | null;
  loadouts: SavedLoadout[];
  activeLoadout: number;
  talentPoints(): { total: number; spent: number };
  applyTalents(alloc: TalentAllocation): void;
  respec(): void;
  setSpec(specId: string | null): void;
  saveLoadout(name: string, bar: (string | null)[], alloc?: TalentAllocation): void;
  switchLoadout(index: number): void;
  deleteLoadout(index: number): void;
}
