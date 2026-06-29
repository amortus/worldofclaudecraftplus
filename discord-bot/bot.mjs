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
const UPDATES_CHANNEL = process.env.UPDATES_CHANNEL_NAME || 'atualizações';

if (!TOKEN) { console.error('DISCORD_BOT_TOKEN não definido'); process.exit(1); }

// ── Slash commands ────────────────────────────────────────────────────────────
const PIX_KEY   = process.env.PIX_KEY   || '';
const PIX_NAME  = process.env.PIX_NAME  || 'World of ClaudeCraft BR';

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

  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Top 10 jogadores do servidor por XP'),

  new SlashCommandBuilder()
    .setName('arena')
    .setDescription('Top 10 da Arena PvP ranqueada'),

  new SlashCommandBuilder()
    .setName('wiki')
    .setDescription('Link para a wiki BR com guias completos'),

  new SlashCommandBuilder()
    .setName('apoiar')
    .setDescription('Apoie o servidor para mantê-lo online 🙏'),

  new SlashCommandBuilder()
    .setName('novidades')
    .setDescription('Veja as últimas atualizações do servidor BR'),

  new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Veja o perfil de um personagem do servidor')
    .addStringOption(opt =>
      opt.setName('nome').setDescription('Nome do personagem').setRequired(true)
    ),
];

// ── Changelog ─────────────────────────────────────────────────────────────────
const UPDATES = [
  {
    version: 'v1.5.0-br',
    date: '29 Jun 2026',
    title: '🗺️ Mapa Redesenhado + Otimizações de Performance',
    items: [
      '**Mapa do mundo reformulado** — novo sistema de hillshade em 2 eixos (NW), transições suaves entre biomas, franja de praia nas margens de lagos, neve nos picos e variação de cor pixel a pixel. Visual muito mais detalhado e realista',
      '**Relatórios de bug no Discord** — ao clicar "Relatar Erro" no jogo, a screenshot e descrição chegam direto no canal #bugs-e-suporte do servidor',
      '**Compressão WebSocket** — mensagens de rede comprimidas automaticamente (~40–60% menores). Conexão mais rápida especialmente em redes lentas',
      '**Grama sem travadas** — chunks de grama são pré-carregados antes de ficarem visíveis. A câmera entra na área e a grama já está pronta',
      '**Perfil de personagem** — use `/perfil <nome>` no Discord para ver stats de qualquer jogador do servidor',
    ],
  },
  {
    version: 'v1.4.0-br',
    date: '28 Jun 2026',
    title: '🧠 Detecção Inteligente de GPU + Melhorias',
    items: [
      '**Gráficos adaptativos no primeiro login** — o jogo detecta automaticamente sua GPU e escolhe a qualidade ideal (celular fraco → Baixo; PC gamer → Ultra). Fim do lag na primeira vez!',
      '**SEO PT-BR** — título, descrição e idioma do site agora em português para melhor busca no Google',
      '**Discord atualizado** — novos comandos `/ranking`, `/arena`, `/wiki`, `/apoiar` e `/novidades`',
      '**Wiki dark theme** — tema escuro completo com estilo dark fantasy na wiki do servidor',
      '**Suporte a 7 novos idiomas** — holandês, polonês, indonésio, turco, sueco, vietnamita e dinamarquês',
      '**Correção de build Docker** — deploy mais estável no servidor',
    ],
  },
];

function buildNovidadesEmbed(update) {
  const desc = update.items.map(i => `• ${i}`).join('\n\n');
  return new EmbedBuilder()
    .setColor(0xC8A840)
    .setTitle(`📋 ${update.title}`)
    .setDescription(desc)
    .addFields({ name: '🗓️ Data', value: update.date, inline: true })
    .setFooter({ text: `World of ClaudeCraft BR · ${SITE_URL}` })
    .setTimestamp();
}

