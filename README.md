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
  - [OpenRouter](https://openrouter.ai/) (recommended — supports most models, free tier available)
  - [OpenAI](https://platform.openai.com/)
  - [DeepSeek](https://platform.deepseek.com/)

## Configuration

Edit `.env.local` with your preferred provider:

```env
# Primary provider (recommended)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Agent model customization (optional)
AGENT_PARTNER_MODEL=openai/gpt-4o-mini
AGENT_OPPONENT1_MODEL=openai/gpt-4o-mini
AGENT_OPPONENT2_MODEL=openai/gpt-4o-mini
```

Different agents can use different models for varied play styles.

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
