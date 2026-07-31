// i18n source catalog - in-game HUD chrome strings that were previously hard-coded
// at their call sites (emote wheel/editor, swing timer, rest indicator, mobile
// controls, minimap/compass/clock widgets, DPS/HPS meters formatting). English
// values only; the 13 locale translations live in src/ui/i18n.locales/<lang>.ts
// (the runtime-authoritative overlays), filled by the maintainer at release.
//
// Assembled into `en` by ./index.ts under the `hudChrome` namespace. Kept as its
// own module (no per-locale blocks) so new chrome keys are an English-only add.

export const hudChromeStrings = {
  // Moderator spectate banner (shown while an admin observes another player).
  spectate: {
    banner: 'Spectating {name}',
  },
  // Auto-reconnect banner (ui/reconnect_overlay.ts): shown while ClientWorld
  // retries a dropped connection; hidden again once the rejoin lands.
  reconnect: {
    attempt: 'Connection lost. Reconnecting... attempt {attempt}/{max}',
    retryIn: 'Retrying in {seconds}s',
    now: 'Reconnecting...',
    restored: 'Connection restored.',
  },
  // Overhead emote display names (wheel tooltips/labels, editor items, overhead
  // bubble text). Source ids/order mirror OVERHEAD_EMOTES in world_api.ts.
  emotes: {
    wave: 'Wave',
    laugh: 'LOL',
    question: 'Bro?',
    cheer: 'Cheer',
    dance: 'Dance',
    point: 'Point',
    flex: 'Flex',
    salute: 'Salute',
    cry: 'Cry',
    bow: 'Bow',
    clap: 'Clap',
    roar: 'Roar',
    kneel: 'Kneel',
  },
  emoteWheel: {
    edit: 'Edit',
    label: 'Emotes',
  },
  emoteEditor: {
    title: 'Emotes',
    done: 'Done',
  },
  theme: {
    preset: 'UI Theme',
    customColors: 'Custom Colors',
    reset: 'Reset',
    presets: {
      classic: 'Classic Gold',
      midnight: 'Midnight',
      parchment: 'Parchment',
      highContrast: 'High Contrast',
    },
    knob: {
      accent: 'Accent',
      border: 'Border',
      panel: 'Frame',
      text: 'Text',
      textMuted: 'Muted Text',
      hp: 'Health',
      mana: 'Mana',
      rage: 'Rage',
      energy: 'Energy',
    },
  },
  // On-screen quest tracker. The "(N)" count shown beside the header while the
  // tracker is collapsed (the number is spliced in via formatNumber), plus the
  // header button's state-aware hover/title hint (Collapse while expanded,
  // Expand while collapsed).
  questTracker: {
    count: '({count})',
    collapseHint: 'Collapse quest tracker',
    expandHint: 'Expand quest tracker',
    trackHint: 'Track quest: mark its objectives on the map and show a waypoint arrow',
    untrackHint: 'Stop tracking this quest',
  },
  // Distance readout under the on-screen quest waypoint arrow ({n} = whole units).
  questArrow: {
    distance: '{n} m',
  },
  // Character window tabs + the Reputation panel (faction standing, WoW-style).
  character: {
    tabsAria: 'Character window tabs',
    tabOverview: 'Character',
    tabReputation: 'Reputation',
  },
  reputation: {
    empty: 'You have no reputations yet.',
    maxed: 'Maxed',
    requires: 'Requires {standing} with {faction}',
    lockedHint: 'You need a higher reputation to buy this.',
    standing: {
      hated: 'Hated',
      hostile: 'Hostile',
      unfriendly: 'Unfriendly',
      neutral: 'Neutral',
      friendly: 'Friendly',
      honored: 'Honored',
      revered: 'Revered',
      exalted: 'Exalted',
    },
    faction: {
      dawnOfClaude: 'Dawn of Claude',
    },
  },
  chatTimestamps: {
    show: 'Show Chat Timestamps',
    format: 'Timestamp Format',
    clock12h: '12-hour',
    clock24h: '24-hour',
    note: 'Prefixes each new chat line with the time it arrived, e.g. [14:32]. Only affects messages received while the option is on.',
  },
  chatWindow: {
    move: 'Drag to move the chat window',
    resize: 'Drag to resize the chat window',
    reset: 'Reset Chat Window',
    resetAction: 'Reset',
    note: 'Drag the chat tab strip to move the window, or the corner grip to resize it. Reset returns it to the default position and size.',
  },
  swing: {
    ready: 'Swing',
    seconds: '{seconds}s',
  },
  // Combat-log lines that live here rather than in the tsc-enforced `hud` domain.
  // auraGainOther is the beneficial counterpart of hud.combat.auraAfflicted: a
  // non-player unit gaining a BUFF is not afflicted by anything.
  combat: {
    auraGainOther: '{target} gains {name}.',
  },
  rest: {
    resting: 'Resting',
  },
  // The Spell Power / Attack Power contribution called out on an ability tooltip,
  // e.g. "66 to 74 (+29)". Locale-neutral by design: punctuation plus a formatted
  // number, no words, so it needs no per-locale translation.
  abilityScaling: {
    bonus: '(+{value})',
  },
  // On-screen / mobile control labels and their accessible names. char/bags/music
  // reuse existing keys (hud.keybinds.actions.*, hud.options.music) at the call site.
  mobile: {
    autorun: 'Autorun',
    jump: 'Jump',
    leaderboard: 'Ranks',
    // Short captions for the two More-menu buttons the HUD owns. Each panel's
    // own title (hudChrome.professions.panelTitle / hudChrome.deeds.panelTitle)
    // stays the accessible name; these only have to fit a third of the tray.
    skills: 'Skills',
    deeds: 'Deeds',
    nameplates: 'Names',
    haptics: 'Haptics',
    hapticsOff: 'Haptics Off',
    toggleHaptics: 'Toggle haptics',
  },
  // New-adventurer tutorial copy for the touch interface. The default tutorial
  // bodies (hud.tutorial.*Body) reference keyboard/mouse ("W/A/S/D", "press F"),
  // which is wrong on a phone whose only controls are the on-screen sticks and
  // the Use / More action buttons. These touch variants are swapped in when the
  // mobile-touch interface is active (see tutorial_copy.ts). English-only add, so
  // they live here in the hud_chrome domain rather than the constrained `hud` one.
  tutorial: {
    // "movement stick", not "left stick": left-handed mode swaps the two thumb
    // sticks (and the stick can float to wherever you touch), so a fixed side is
    // wrong for that layout.
    moveBodyTouch:
      'Use the movement stick to move and drag the screen to look around. Take a few steps to begin.',
    talkBodyTouch:
      'Stand close to Marshal Redbrook and tap the Use button to speak, then accept his task.',
    returnBodyTouch:
      'Your task is done. Return to Marshal Redbrook and tap the Use button to turn it in.',
    doneBodyTouch:
      'You have the basics, {name}. The Vale is yours to explore. Tap More, then Quests, to review your quest log anytime. Good hunting.',
  },
  // Minimap / compass / clock / coordinate widget tooltips and accessible names.
  widgets: {
    clockTitle: 'Local time - click to toggle 12/24-hour',
    worldCoordinates: 'World coordinates',
    coordinates: 'Coordinates',
    heading: 'Heading',
    minimapZoom: 'Minimap zoom',
  },
  // High-score board chrome: the Players / Guilds tab bar labels, the guild-board
  // column headers, and the guild-tab empty state. (The shared, translated column
  // labels rank/name/level/etc. live under game.leaderboard.)
  leaderboard: {
    // High-score board tabs: the per-character board and the per-guild board.
    tabsLabel: 'High-score boards',
    tabPlayers: 'Players',
    tabGuilds: 'Guilds',
    // Guild-board column headers + the guild-tab empty state.
    guildName: 'Guild',
    members: 'Members',
    topLevel: 'Top',
    guildXp: 'Total XP',
    guildEmpty: 'No ranked guilds yet.',
  },
  // Raid-lockout badge on the minimap rim + its hover/tap panel: the title, the
  // accessible label, the "all ready" line, and the unlock-countdown templates
  // (digits run through formatNumber; the units reorder per locale).
  raidLockout: {
    title: 'Raid Lockouts',
    allReady: 'All raids ready',
    daysHours: '{d}d {h}h',
    hoursMinutes: '{h}h {m}m',
    minutes: '{m}m',
    lessThanMinute: '<1m',
    // Entry-denied toast, enriched client-side with the live unlock countdown
    // ({raid} = the localized raid name, {time} = the formatted countdown).
    lockedToast: 'You are locked to {raid}. Unlocks in {time}.',
  },
  // Eight-point compass abbreviations as drawn on the heading strip. Each locale
  // overrides with its own established compass abbreviations (e.g. West = "O" in
  // Spanish, "O" in French/Italian/Portuguese, "З" in Russian).
  compass: {
    N: 'N',
    NE: 'NE',
    E: 'E',
    SE: 'SE',
    S: 'S',
    SW: 'SW',
    W: 'W',
    NW: 'NW',
  },
  // DPS/HPS/threat meter number + unit formatting (the digits themselves go
  // through formatNumber; these carry the localizable unit/parenthesization).
  meters: {
    perSecond: '{value}/s',
    perSecondRow: '{total} ({rate})',
    minutesSeconds: '{m}m {s}s',
    seconds: '{s}s',
  },
  // Key Bindings panel action labels that the in-file BIND_ACTION_LABEL_KEYS map
  // (hud.ts) routes through t(). Kept here (not the constrained `hud` catalog
  // domain) so they are an English-only add.
  keybinds: {
    emoteWheel: 'Emote Wheel',
    targetFriendly: 'Target Nearest Friendly',
    targetFriendlyNext: 'Cycle Friendly Target',
  },
  // Click-to-move mouse-button toggle labels (Key Bindings panel). The button id
  // 0/2 maps to these at the HUD render boundary.
  options: {
    clickMoveLeft: 'Left Click',
    clickMoveRight: 'Right Click',
    // Adaptive browser-effects tier control (Graphics panel). Auto detects the
    // browser engine/version + device; the rest pin the CSS-effects tier.
    fpsLimit: 'FPS Limit',
    fpsLimitAuto: 'Auto',
    fpsLimit30: '30 FPS',
    fpsLimit60: '60 FPS',
    fpsLimitOff: 'Unlimited',
    browserEffects: 'Browser Effects',
    browserEffectsAuto: 'Auto',
    browserEffectsFull: 'Full',
    browserEffectsReduced: 'Reduced',
    browserEffectsMinimal: 'Minimal',
    browserEffectsNote:
      'Auto tones down heavy CSS effects (blur, glow, background motion) based on your browser and device. Lower it manually if the interface feels sluggish.',
    // Interface Mode control (Graphics panel): desktop keyboard/mouse vs the
    // on-screen touch controls. Auto detects the device; the rest force one.
    interfaceMode: 'Interface Mode',
    interfaceModeAuto: 'Auto',
    interfaceModeDesktop: 'Desktop',
    interfaceModeTouch: 'Touch',
    interfaceModeNote:
      'Auto picks desktop or touch controls from your device. Choose Desktop to force keyboard and mouse (useful on a tablet with a keyboard), or Touch for the on-screen controls.',
    // Audio panel toggle for the per-footfall step clips (off by default).
    footstepSounds: 'Footstep Sounds',
    // Toggle for the OSRS-style click-feedback marker: entity targets and
    // click-to-move destinations (on by default).
    clickFeedback: 'Click Marker',
    // Keybind panel toggle: pointer-lock the canvas during a camera drag so the
    // cursor cannot leave the window (hit the screen edge or slip to a second
    // monitor) while rotating. On by default.
    lockCursorOnRotate: 'Lock Cursor While Rotating',
    keybindHelpLockCursorOnRotate:
      'Keeps the mouse cursor inside the window while you drag to rotate the camera, so it cannot reach the screen edge or move to another monitor. Turn off if you prefer a free cursor.',
    showWalletOnCharacterScreen: 'Show Wallet on Character Screen',
    showWalletOnPlayerCard: 'Show Wallet on Player Card',
    // Interface panel: global HUD zoom slider, and the mirror of the landing
    // page's high-contrast backdrop toggle.
    uiScale: 'UI Scale',
    highContrastBackground: 'High-Contrast Background',
    // Interface panel toggle: also engage auto-attack when using an offensive
    // ability, so white swings start without a separate Attack press (on by default).
    startAttackOnAbility: 'Auto-Attack on Ability Use',
  },
  // Controller / gamepad options panel (Options > Controller). Player-facing
  // chrome, so every label is a key here; the live numbers run through
  // formatNumber. The button names themselves (A / LB / D-pad, etc.) stay as
  // hardware glyphs in gamepad_map and need no translation.
  controller: {
    title: 'Controller',
    enable: 'Enable Controller',
    invertY: 'Invert Camera (Y)',
    deadzone: 'Stick Deadzone',
    cameraSpeed: 'Camera Speed',
    vibration: 'Vibration',
    buttons: 'Button Layout',
    resetButtons: 'Reset Button Layout',
    menuAction: 'Game Menu',
    help: 'Left stick moves, right stick looks. Open a window to use the on-screen pointer.',
  },
  // AdMob rewarded-ad and interstitial UI strings. Shown only in native
  // (Android/iOS) builds when VITE_NATIVE_APP=1.
  ads: {
    watchForRevive: "Watch a short ad to revive here",
    reviveReady: "Revive Here!",
    watchForBoost: "Watch a short ad for an XP boost",
    earnedRevive: "Reviving in place...",
    earnedBoost: "XP boost active! Kill XP doubled for the next 5 bubbles.",
    adNotAvailable: "No ad available right now.",
    boostOfferTitle: "You cleared the dungeon!",
    skip: "No thanks",
  },
  // Performance overlay (the customizable in-game stats panel + its Options
  // sub-view). Player-facing, so every label is a key here; the live numbers in
  // the overlay run through formatNumber and these unit strings. Distinct from
  // the dev `?perf` diagnostic, which stays English like console.*.
  perf: {
    title: 'Performance Overlay',
    enable: 'Show Performance Overlay',
    description: 'Choose which stats to show, where the overlay sits, and how it looks.',
    sectionPosition: 'Position',
    sectionAppearance: 'Appearance',
    sectionStats: 'Stats',
    positionX: 'Horizontal',
    positionY: 'Vertical',
    resetPosition: 'Reset Position',
    dragHint: 'Drag the overlay to move it, or use the sliders below.',
    opacity: 'Background Opacity',
    solidBg: 'Solid Background',
    fontScale: 'Text Size',
    textColor: 'Text Color',
    bgColor: 'Background Color',
    colorTheme: 'Color Theme',
    graph: 'Frame-Time Graph',
    thresholds: 'Color-Coded Warnings',
    presetsLabel: 'Quick Presets',
    presetMinimal: 'Minimal',
    presetStandard: 'Standard',
    presetEverything: 'Everything',
    // Category subheads the Stats toggles are grouped under (mirrors the metric
    // registry's groups: frame/timing, network, renderer, system).
    groups: {
      frame: 'Frame & Timing',
      network: 'Network',
      renderer: 'Renderer',
      system: 'System',
      input: 'Input',
    },
    // Short metric labels shown in the overlay's left column and the Stats toggles.
    labels: {
      fps: 'FPS',
      frameTime: 'Frame Time',
      fps1Low: '1% Low',
      fps01Low: '0.1% Low',
      ping: 'Ping',
      jitter: 'Jitter',
      snapshot: 'Snapshot Rate',
      connection: 'Connection',
      drawCalls: 'Draw Calls',
      triangles: 'Triangles',
      geometries: 'Geometries',
      textures: 'Textures',
      programs: 'Shaders',
      renderScale: 'Render Scale',
      gpu: 'GPU',
      memory: 'Memory',
      hitches: 'Hitches',
      entities: 'Entities',
      apm: 'APM',
    },
    // Color-theme preset names (also the swatches' accessible names).
    themes: {
      gold: 'Gold',
      frost: 'Frost',
      ember: 'Ember',
      jade: 'Jade',
      crimson: 'Crimson',
      mono: 'Mono',
    },
    // Value units — the digits are spliced in via formatNumber at the call site.
    units: {
      ms: '{value} ms',
      mb: '{value} MB',
      memPair: '{used} / {limit} MB',
      hz: '{value} Hz',
    },
    // Inline status badges shown when the relevant condition is active.
    badges: {
      backgrounded: 'Backgrounded',
      offline: 'Offline',
    },
  },
  playerCard: {
    showWalletBadge: 'Show wallet badge',
  },
  // Landing-page (start screen) accessibility controls.
  landing: {
    // Footer toggle: swap the moving trailer for a static high-contrast backdrop.
    highContrast: 'High Contrast',
    highContrastAria:
      'Toggle high-contrast background: disables the moving trailer so start-screen text stays legible',
  },
  // Character-screen stat tooltips (hover a stat on the C panel). The stat NAMES
  // reuse itemUi.stats.*; only these descriptions / effect lines / notes are new.
  // The breakdown numbers are recomputed live from the player's current stats
  // (src/ui/stat_tooltip.ts) and spliced in via formatNumber at the call site, so
  // the {value}/{level} placeholders carry no baked formatting.
  statInfo: {
    // Header above a primary stat's live breakdown, e.g. "From your 22 Agility:".
    fromYour: 'From your {value} {stat}:',
    // Stat NAMES otherwise reuse itemUi.stats.*; Spell Power is a character-sheet
    // only stat (no item carries a labeled Spell Power line), so its label lives
    // here in the English-only HUD-chrome domain rather than the fully-translated
    // item-stats catalog.
    names: {
      spellPower: 'Spell Power',
    },
    desc: {
      str: 'Increases your attack power, so your weapon strikes land harder.',
      agi: 'Sharpens your reflexes and aim, improving several of your combat stats.',
      sta: 'Toughens your body, raising your maximum health and how quickly you recover health while resting.',
      int: "Expands a spellcaster's mana pool and improves their chance to land a spell critical strike.",
      spi: "Quickens how fast a spellcaster's mana returns while resting, out of combat.",
      armor:
        'Softens incoming physical blows. The reduction is greater against lower-level attackers and is capped at 75%.',
      attackPower: 'Powers your weapon attacks. Every 14 attack power adds 1 damage per second.',
      spellPower:
        'Increases the damage of your spells and the strength of your heals. Each point of Intellect grants a little Spell Power, on top of any from gear or buffs.',
      dps: "Your estimated weapon damage per second, combining your weapon's damage and speed with your attack power.",
      critChance: 'Your chance for an attack to strike critically, dealing double damage.',
      dodge: 'Your chance to completely avoid an incoming melee attack, taking no damage.',
    },
    // One line per derived effect a stat contributes. {value} is a live number.
    effects: {
      attackPower: '+{value} Attack Power',
      rangedAttackPower: '+{value} Ranged Attack Power',
      critPct: '+{value}% Critical Strike',
      dodgePct: '+{value}% Dodge',
      armor: '+{value} Armor',
      maxHealth: '+{value} Maximum Health',
      maxMana: '+{value} Maximum Mana',
      spellCritPct: '+{value}% Spell Critical Strike',
      healthRegen: 'About {value} health every 5 sec while resting',
      manaRegen: 'About {value} mana every 5 sec while resting',
      damageReduction: 'Damage reduction against a level {level} attacker: {value}%',
      dpsFromAp: 'Adds {value} damage per second to your attacks',
    },
    notes: {
      minorForClass: 'Of little benefit to your class.',
      baseChance: 'Includes a 5% base chance shared by all adventurers.',
      dpsApprox: 'An estimate, it excludes critical strikes and ability damage.',
    },
    // The upstream "where this stat comes from" breakdown: a header plus one line
    // per origin. Every {value} is a live number; buff lines splice in the active
    // aura's localized name. The talents line gathers everything not itemized
    // above (talent bonuses, item-set bonuses, druid form bonuses) so the lines
    // always add up to the stat shown on the sheet.
    sources: {
      header: 'Made up of:',
      base: 'Base: {value}',
      attributes: 'From your attributes: {value}',
      fromAttribute: 'From {stat}: {value}',
      gear: 'Equipped gear: {value}',
      buff: '{name}: {value}',
      talents: 'Talents and effects: {value}',
    },
  },
  // Default name pre-filled into the Save-Build-As dialog, e.g. "Build 3".
  talents: {
    defaultBuildName: 'Build {n}',
  },
  // One-off chat-log tips shown at HUD bootstrap. The /join command tokens stay
  // literal (they are commands); the surrounding prose localizes.
  tips: {
    joinChannels: 'Tip: type /join world or /join lfg to chat with players across the realm.',
  },
  // Quest-link sharing: the chat-link affordance and its sim-emitted notices
  // (re-localized through the hud-local localizeErrorText/localizeSystemText arms).
  questShare: {
    notShareable: "This quest can't be shared.",
    notInSharerParty: "You must be in {name}'s party to accept that quest.",
    accepted: '{name} accepted your shared quest.',
    dialogTitle: 'Shared Quest',
    viewOnlyHint: "Join the sharer's party to accept this quest.",
    alreadyOn: "You're already on this quest.",
    alreadyDone: "You've already completed this quest.",
    ineligible: "You don't meet the requirements for this quest.",
    noQuestSelected: 'Select a quest in your log to share.',
    linkTitle: 'Shift-click to link this quest in chat.',
  },
  itemShare: {
    linkHint: 'Shift-click to link this item in chat.',
  },
  // CLDR-categorized count strings resolved through tPlural(base, count) in
  // src/ui/i18n.ts: it selects the active locale's cardinal category (one / few /
  // many / other) via Intl.PluralRules and looks up the matching leaf, so e.g.
  // Russian renders the correct 1 / 2-4 / 5+ form instead of a binary one/other.
  // English only ever selects `one`/`other`; `few`/`many` mirror `other` here and
  // carry the real distinct forms only in the locales that need them (ru_RU). The
  // count is auto-supplied as {count}. Keep all four categories present per base.
  plurals: {
    guildMembers: {
      one: 'you are {rank}, {count} member',
      few: 'you are {rank}, {count} members',
      many: 'you are {rank}, {count} members',
      other: 'you are {rank}, {count} members',
    },
    characterCount: {
      one: '{count} character',
      few: '{count} characters',
      many: '{count} characters',
      other: '{count} characters',
    },
    secondsRemaining: {
      one: '{count} second remaining',
      few: '{count} seconds remaining',
      many: '{count} seconds remaining',
      other: '{count} seconds remaining',
    },
    playersOnline: {
      one: 'Who: {count} player online on {realm}.',
      few: 'Who: {count} players online on {realm}.',
      many: 'Who: {count} players online on {realm}.',
      other: 'Who: {count} players online on {realm}.',
    },
    playersMatching: {
      one: 'Who: {count} player matching "{query}" on {realm}.',
      few: 'Who: {count} players matching "{query}" on {realm}.',
      many: 'Who: {count} players matching "{query}" on {realm}.',
      other: 'Who: {count} players matching "{query}" on {realm}.',
    },
  },
  // "Report a Bug" options sub-view (online only). Captures realm/character/
  // position/screenshot plus a free-text description and posts to the server.
  bugReport: {
    menuButton: 'Report a Bug',
    realm: 'Realm',
    character: 'Character',
    position: 'Position',
    unknown: 'Unknown',
    description: 'What went wrong?',
    descriptionPlaceholder: 'Describe the bug: what you did, what you expected, and what happened.',
    includeScreenshot: 'Include Screenshot',
    screenshotAlt: 'Screenshot of the current view attached to this bug report',
    submit: 'Send Report',
    submitted: 'Bug report sent. Thank you!',
    submittedNoShot: 'Bug report sent, but the screenshot was too large to include.',
    describeFirst: 'Please describe the bug before sending.',
    tooLarge: 'That report is too large to send. Try again without the screenshot.',
    rateLimited: "You've sent several reports recently. Please wait a bit before sending another.",
    failed: 'Could not send the bug report. Please try again.',
  },
  // Character window (paperdoll) controls.
  paperdoll: {
    unequipAria: 'Unequip {item}',
    unequipHint: 'Click ×, right-click, or drag to bags to unequip',
  },
  // Item tooltip: the minimum character level needed to equip a piece (classic
  // "Requires Level N"). Shown red when the viewer is below it. {level} runs
  // through formatNumber.
  itemTooltip: {
    requiresLevel: 'Requires Level {level}',
  },
  // Home-page account portal (the logged-in "Account" nav tab). Lives here in the
  // English-only hud_chrome domain so an English-only PR compiles; translations
  // live in the overlays like any other hudChrome.* key.
  account: {
    title: 'Account',
    loggedOutPrompt: 'Log in to manage your account.',
    memberSince: 'Member since {date}',
    sectionSettings: 'Account Settings',
    sectionWallet: '$WOC Wallet',
    sectionCharacters: 'Characters',
    sectionDanger: 'Danger Zone',
    // Change password
    changePassword: 'Change Password',
    currentPassword: 'Current password',
    newPassword: 'New password',
    confirmNewPassword: 'Confirm new password',
    savePassword: 'Update Password',
    passwordChanged: 'Password updated. Other devices have been signed out.',
    errCurrentRequired: 'Enter your current password.',
    errPasswordShort: 'New password must be at least 6 characters.',
    errPasswordLong: 'New password must be at most 128 characters.',
    errPasswordUnchanged: 'New password must be different from the current one.',
    errPasswordConfirm: 'New passwords do not match.',
    // Email
    emailLabel: 'Email (optional)',
    emailHint: 'Used only for account recovery. Use Change Email below to update it.',
    saveEmail: 'Save Email',
    emailSaved: 'Email saved.',
    errEmailInvalid: 'Enter a valid email address.',
    // Server-side (REST) failures, re-localized via main.ts userFacingApiError.
    errCurrentPassword: 'Your current password is incorrect.',
    errUsernameMatch: 'That username does not match your account.',
    errPasswordIncorrect: 'Your password is incorrect.',
    errCharactersOnline: 'Log out all of your characters before deactivating.',
    deactivatedLocked: 'This account has been deactivated. Contact an admin to restore it.',
    // Characters
    charactersSummary: 'Manage your characters and enter the world.',
    charactersCount: 'Characters: {count}',
    goToCharacters: 'View Characters',
    // Wallet
    walletSummary: 'Verify a Solana wallet to show holder flair on your player card.',
    manageWallet: 'Manage Wallet',
    // Deactivate
    deactivate: 'Deactivate Account',
    deactivateWarning:
      'Deactivation locks your account and signs you out everywhere. Contact an admin to restore it. Confirm by re-entering your username and password.',
    confirmUsername: 'Type your username to confirm',
    confirmPassword: 'Password',
    deactivateConfirm: 'Deactivate My Account',
    deactivated: 'Your account has been deactivated.',
    // Log out
    logOut: 'Log Out',
    logOutSummary: 'Sign out of this device.',
    // Security section (two-factor, verified email change, data export).
    sectionSecurity: 'Security',
    // Change email (verified, two-step)
    changeEmailTitle: 'Change Email',
    changeEmailHint:
      'We email a confirmation link to the new address and a notice to the old one. Your email only changes once you open the link.',
    changeEmailNew: 'New email',
    changeEmailSubmit: 'Send Confirmation Link',
    changeEmailSent: 'Check your inbox: open the link we sent to confirm your new email.',
    errEmailUnchanged: 'That is already your email address.',
    // Two-factor (TOTP)
    twoFactorTitle: 'Two-Factor Authentication',
    twoFactorStatusOn: 'Two-factor authentication is ON for your account.',
    twoFactorStatusOff: 'Add an authenticator app for stronger account security.',
    twoFactorSetupBtn: 'Set Up Two-Factor',
    twoFactorBeginHint: 'Enter your password to begin setup.',
    twoFactorBegin: 'Begin Setup',
    twoFactorScanHint:
      'Add this key to your authenticator app (Google Authenticator, Authy, 1Password, and similar), then enter the 6-digit code it shows.',
    twoFactorSecretLabel: 'Setup key',
    twoFactorOpenApp: 'Open in authenticator app',
    twoFactorCodeLabel: '6-digit code',
    twoFactorVerifyBtn: 'Verify and Enable',
    twoFactorEnabledMsg: 'Two-factor authentication is now on.',
    twoFactorRecoveryTitle: 'Save your recovery codes',
    twoFactorRecoveryHint:
      'Each code works once. Store them somewhere safe: they are the only way back in if you lose your authenticator app.',
    twoFactorDownloadCodes: 'Download Codes',
    twoFactorDone: 'Done',
    twoFactorDisableHint:
      'Enter your password to turn two-factor off. Your recovery codes will be discarded.',
    twoFactorDisableBtn: 'Turn Off Two-Factor',
    twoFactorDisabledMsg: 'Two-factor authentication is off.',
    errTwoFactorCode: 'That code is not valid, try again.',
    errTwoFactorState: 'Two-factor setup is not in the expected state. Reload and try again.',
    // Data export (GDPR)
    exportTitle: 'Export My Data',
    exportHint:
      'Download a copy of your account and characters as a JSON file. We also email you a confirmation.',
    exportBtn: 'Download My Data',
    exportDone: 'Your data was downloaded. We emailed you a confirmation.',
    exportFailed: 'Could not export your data. Try again in a moment.',
  },
  // Modular bag filtering controls: the category chips, sort dropdown, and live
  // search above the bag grid, plus the "no items match" empty state.
  bags: {
    filterGroupAria: 'Filter bags by category',
    filterAll: 'All',
    filterWeapon: 'Weapons',
    filterArmor: 'Armor',
    filterConsumable: 'Consumables',
    filterMaterial: 'Materials',
    filterQuest: 'Quest',
    sortAria: 'Sort bag items',
    sortRecent: 'Recent',
    sortQuality: 'Quality',
    sortName: 'Name',
    searchPlaceholder: 'Search items',
    searchAria: 'Search bag items by name',
    noMatch: 'No items match your filters.',
  },
  // Party leadership: the right-click "Promote to Leader" handoff action shown on a
  // party member's context menu to the current leader. Lives in the English-only
  // hud_chrome domain so an English-only PR compiles; the new-leader announcement
  // itself is a sim emit re-localized through localizeSystemText (hud.logs.partyLeader).
  party: {
    promoteLeader: 'Promote to Leader',
  },
  // Master loot: the assignment prompt shown to the master looter (curate panel),
  // the threshold labels, and the sim-emitted log/error/loot lines re-localized
  // through the hud matchers (localizeLootText / localizeSystemText / localizeErrorText).
  // Lives in the English-only hud_chrome domain so an English-only PR compiles.
  masterLoot: {
    title: 'Master Loot',
    looterLabel: 'Master looter',
    thresholdLabel: 'Threshold',
    thresholdUncommon: 'Uncommon and up',
    thresholdRare: 'Rare and up',
    thresholdEpic: 'Epic and up',
    rollButton: 'Roll',
    selectAll: 'Select all',
    methodMaster: 'Loot method set to master loot. Master looter: {name}.',
    methodGroup: 'Loot method set to group loot.',
    assigned: '{looter} assigned {item} to {target}.',
    leaderOnly: 'Only the party leader can change the loot method.',
    // Shown when every player the master looter picked has stopped being eligible
    // (left the group, logged out, left the instance). The prompt is re-offered.
    targetIneligible: 'That player can no longer receive this item.',
  },
  // Loot Settings window (party/raid): the leader edits the loot method + roll
  // threshold, members get a read-only view. Opened from the self/group context menu
  // and auto-opened when you become party leader.
  lootSettings: {
    title: 'Loot Settings',
    close: 'Close loot settings',
    menuItem: 'Loot Settings',
    method: 'Loot Method',
    rollThreshold: 'Roll Threshold',
    groupLoot: 'Group Loot',
    valueMaster: 'Master Loot',
    leaderOption: 'Master Looter: Leader (You)',
    masterOption: 'Master Looter: {name}',
  },
  // Raid -> party demotion (Social panel raid tab). The sim emits these in English;
  // src/ui/sim_i18n.ts re-localizes them through these keys. Mirrors the existing
  // convert-to-raid messages (which live in sim_i18n's RAID_EXTRA table). Lives here
  // in the English-only hud_chrome domain so an English-only PR compiles.
  raidConvert: {
    toPartyDone: 'Your raid has converted back to a party.',
    notRaid: 'Your group is not a raid.',
    leaderOnly: 'Only the raid leader may convert to a party.',
    tooLarge: 'A raid with more than five members cannot convert back to a party.',
  },
  // Rotating loading-screen tips (see ui/loading_tips.ts): short, spoiler-free gameplay
  // hints cycled while the world streams in, so a long load is not dead time.
  loadingTips: {
    map: 'Press M to open the world map and find quest objectives.',
    quests: 'Talk to townsfolk marked with a ! to pick up quests.',
    inspect: 'Right-click another player to inspect their equipped gear.',
    camera: 'Hold right mouse to rotate the camera, and scroll to zoom in or out.',
    chat: 'Type /join world to chat with the whole realm, or /join lfg to find a group.',
    rested: 'Resting in town banks rested XP, so you level faster when you return.',
    talents: 'Spend talent points (N) as you level to shape your build.',
    vendor: 'Sell junk to vendors; list rare finds on the World Market for other players.',
    group: 'Tougher fights and dungeons are easier with a group. Invite players you meet!',
    classes: 'Each of the nine classes plays differently. Try a few to find your favorite.',
  },
  // Donate popup (PIX). Brazil-only payment method; values are Portuguese on
  // purpose so the donation copy reads in the payer's language everywhere.
  donate: {
    title: "Apoie o World of ClaudeCraft",
    intro: "Sua doacao ajuda a manter os servidores no ar e o jogo sempre evoluindo. Qualquer valor faz diferenca. Obrigado!",
    qrAlt: "QR Code do PIX para doacao",
    pixLabel: "PIX copia e cola",
    copy: "Copiar codigo PIX",
    copied: "Copiado!",
    thanks: "Pague pelo QR Code ou copie o codigo acima no app do seu banco.",
    close: "Fechar",
  },
  // ---------------------------------------------------------------------------
  // Gathering professions (Skills panel + every gathering feedback surface).
  //
  // src/sim/professions/ is text-free by contract: it returns ids and numbers
  // (GatherDenyReason, MaterialRarity, MasteryState, ReelOutcome, requiredTier),
  // so every line below is authored here and rendered by src/ui/skills_panel.ts
  // and src/ui/gathering_feedback.ts. Node OBJECT names are entity names and
  // live in world_entity_i18n.ts instead (tEntity), not here.
  // ---------------------------------------------------------------------------
  professions: {
    panelTitle: 'Skills',
    close: 'Close skills',
    subheading: 'What the land will still teach you.',
    empty: 'You have taken up no trade yet. Buy a tool and put it to work.',
    // Profession names + blurbs. English source mirrors GATHERING_PROFESSIONS
    // in src/sim/content/professions/professions.ts.
    names: {
      mining: 'Mining',
      logging: 'Logging',
      herbalism: 'Herbalism',
      fishing: 'Fishing',
    },
    descriptions: {
      mining: 'Breaking ore and stone from the veins that seam the wild.',
      logging: 'Felling timber from the stands that still grow between the zones.',
      herbalism: 'Cutting herbs and roots from whatever the ground consents to give.',
      fishing: 'Drawing a catch out of the rivers, lakes and dead meres of the world.',
    },
    // Progress readouts. The digits are spliced in already formatted.
    skillValue: '{skill} / {max}',
    skillAria: '{profession} proficiency, {skill} of {max}',
    capped: 'Mastered',
    cappedAria: '{profession} mastered at {max}',
    toNextTier: '{points} to the next tier',
    totals: '{skill} of {max} total proficiency',
    // The 0/1/2 proficiency band, which buys cast speed and a better catch table.
    bandLabel: 'Standing',
    bands: {
      apprentice: 'Apprentice',
      journeyman: 'Journeyman',
      master: 'Master',
    },
    // Fishing only: a rod caps which catch table you roll on, and the sim applies
    // that cap silently. This line is the only warning a player ever gets.
    bandToolCapped: 'Your tackle holds you at {band}. A better rod lifts it.',
    // Tools.
    toolLabel: 'Tool',
    toolNone: 'None carried',
    toolTier: 'Tier {tier}',
    toolWorksTo: 'Works anything up to tier {tier}',
    toolNoneHint: 'Bare hands work nothing. Buy a tool first.',
    // The four mastery states, in the classic orange / yellow / green / grey
    // reading: how much of a skill point the content still pays out.
    tierHeading: 'By tier',
    tierLabel: 'Tier {tier}',
    tierAria: 'Tier {tier}, {state}',
    mastery: {
      full: 'Full progress',
      reduced: 'Half progress',
      minimal: 'Slight progress',
      none: 'No progress',
    },
    masteryNoneHint: 'This no longer improves your skill.',
    // Node tooltip: the tool tier the node demands.
    requirement: 'Requires {profession} tool tier {tier}',
    requirementMet: 'Your tool will serve.',
    requirementUnmet: 'Your tool is too crude for this.',
    // Harvest results. `count` and `skill` arrive pre-formatted.
    harvest: {
      result: 'You gather {item} x{count}.',
      resultRich: 'A rich seam. You gather {item} x{count}.',
    },
    skillUp: '{profession} rises to {skill}.',
    skillMastered: 'You have mastered {profession}.',
    // Denials. Ids come from GatherDenyReason; requiredTier / readyInSec are the
    // only numbers the sim hands over.
    deny: {
      noTool: 'You carry no {profession} tool.',
      toolTier: 'This needs a {profession} tool of tier {tier} or better.',
      notReady: 'You have already worked this one. Try again in {seconds}s.',
    },
    // Fishing: the hidden bite moment and the three reel outcomes.
    fishing: {
      bite: 'Something takes the line. Reel it in!',
      biteAria: 'A fish is biting. Press to reel in.',
      biteWindow: '{seconds}s to reel',
      noTackle: 'You need a rod in your bags before you can cast.',
      reel: {
        tooEarly: 'You pull too soon and the line comes up empty.',
        landed: 'You land the catch.',
        tooLate: 'You pull too late. Whatever it was is gone.',
        // The window closed with no reel at all, which is a different miss from
        // pulling late: nobody pulled anything.
        timeout: 'The line goes slack. Whatever it was is gone.',
      },
    },
  },
  // ---------------------------------------------------------------------------
  // The Book of Deeds (achievements). The sim stores deed IDS only; the English
  // name/desc pairs below mirror src/sim/content/deeds/ verbatim so the panel,
  // the toast and the wiki all quote the same words.
  // ---------------------------------------------------------------------------
  deeds: {
    panelTitle: 'Book of Deeds',
    close: 'Close the Book of Deeds',
    tablistLabel: 'Deed categories',
    categories: {
      progression: 'Progression',
      combat: 'Combat',
      exploration: 'Exploration',
      dungeon: 'Dungeons',
      raid: 'Raids',
    },
    categoryAria: '{category}, {earned} of {total} earned',
    completionLabel: 'Deeds earned',
    completionValue: '{earned} of {total}',
    renownLabel: 'Renown',
    renownValue: '{renown}',
    renownWorth: '{renown} renown',
    earnedBadge: 'Earned',
    progressValue: '{current} / {required}',
    progressAria: '{deed}, {current} of {required}',
    completeAria: '{deed}, earned',
    rewardTitle: 'Title: {title}',
    titlesLabel: 'Titles',
    empty: 'Nothing recorded here yet.',
    unlockToast: 'Deed earned: {name}',
    unlockToastRenown: 'Deed earned: {name} ({renown} renown)',
    titleToast: 'Title unlocked: {title}',
    // Title text for the four `deed:` title ids.
    titles: {
      elder: 'the Elder',
      of_the_dawn: 'of the Dawn',
      slayer: 'the Slayer',
      corruptors_bane: "the Corruptor's Bane",
    },
    list: {
      // Progression
      prog_first_steps: {
        name: 'First Steps',
        desc: 'Reach level 2 and take your first step on a long road.',
      },
      prog_finding_your_feet: {
        name: 'Finding Your Feet',
        desc: 'Reach level 5. The Vale already looks a little smaller.',
      },
      prog_double_digits: {
        name: 'Double Digits',
        desc: 'Reach level 10 and unlock your talents.',
      },
      prog_the_long_climb: {
        name: 'The Long Climb',
        desc: 'Reach level 15, high enough that Thornpeak will have you.',
      },
      prog_level_cap: {
        name: 'The View From Twenty',
        desc: 'Reach level 20, the level cap.',
      },
      prog_talented: {
        name: 'A Point Well Spent',
        desc: 'Spend your first talent point.',
      },
      prog_committed: {
        name: 'Committed',
        desc: 'Spend five talent points on a single build.',
      },
      prog_veteran: {
        name: 'Veteran',
        desc: 'Earn 250,000 lifetime experience.',
      },
      prog_champion: {
        name: 'Champion',
        desc: 'Earn 500,000 lifetime experience.',
      },
      prog_begin_again: {
        name: 'Begin Again',
        desc: 'Fill the bar once more past the cap and claim prestige rank 1.',
      },
      prog_old_habits: {
        name: 'Old Habits',
        desc: 'Reach prestige rank 5.',
      },
      prog_dawn_friendly: {
        name: 'A Friend at Gravewatch',
        desc: 'Reach Friendly with the Dawn of Claude.',
      },
      prog_dawn_honored: {
        name: 'Honored by the Dawn',
        desc: 'Reach Honored with the Dawn of Claude.',
      },
      prog_dawn_exalted: {
        name: 'Light Against the Ash',
        desc: 'Reach Exalted with the Dawn of Claude.',
      },
      // Combat
      cmb_first_blood: {
        name: 'First Blood',
        desc: 'Defeat your first enemy.',
      },
      cmb_hundred: {
        name: 'A Hundred Down',
        desc: 'Defeat 100 enemies.',
      },
      cmb_slayer: {
        name: 'Slayer',
        desc: 'Defeat 1,000 enemies.',
      },
      cmb_first_boss: {
        name: 'Something Bigger',
        desc: 'Land the killing blow on your first boss.',
      },
      cmb_boss_fifty: {
        name: 'Practiced Hand',
        desc: 'Defeat 50 bosses.',
      },
      cmb_duel_ten: {
        name: 'Best of Ten',
        desc: 'Win 10 duels.',
      },
      cmb_arena_first_win: {
        name: 'Blooded in the Coliseum',
        desc: 'Win your first ranked arena match.',
      },
      cmb_arena_fifty: {
        name: 'Coliseum Regular',
        desc: 'Win 50 ranked arena matches.',
      },
      cmb_first_fall: {
        name: 'It Happens',
        desc: 'Fall in battle for the first time. Everyone does.',
      },
      // Exploration
      exp_vale_wayfarer: {
        name: 'Wayfarer of the Vale',
        desc: 'Set foot in Eastbrook Vale.',
      },
      exp_marsh_wayfarer: {
        name: 'Wayfarer of the Marsh',
        desc: 'Set foot in Mirefen Marsh.',
      },
      exp_peaks_wayfarer: {
        name: 'Wayfarer of the Heights',
        desc: 'Set foot in Thornpeak Heights.',
      },
      exp_ashen_wayfarer: {
        name: 'Into the Ash',
        desc: 'Set foot in the Ashen Wastes.',
      },
      exp_world_traveler: {
        name: 'The Long Road North',
        desc: 'Walk every zone from Eastbrook Vale to the Ashen Wastes.',
      },
      exp_errand_runner: {
        name: 'Errand Runner',
        desc: 'Complete 10 quests.',
      },
      exp_dependable: {
        name: 'Dependable',
        desc: 'Complete 50 quests.',
      },
      exp_chronicler: {
        name: 'Chronicler',
        desc: 'Complete 100 quests.',
      },
      exp_ashen_arrival: {
        name: 'Reporting to Gravewatch',
        desc: 'Answer the muster and complete "Arrival" in the Ashen Wastes.',
      },
      exp_ashen_attuned: {
        name: 'Attuned',
        desc: 'Complete the Ashen Wastes attunement.',
      },
      exp_first_rare: {
        name: 'Something Blue',
        desc: 'Loot your first rare item.',
      },
      exp_first_epic: {
        name: 'Something Purple',
        desc: 'Loot your first epic item.',
      },
      exp_first_legendary: {
        name: 'Once in a Lifetime',
        desc: 'Loot a legendary item.',
      },
      exp_heavy_purse: {
        name: 'Heavy Purse',
        desc: 'Loot 100 gold over a lifetime.',
      },
      // Dungeons and delves
      dgn_hollow_crypt: {
        name: 'The Hollow Crypt',
        desc: 'Defeat Morthen the Gravecaller in the Hollow Crypt.',
      },
      dgn_sunken_bastion: {
        name: 'The Sunken Bastion',
        desc: 'Defeat Vael the Mistcaller in the Sunken Bastion.',
      },
      dgn_gravewyrm_sanctum: {
        name: 'Gravewyrm Sanctum',
        desc: 'Defeat Korzul the Gravewyrm in the Gravewyrm Sanctum.',
      },
      dgn_drowned_temple: {
        name: 'The Drowned Temple',
        desc: 'Defeat Ysolei, Avatar of the Drowned Moon, in the Drowned Temple.',
      },
      dgn_four_doors: {
        name: 'Four Doors Opened',
        desc: 'Clear all four of the great dungeons.',
      },
      dgn_nythraxis: {
        name: "Thornpeak's Scourge",
        desc: 'Defeat Nythraxis, Scourge of Thornpeak.',
      },
      dgn_regular: {
        name: 'Knows the Way',
        desc: 'Clear 25 dungeons.',
      },
      dlv_reliquary: {
        name: 'The Collapsed Reliquary',
        desc: 'Complete the Collapsed Reliquary on Normal.',
      },
      dlv_reliquary_heroic: {
        name: 'Deeper Still',
        desc: 'Complete the Collapsed Reliquary on Heroic.',
      },
      dlv_delver: {
        name: 'Delver',
        desc: 'Complete 25 delve runs.',
      },
      // Raids
      raid_claudeholme_breach: {
        name: 'Through the Gate',
        desc: 'Defeat the Gatewarden and breach Claudeholme.',
      },
      raid_claudeholme_fall: {
        name: 'The Hollow Lord',
        desc: 'Defeat Lord Veholt the Hollow at the heart of Claudeholme.',
      },
      raid_claudeholme_complete: {
        name: 'Claudeholme Unmade',
        desc: 'Defeat every boss in Claudeholme.',
      },
      raid_claudexxaramas_entry: {
        name: 'Past the Gutpile',
        desc: 'Defeat Gutpile and open Claudexxaramas.',
      },
      raid_claudexxaramas_plaguelord: {
        name: 'The Plaguelord',
        desc: 'Defeat Maggath the Plaguelord.',
      },
      raid_claudexxaramas_fall: {
        name: "The Corruptor's Bane",
        desc: 'Defeat Archlich Vorothne and end the corruption of Claudexxaramas.',
      },
      raid_thunzharr: {
        name: 'The Waking Peak',
        desc: 'Help bring down Thunzharr on Stormcrag.',
      },
    },
  },
  // ---------------------------------------------------------------------------
  // /unstuck. src/sim/unstuck.ts emits stable reason ids and numbers only; the
  // whole string set is authored here and rendered by src/ui/unstuck_feedback.ts.
  // ---------------------------------------------------------------------------
  unstuck: {
    started: 'Hold still. You will be moved to the nearest graveyard in {seconds} seconds.',
    countdown: 'Moving in {seconds}...',
    // One key with the reason spliced in, never two strings concatenated: a
    // locale that puts the cause first can reorder it here.
    cancelledLine: 'Unstuck cancelled. {reason}',
    completed: {
      moved_to_graveyard: 'You come to your senses at the nearest graveyard.',
      revived_at_graveyard: 'Your spirit is drawn back into your body at the nearest graveyard.',
    },
    sickness: 'Unstuck Sickness clings to you for {duration}.',
    sicknessAura: 'Unstuck Sickness',
    sicknessTooltip: 'All attributes reduced while the world settles around you again.',
    blocked: {
      already_active: 'You are already working your way free.',
      cooldown: 'You cannot do that again yet. Try in {seconds} seconds.',
      combat: 'Not while you are in combat.',
      controlled: 'You cannot move under your own power right now.',
      falling: 'Not while you are off the ground.',
      moving: 'Stand perfectly still first.',
      busy: 'Finish what you are doing first.',
      competitive: 'Not during a duel or an arena match.',
      trading: 'Close the trade window first.',
    },
    cancelled: {
      moved: 'You moved.',
      damaged: 'Something struck you.',
      combat: 'You were pulled into combat.',
      busy: 'You started doing something else.',
      state_changed: 'Your situation changed.',
      disconnected: 'Your connection dropped.',
    },
  },
};
