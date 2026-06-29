# World of ClaudeCraft BR — Roadmap

> Documento vivo. Atualizado conforme o jogo evolui.
> Última revisão: Jun 2026

---

## Estado atual (Jun 2026)

### O que já existe
- 9 classes jogáveis (warrior, mage, rogue, paladin, hunter, priest, shaman, warlock, druid)
- 4 zonas com mobs, quests e hubs (Eastbrook Vale, Mirefen Marsh, Thornpeak Heights, Ashen Wastes)
- Tutorial de onboarding completo (move → NPC → quest → matar → entregar)
- Sistema de quests com tracker, objetivos e recompensas
- Arco de história de 3 atos (níveis 1–20)
- Dungeons (Hollow Crypt, Abandoned Crypt + outros)
- Party system
- Guild system (servidor)
- Chat (local, global, guild)
- Minimap + mapa mundial com hillshade
- Level cap 20 + virtual levels pós-cap
- Vendors, itens, drops
- Leaderboard / ranking
- Arena PvP
- Discord bot (ranking, arena, wiki, perfil, bug reports)
- Monitoring (Prometheus + Grafana)
- Wiki integrada (MediaWiki)
- 14 idiomas

---

## Fase 1 — Retenção (próximos 30–60 dias)

*Objetivo: jogador chega, fica e volta amanhã.*

- [ ] **World Boss semanal** — boss de elite spawna em horário fixo, aviso automático no Discord 30min antes. Cria evento social que puxa jogadores online ao mesmo tempo
- [ ] **Daily quests** — 3 quests aleatórias por zona, resetam à meia-noite. Razão para logar todo dia
- [ ] **Notificação de boss no Discord** — bot posta "O Senhor das Sombras vai surgir em 30 minutos!" no canal de anúncios
- [ ] **Mapa visual polido** — hillshade 2 eixos, transições suaves de bioma, franja de praia (✅ feito Jun 2026)
- [ ] **Leaderboard visível na home** — top 10 jogadores sem precisar logar

---

## Fase 2 — Profundidade (60–120 dias)

*Objetivo: progressão após nível 20, razão para continuar.*

- [ ] **Guild UI** — criar guild, convidar membros, chat de guild in-game (backend existe, falta UI)
- [ ] **Mais dungeons** — 1 dungeon nova por zona, escalando com level
- [ ] **Sistema de crafting básico** — receitas simples (drops + vendor) → item craftável
- [ ] **Achievements** — metas visuais além de quests (matar 100 lobos, explorar todas as zonas, etc.)
- [ ] **Amigos in-game** — lista de amigos, ver quem está online, teleporte para friend
- [ ] **Histórico de dungeons** — tempo de conclusão, DPS, boss kills por personagem

---

## Fase 3 — Polimento visual (120+ dias)

*Objetivo: o jogo está sólido, agora parece profissional.*

- [ ] **Novos modelos de mobs** — variedade visual por zona (requer Blender ou assets externos)
- [ ] **Efeitos de habilidade melhorados** — partículas, impacto visual mais satisfatório
- [ ] **UI redesign** — identidade visual própria, sair do visual do upstream
- [ ] **Música por zona** — trilha ambiente diferente para cada bioma
- [ ] **Mobile polish** — controles touch refinados, UI adaptada para tela pequena
- [ ] **Cutscenes/cinemáticas de zona** — intro animada ao entrar em nova área

---

## Fase 4 — Escala (quando tiver 100+ players)

*Só abordar quando a demanda justificar.*

- [ ] **Multi-realm** — múltiplos servidores para reduzir latência por região
- [ ] **Anti-cheat robusto** — quando houver incentivo real para trapacear (ranked, prêmios)
- [ ] **App mobile nativo** — só após base web consolidada
- [ ] **Sistema de economia player-driven** — bazaar, leilão, trading entre players
- [ ] **Temporadas** — reset de ranking com recompensas exclusivas por temporada

---

## Ideias futuras (sem prioridade definida)

- **Sistema de mounts** — cavalos, grifos, outras montarias desbloqueáveis
- **Housing/player housing** — parcela de terreno personalizável por jogador
- **PvP em mundo aberto** — zonas de PvP flaggable, bounty system
- **Profissões** — mineração, herbalismo, pesca (pesca já tem base no código)
- **Eventos sazonais** — Halloween, Natal, eventos de lore do servidor BR
- **Sistema de reputação** — facções nas zonas, rewards por reputação
- **Battleground 5v5** — mapa de PvP instanciado além da arena 1v1
- **Raid 10 jogadores** — conteúdo de endgame para grupos grandes
- **Lore BR** — história própria do servidor, personagens brasileiros, referências culturais
- **Twitch integration** — streamers podem deixar viewers interagir com o jogo
- **Headless RL** — treinar agentes de IA contra o servidor (já tem base em `/headless`)

---

## O que NÃO fazer agora

- Reescrever o engine — a fundação é boa
- Novo servidor/infraestrutura — Oracle Cloud aguenta até ~100 players simultâneos
- Animações 3D customizadas — requer Blender, skill de meses
- Monetização agressiva — construir base de jogadores primeiro

---

*Para sugerir algo: abra um issue no GitHub ou poste no canal #sugestões do Discord.*