// Posta no canal de atualizações se ainda não postou esta versão
async function postUpdateToChannel(guild) {
  const channel = guild.channels.cache.find(
    c => c.name === UPDATES_CHANNEL && c.isTextBased(),
  );
  if (!channel) {
    console.log(`⚠ Canal "${UPDATES_CHANNEL}" não encontrado. Canais disponíveis: ${guild.channels.cache.filter(c => c.isTextBased()).map(c => c.name).join(', ')}`);
    return;
  }
  console.log(`✓ Postando atualização em #${channel.name}`);

  const latest = UPDATES[0];
  const marker = `<!-- woc-update:${latest.version} -->`;

  // Verifica se já postamos essa versão (lê últimas 10 msgs)
  try {
    const msgs = await channel.messages.fetch({ limit: 10 });
    const already = msgs.some(m => m.content?.includes(marker) || m.embeds?.some(e => e.title?.includes(latest.version)));
    if (already) return;
  } catch {
    // sem permissão de leitura — tenta postar mesmo assim
  }

  await channel.send({
    content: marker,
    embeds: [buildNovidadesEmbed(latest)],
  }).catch(console.error);
}

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

  // Posta atualização no canal #atualizações se versão nova
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) await postUpdateToChannel(guild).catch(console.error);

  // Status rotativo
  const statuses = [
    { name: 'worldofclaudecraft.com.br', type: ActivityType.Playing },
    { name: 'World of ClaudeCraft BR', type: ActivityType.Watching },
    { name: '/jogar para entrar no mundo', type: ActivityType.Custom },
  ];
  let statusIdx = 0;
  const setStatus = () => {
    const s = statuses[statusIdx % statuses.length];
    try { client.user.setActivity(s.name, { type: s.type }); } catch { /* ignore */ }
    statusIdx++;
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
      const res = await fetch(`${GAME_API}/api/status`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

  else if (commandName === 'ranking') {
    await interaction.deferReply();
    try {
      const res = await fetch(`${GAME_API}/api/leaderboard?limit=10&scope=realm`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const leaders = data.leaders ?? [];
      const lines = leaders.length
        ? leaders.map((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i+1}.**`;
            return `${medal} **${p.name}** — Nível ${p.level ?? '?'} · ${(p.lifetimeXp ?? 0).toLocaleString('pt-BR')} XP`;
          }).join('\n')
        : '*Nenhum jogador no ranking ainda — seja o primeiro!*';
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Top 10 — Ranking do Servidor')
        .setDescription(lines)
        .setFooter({ text: `World of ClaudeCraft BR · ${SITE_URL}` })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply('❌ Não foi possível buscar o ranking agora.');
    }
  }

  else if (commandName === 'arena') {
    await interaction.deferReply();
    try {
      const res = await fetch(`${GAME_API}/api/arena/leaderboard?format=1v1`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const leaders = data.leaders ?? [];
      const lines = leaders.length
        ? leaders.slice(0, 10).map((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i+1}.**`;
            return `${medal} **${p.name}** — ${p.rating ?? 1500} pts`;
          }).join('\n')
        : '*Nenhum jogador na arena ainda — entre na fila com `G`!*';
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('⚔️ Top 10 — Arena PvP 1v1')
        .setDescription(lines)
        .setFooter({ text: `World of ClaudeCraft BR · The Ashen Coliseum` })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply('❌ Não foi possível buscar o ranking da arena.');
    }
  }

  else if (commandName === 'wiki') {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📖 Wiki — World of ClaudeCraft BR')
      .setDescription(
        `Guias completos em português para o servidor BR.\n\n` +
        `🔗 **${SITE_URL}/wiki/index.php/Main_Page**\n\n` +
        `**Conteúdo disponível:**\n` +
        `• [[Começando]] — crie conta e entre em 2 min\n` +
        `• [[Classes]] — rotações e builds das 9 classes\n` +
        `• [[Masmorras]] — boss guides completos\n` +
        `• [[Zonas]] — mapas, quests e progressão\n` +
        `• [[Arena]] — sistema PvP ranqueado\n` +
        `• [[Controles]] — todas as teclas`
      )
      .setFooter({ text: 'World of ClaudeCraft BR' });
    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'apoiar') {
    const pixInfo = PIX_KEY
      ? `\n\n💸 **Pix:** \`${PIX_KEY}\` (${PIX_NAME})\n*Qualquer valor ajuda a manter o servidor online!*`
      : '\n\n*Link de apoio em breve — obrigado pelo interesse!*';
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🙏 Apoie o Servidor BR')
      .setDescription(
        `O **World of ClaudeCraft BR** é gratuito e sem pay-to-win.\n` +
        `O servidor tem custo mensal de infraestrutura — sua contribuição mantém tudo online 24/7!\n` +
        `${pixInfo}\n\n` +
        `**O que sua doação suporta:**\n` +
        `• ☁️ Servidor VPS dedicado (Oracle Cloud)\n` +
        `• 🌐 Domínio worldofclaudecraft.com.br\n` +
        `• 📊 Monitoramento Grafana/Prometheus\n` +
        `• 🔧 Desenvolvimento de novos conteúdos\n\n` +
        `*Todo doador recebe o cargo especial **Patrono** no Discord!*`
      )
      .setFooter({ text: 'Obrigado por jogar World of ClaudeCraft BR! ⚔️' });
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

  else if (commandName === 'novidades') {
    const latest = UPDATES[0];
    await interaction.reply({ embeds: [buildNovidadesEmbed(latest)] });
  }

  else if (commandName === 'perfil') {
    const nome = interaction.options.getString('nome', true).trim();
    await interaction.deferReply();
    try {
      const res = await fetch(`${GAME_API}/api/player?name=${encodeURIComponent(nome)}`, { signal: AbortSignal.timeout(5000) });
      if (res.status === 404) {
        await interaction.editReply(`❌ Personagem **${nome}** não encontrado.`);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const p = await res.json();
      const CLASS_EMOJI = {
        warrior: '🛡️', paladin: '✨', hunter: '🏹', rogue: '🗡️',
        priest: '🌟', shaman: '⚡', mage: '🔥', warlock: '💀', druid: '🌿',
      };
      const classEmoji = CLASS_EMOJI[p.class] ?? '⚔️';
      const classLabel = p.class ? (p.class.charAt(0).toUpperCase() + p.class.slice(1)) : '?';
      const xpFormatted = (p.lifetimeXp ?? 0).toLocaleString('pt-BR');
      const prestige = p.prestigeRank > 0 ? ` · Prestígio ${p.prestigeRank}` : '';
      const guild = p.guild ? `**<${p.guild}>**  ` : '';
      const onlineStatus = p.online ? '🟢 Online agora' : '⚫ Offline';
      const embed = new EmbedBuilder()
        .setColor(p.online ? 0x57F287 : 0x99AAB5)
        .setTitle(`${classEmoji} ${p.name}`)
        .setDescription(`${guild}${onlineStatus}`)
        .addFields(
          { name: 'Classe', value: classLabel, inline: true },
          { name: 'Nível', value: `**${p.level}**${prestige}`, inline: true },
          { name: 'XP Total', value: xpFormatted, inline: true },
        )
        .setFooter({ text: `World of ClaudeCraft BR · ${SITE_URL}` })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply('❌ Não foi possível buscar o perfil agora.');
    }
  }
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`${signal} received — logging out`);
  try { await client.destroy(); } catch { /* ignore */ }
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT',  () => void shutdown('SIGINT'));

client.login(TOKEN);
