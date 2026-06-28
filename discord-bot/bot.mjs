import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActivityType,
} from 'discord.js';

const TOKEN    = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1520893074597744640';
const GUILD_ID  = process.env.DISCORD_GUILD_ID  || '1520892787472465950';
const GAME_API  = process.env.GAME_API_URL       || 'http://game:8787';
const SITE_URL  = process.env.SITE_URL           || 'https://worldofclaudecraft.com.br';

if (!TOKEN) { console.error('DISCORD_BOT_TOKEN não definido'); process.exit(1); }

// ── Slash commands ────────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('jogar')
    .setDescription('Link para jogar World of ClaudeCraft BR'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Quantos jogadores estão online agora'),

  new SlashCommandBuilder()
    .setName('classes')
    .setDescription('Lista as 9 classes disponíveis no jogo'),

  new SlashCommandBuilder()
    .setName('dungeons')
    .setDescription('Lista as masmorras e níveis recomendados'),
];

// Registra slash commands na guild
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands.map(c => c.toJSON()),
  });
  console.log('✓ Slash commands registrados');
}

// ── Client ────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once('ready', async () => {
  console.log(`✓ Bot online: ${client.user.tag}`);
  await registerCommands().catch(console.error);

  // Status rotativo
  const statuses = [
    { name: 'worldofclaudecraft.com.br', type: ActivityType.Playing },
    { name: 'World of ClaudeCraft BR', type: ActivityType.Watching },
    { name: '/jogar para entrar no mundo', type: ActivityType.Custom },
  ];
  let i = 0;
  const setStatus = () => {
    const s = statuses[i % statuses.length];
    client.user.setActivity(s.name, { type: s.type });
    i++;
  };
  setStatus();
  setInterval(setStatus, 30_000);
});

// ── Boas-vindas automáticas ───────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  // Atribui cargo Aventureiro automaticamente
  const role = member.guild.roles.cache.find(r => r.name === 'Aventureiro');
  if (role) await member.roles.add(role).catch(console.error);

  // Busca canal de boas-vindas
  const channel = member.guild.channels.cache.find(c => c.name === 'boas-vindas');
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('⚔️ Novo Aventureiro!')
    .setDescription(
      `Bem-vindo(a) ao servidor, ${member}! 🎉\n\n` +
      `Você recebeu o cargo **Aventureiro** automaticamente.\n\n` +
      `**Comece a jogar agora:**\n🌐 ${SITE_URL}\n\n` +
      `Leia as **#regras** e divirta-se!`
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: 'World of ClaudeCraft BR' })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(console.error);
});

// ── Slash command handlers ────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'jogar') {
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🎮 Jogar World of ClaudeCraft BR')
      .setDescription(
        `**Jogue agora no navegador — gratuito, sem download!**\n\n` +
        `🌐 **${SITE_URL}**\n\n` +
        `**Como começar:**\n` +
        `1. Clique em **Play Online**\n` +
        `2. Crie sua conta\n` +
        `3. Escolha uma das 9 classes\n` +
        `4. Explore 3 zonas e 90+ quests!\n\n` +
        `*Use \`/classes\` para ver as classes disponíveis*`
      )
      .setFooter({ text: 'World of ClaudeCraft BR' });

    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'status') {
    await interaction.deferReply();
    try {
      const res = await fetch(`${GAME_API}/api/status`);
      const data = await res.json();
      const embed = new EmbedBuilder()
        .setColor(data.players_online > 0 ? 0x57F287 : 0x99AAB5)
        .setTitle('📊 Status do Servidor')
        .addFields(
          { name: '🟢 Jogadores Online', value: `**${data.players_online}**`, inline: true },
          { name: '🌍 Realm', value: data.realm || 'BR', inline: true },
        )
        .setFooter({ text: 'World of ClaudeCraft BR' })
        .setTimestamp();

      if (data.names?.length > 0) {
        embed.addFields({ name: '👥 Online agora', value: data.names.slice(0, 10).join(', ') });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply('❌ Não foi possível conectar ao servidor de jogo.');
    }
  }

  else if (commandName === 'classes') {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('⚔️ As 9 Classes de World of ClaudeCraft')
      .addFields(
        { name: '🛡️ Warrior', value: 'Tank robusto com rage. Charge, Heroic Strike, Thunder Clap.', inline: false },
        { name: '✨ Paladin', value: 'Tank/heal sagrado. Seals, Judgement, Holy Light, Lay on Hands.', inline: false },
        { name: '🏹 Hunter', value: 'DPS à distância. Auto Shot, Serpent Sting, Arcane Shot.', inline: false },
        { name: '🗡️ Rogue', value: 'DPS corpo a corpo. Combo points, Backstab, Eviscerate, Sprint.', inline: false },
        { name: '🌟 Priest', value: 'Healer principal. Heal, Power Word Shield, Renew, Fortitude.', inline: false },
        { name: '⚡ Shaman', value: 'DPS/heal elemental. Lightning Bolt, Healing Wave, Earth Shock.', inline: false },
        { name: '🔥 Mage', value: 'DPS mágico. Fireball, Frostbolt, Polymorph, Frost Nova.', inline: false },
        { name: '💀 Warlock', value: 'DPS sombrio. Shadow Bolt, DoTs, Drain Life, Life Tap.', inline: false },
        { name: '🌿 Druid', value: 'Híbrido. Wrath, Heal, Moonfire, Rejuvenation, Bear Form (nível 10).', inline: false },
      )
      .setFooter({ text: `Jogue em ${SITE_URL}` });

    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'dungeons') {
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🏰 Masmorras de World of ClaudeCraft')
      .setDescription('Todas as masmorras são instanciadas — cada grupo tem sua cópia privada.')
      .addFields(
        { name: '1️⃣ The Hollow Crypt', value: '5 jogadores · Nível ~8\nBoss final: Morthen the Gravecaller\n*Loot: armas raras (azuis)*', inline: false },
        { name: '2️⃣ The Sunken Bastion', value: '5 jogadores · Nível ~13\nBoss final: Vael the Mistcaller\n*Mecânica: ondas de adds em 60% e 30%*', inline: false },
        { name: '3️⃣ Gravewyrm Sanctum', value: '5 jogadores · Nível 20\nBoss final: Korzul the Gravewyrm\n*Loot épico — o desafio final!*', inline: false },
        { name: '⚔️ The Ashen Coliseum', value: 'Arena PvP ranqueada\n1v1 e 2v2 com sistema Elo (começa em 1500)\nPressione `G` no jogo para entrar na fila', inline: false },
      )
      .setFooter({ text: `Jogue em ${SITE_URL}` });

    await interaction.reply({ embeds: [embed] });
  }
});

client.login(TOKEN);
