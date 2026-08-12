# Thuruppu — Twenty-Eight Card Game

**ഇരുപത്തിയെട്ട് · തുറുപ്പ്**

A full-stack web implementation of the classic Kerala card game Twenty-eight (Thuruppu/Irupathiyettu). Play against AI opponents powered by LLMs with distinct personalities and strategies.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up your LLM API key
cp .env.example .env.local
# Edit .env.local — add your API key (OpenRouter recommended)

# 3. Start the dev server
npm run dev

# 4. Open http://localhost:3000 and click "New Game"
```

## Prerequisites

- **Node.js** 18+
- **LLM API key** — one of:
  - [DeepSeek](https://platform.deepseek.com/) (default)
  - [OpenRouter](https://openrouter.ai/) (supports most models, free tier available)
  - [OpenAI](https://platform.openai.com/)
  - [Ollama](https://ollama.com/) (local — no API key needed)

## Configuration

Edit `.env.local` with your preferred provider. Each agent can use a different provider and model.

### Providers

```env
# DeepSeek (default)
DEEPSEEK_API_KEY=sk-your-key-here

# OpenRouter (alternative — supports many models)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# OpenAI
OPENAI_API_KEY=sk-your-key-here

# Ollama (local — no API key needed, runs on your machine)
# OLLAMA_BASE_URL=http://localhost:11434/v1
```

### Agents (provider, model, and temperature per seat)

```env
# Raman (partner) — conservative
AGENT_PARTNER_PROVIDER=deepseek
AGENT_PARTNER_MODEL=deepseek-chat
AGENT_PARTNER_TEMPERATURE=0.3

# Krishnan (opponent) — aggressive
AGENT_OPPONENT1_PROVIDER=deepseek
AGENT_OPPONENT1_MODEL=deepseek-chat
AGENT_OPPONENT1_TEMPERATURE=0.5

# Kunjappu (opponent) — unpredictable
AGENT_OPPONENT2_PROVIDER=deepseek
AGENT_OPPONENT2_MODEL=deepseek-chat
AGENT_OPPONENT2_TEMPERATURE=0.7
```

### Temperature

Temperature controls how random/risky each AI plays:

| Value | Behavior |
|-------|----------|
| `0.0` | Fully deterministic — safe, predictable play |
| `0.3` | Conservative |
| `0.5` | Balanced |
| `0.7` | Creative, risk-taking |
| `1.0+` | Highly unpredictable |

Lower values make opponents play safer. If opponents are bidding too aggressively, drop `AGENT_OPPONENT*_TEMPERATURE` toward `0.1`.

### Using Ollama (local models)

1. Install [Ollama](https://ollama.com/) and pull a model:
   ```bash
   ollama pull llama3.2   # or qwen2.5, mistral, etc.
   ```
2. Configure agents to use it:
   ```env
   AGENT_PARTNER_PROVIDER=ollama
   AGENT_PARTNER_MODEL=llama3.2
   AGENT_OPPONENT1_PROVIDER=ollama
   AGENT_OPPONENT1_MODEL=llama3.2
   AGENT_OPPONENT2_PROVIDER=ollama
   AGENT_OPPONENT2_MODEL=llama3.2
   ```
3. Smaller local models tend to be less disciplined about JSON output — lower their temperature (e.g. `0.1`) for reliability. The pipeline auto-retries and falls back on invalid responses.

## How to Play

### Game Rules

Twenty-eight is a 4-player trick-taking card game played with 32 cards (J, 9, A, 10, K, Q, 8, 7).

| Card | J | 9 | A | 10 | K | Q | 8 | 7 |
|------|---|---|---|----|---|---|---|---|
| **Points** | 3 | 2 | 1 | 1 | 0 | 0 | 0 | 0 |
| **Rank** | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th |

- **Total points in deck:** 28 (hence the name)
- **Teams:** You + Raman (North) vs Krishnan (East) + Kunjappu (West)
- **Bidding:** Minimum 14, maximum 28. Highest bidder chooses trump.
- **Phase 1:** Trump is face-down. Trump cards have no special power.
- **Phase 2:** After trump is called, trump beats all other suits.
- **Scoring:** First team to ±6 game points wins the match.
- **Pair Rule:** Holding both K and Q of trump adjusts the bid by ±4.

### Controls

- **Bidding:** Click a number (14–28) from the grid. Click PASS to drop out.
- **Playing:** Click a card in your hand to select it, then click **Play Card**.
- **Trump Selection:** After winning the bid, click a card from your hand.
- **Call Trump:** Available when you can't follow suit in Phase 1.
- **Show Pair:** Available when holding K+Q of the trump suit.

### AI Agents

| Agent | Seat | Personality |
|-------|------|------------|
| **Raman** | North (partner) | Loyal, supportive, conservative bidding |
| **Krishnan** | East (opponent) | Aggressive, high bids, risk-taker |
| **Kunjappu** | West (opponent) | Unpredictable, mixes strategies, occasional bluffs |

Agent reasoning is visible in the **Table Talk** section below the game table.

## Architecture

```
src/
├── engine/           # Pure TypeScript game engine (30 tests)
│   ├── types.ts      # All game types & state model
│   ├── cards.ts      # Deck, card values, utilities
│   ├── game.ts       # State machine — bidding, tricks, scoring
│   └── __tests__/    # Vitest test suite
├── agents/           # LLM-powered AI player system
│   ├── profiles.ts   # Agent personas & model config
│   ├── providers.ts  # OpenAI-compatible API abstraction
│   ├── prompts.ts    # Prompt templates with full game rules
│   └── pipeline.ts   # Decision pipeline with retry & fallback
├── lib/
│   └── game-store.ts # Server-side game state & turn coordination
├── components/       # React UI components (designer-built)
│   ├── card.tsx      # Ivory CSS card faces & backs
│   ├── game-table.tsx # Main felt table canvas
│   ├── player-seat.tsx # Per-player fan with animations
│   ├── trick-area.tsx # Center medallion for played cards
│   ├── bid-panel.tsx # 5×3 bid grid
│   ├── header-banner.tsx # Team scores & phase display
│   └── round-result.tsx # Post-round scoring overlay
└── app/              # Next.js App Router
    ├── page.tsx      # Landing page
    ├── game/[id]/    # Game table page
    ├── settings/     # Configuration page
    └── api/game/     # REST API endpoints
```

## Scripts

| Command | Description |
|---------|------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm test` | Run engine tests (vitest) |
| `npm run test:watch` | Watch mode tests |

## Notes

- Game state is stored in-memory and lost on server restart.
- Agent turns execute sequentially — allow a few seconds per AI decision.
- For Anthropic Claude models, use OpenRouter (`anthropic/claude-3-haiku` etc.) — direct Anthropic API is not supported.
- The game seat layout: you (South), Raman (North, partner), Krishnan (East, opponent), Kunjappu (West, opponent).
