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
  - [SGLang](https://github.com/sgl-project/sglang) / [vLLM](https://docs.vllm.ai/) (local, faster — see below)
- **[uv](https://docs.astral.sh/uv/)** — only if using the local SGLang server (provisions its own Python 3.12)

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

# SGLang (local, faster — see "SGLang / vLLM" section)
# SGLANG_BASE_URL=http://localhost:30000/v1

# vLLM (local alternative)
# VLLM_BASE_URL=http://localhost:8000/v1
```

### SGLang (fast local inference)

On an NVIDIA GPU, SGLang is significantly faster than Ollama — it uses prefix caching (our prompts are near-identical every turn), FP8/AWQ quantization, and guided JSON decoding that nearly eliminates invalid-response fallbacks.

```bash
# 1. Serve a model (creates the venv + installs SGLang on first run)
./scripts/serve-sglang.sh Qwen/Qwen3-8B 30000

# 2. Point agents at it in .env.local
AGENT_PARTNER_PROVIDER=sglang
AGENT_PARTNER_MODEL=Qwen/Qwen3-8B
AGENT_OPPONENT1_PROVIDER=sglang
AGENT_OPPONENT1_MODEL=Qwen/Qwen3-8B
AGENT_OPPONENT2_PROVIDER=sglang
AGENT_OPPONENT2_MODEL=Qwen/Qwen3-8B
```

The server exposes `http://localhost:30000/v1/chat/completions`. Models download to `~/.cache/huggingface/hub` (override with `HF_HOME`).

**GPU memory:** bf16 uses ~2 bytes/param. `Qwen3-8B` ≈ 16 GB (fits a 24 GB card); plain `Qwen3-14B` ≈ 28 GB (does **not** fit). For 14B on a 24 GB card, use a pre-quantized checkpoint:

```bash
./scripts/serve-sglang.sh Qwen/Qwen3-14B-AWQ 30000 --quantization awq
```

**Options:**
```bash
./scripts/serve-sglang.sh [model] [port] --gpu-mem 0.7    # use less VRAM
./scripts/serve-sglang.sh [model] [port] --quantization fp8
```

The serve script is a thin shell wrapper (sanitizes the environment) that delegates to `scripts/serve_sglang.py`, which calls SGLang's Python API directly.

> **Note:** the script requires a clean, non-conda Python 3.12 (it uses `uv` to provision one). It automatically strips anaconda from `PATH`/`LD_LIBRARY_PATH` because anaconda's old `libstdc++` breaks flashinfer's JIT kernels.

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
- **Direction:** Play and deal are counter-clockwise.
- **Bidding:** Starts at 14 (from dealer's right), maximum 28. Highest bidder chooses trump.
- **Trump:** The bidder places a trump-suit card face-down. Trump is a **suit** — any card of that suit beats all other suits once revealed.
- **Phase 1:** Trump is face-down. Trump cards have no special power. The bidder cannot lead trump until it's revealed.
- **Phase 2:** After trump is called, any trump card beats all non-trump; must follow suit if possible.
- **Locked trump:** In Phase 1, the bidder cannot play trump cards from hand when void — only discard non-trump or reveal the trump.
- **Calling trump:** Whoever calls trump must then play a trump card if they hold one.
- **Rebid:** After all 8 cards are dealt, the bidder or partner may raise to at least **23**. If the bid is raised, the bidder may **change the trump card**.
- **Pair Rule:** Holding both K and Q of trump adjusts the bid by ±4 (bidder −4, defender +4).
- **Match win:** First team to +6 game points wins; −6 loses.

### Scoring (game points by bid bracket)

| Bid | Win | Lose |
|-----|-----|------|
| ≤19 | +1 | −2 |
| 20–23 | +2 | −3 |
| 24–27 | +3 | −4 |
| 28 | +4 | −5 |

The bidding team's game points change by the bracket value; the defending team's score is unaffected.

### Controls

- **Bidding:** Click a number (14–28) from the grid. Click PASS to drop out.
- **Rebid:** After the 8-card deal, click 23+ to raise or PASS.
- **Playing:** Click a card in your hand to select it, then click **Play Card**.
- **Trump Selection:** After winning the bid, click a card from your hand.
- **Change Trump:** After raising the rebid, click **Keep Trump** or **Change Trump**.
- **Call Trump:** Available when you can't follow suit in Phase 1.
- **Show Pair:** Available when holding K+Q of the trump suit.
- **Peek Trump:** Click the face-down trump badge to peek at your own trump card.
- **Points toggle:** Click the "Points" pill below the header to show/hide running card points per team.
- **Concede:** End the match early (configurable via `ALLOW_CONCEDE`).
- **Stop round:** When the outcome is mathematically decided, skip the remaining tricks (configurable via `ALLOW_EARLY_RESOLVE`).

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
| `uv sync --python 3.12` | Create `.venv/` + install the SGLang serving stack |
| `./scripts/serve-sglang.sh [model] [port]` | Serve a model locally with SGLang |

## Notes

- Game state is stored in-memory and lost on server restart.
- Agent turns execute sequentially — allow a few seconds per AI decision.
- For Anthropic Claude models, use OpenRouter (`anthropic/claude-3-haiku` etc.) — direct Anthropic API is not supported.
- The game seat layout: you (South), Raman (North, partner), Krishnan (East, opponent), Kunjappu (West, opponent).
- AI opponents use card-counting memory (played cards, points won, remaining cards) scoped to the current round only.
- The reference rules were cross-checked against the Feathersoft "28" game and [pagat.com](https://www.pagat.com/jass/28.html).
