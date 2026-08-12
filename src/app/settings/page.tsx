"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function SettingsPage() {
  const router = useRouter();

  return (
    <main
      className="felt grain relative flex min-h-screen flex-col items-center px-5 py-10"
      style={{ background: "radial-gradient(ellipse at center, #114A39 0%, #0B1E08 70%, #1F1307 100%)" }}
    >
      {/* Gold hairline frame */}
      <div className="pointer-events-none absolute inset-4 rounded-2xl"
        style={{ boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.25)" }} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="relative z-10 w-full max-w-lg"
      >
        <div className="mb-8 flex flex-col items-center">
          <div className="flex items-center gap-3">
            <span className="font-card text-xl text-[var(--gold)]/50">♠</span>
            <h1 className="font-display text-3xl font-bold uppercase tracking-[0.18em] text-[var(--gold)]">
              Settings
            </h1>
            <span className="font-card text-xl text-[var(--gold)]/50">♥</span>
          </div>
          <div className="mt-2 h-px w-40" style={{ background: "linear-gradient(90deg, transparent, var(--gold), transparent)" }} />
        </div>

        <div className="space-y-5">
          {/* LLM Provider */}
          <motion.section
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl p-[2px]"
            style={{ background: "linear-gradient(180deg, rgba(224,160,64,0.8), rgba(71,63,1,0.6))", boxShadow: "0 8px 22px rgba(0,0,0,0.4)" }}
          >
            <div className="rounded-[calc(0.75rem-2px)] bg-[#150b03]/95 p-5">
              <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.18em] text-[var(--cream)]">
                <span className="font-card text-base text-[var(--gold)]">♦</span>
                LLM Provider
              </h2>
              <p className="font-ui text-xs text-[var(--cream)]/55">
                Configure AI providers via environment variables:
              </p>
              <pre
                className="thin-scroll mt-3 overflow-x-auto rounded-lg p-3 font-ui text-[0.68rem] leading-relaxed text-[var(--cream)]/70"
                style={{
                  background: "linear-gradient(165deg, rgba(243,242,224,0.06), rgba(0,0,0,0.25))",
                  boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.15)",
                }}
              >
{`OPENROUTER_API_KEY=sk-or-v1-...
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
AGENT_PARTNER_PROVIDER=openrouter
AGENT_PARTNER_MODEL=openai/gpt-4o-mini
AGENT_OPPONENT1_MODEL=openai/gpt-4o-mini
AGENT_OPPONENT2_MODEL=openai/gpt-4o-mini`}
              </pre>
            </div>
          </motion.section>

          {/* Agent Personalities */}
          <motion.section
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl p-[2px]"
            style={{ background: "linear-gradient(180deg, rgba(224,160,64,0.8), rgba(71,63,1,0.6))", boxShadow: "0 8px 22px rgba(0,0,0,0.4)" }}
          >
            <div className="rounded-[calc(0.75rem-2px)] bg-[#150b03]/95 p-5">
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.18em] text-[var(--cream)]">
                <span className="font-card text-base text-[var(--gold)]">♣</span>
                Table Personalities
              </h2>
              <div className="space-y-2.5">
                {[
                  { suit: "♥", name: "Raman", team: "Your partner", style: "Loyal, supportive, conservative bidding, cooperative play", gold: true },
                  { suit: "♠", name: "Krishnan", team: "Opponent", style: "Aggressive, high bids, aggressive trump play, risk-taker", gold: false },
                  { suit: "♦", name: "Kunjappu", team: "Opponent", style: "Unpredictable, mixes strategies, hard to read, occasional bluffs", gold: false },
                ].map((p, i) => (
                  <motion.div
                    key={p.name}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    className="rounded-lg px-3 py-2.5"
                    style={{
                      background: p.gold ? "rgba(224,160,64,0.08)" : "rgba(255,255,255,0.03)",
                      boxShadow: p.gold ? "inset 0 0 0 1px rgba(224,160,64,0.3)" : "inset 0 0 0 1px rgba(255,255,255,0.06)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-card text-sm" style={{ color: p.gold ? "var(--gold)" : "var(--cream)/60" }}>{p.suit}</span>
                      <span className={`font-display text-sm font-bold ${p.gold ? "text-[var(--gold)]" : "text-[var(--cream)]"}`}>{p.name}</span>
                      <span className="rounded-full px-2 py-px font-ui text-[0.55rem] font-semibold uppercase tracking-wider text-[var(--cream)]/60"
                        style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }}>
                        {p.team}
                      </span>
                    </div>
                    <p className="mt-1 font-ui text-xs leading-relaxed text-[var(--cream)]/55">{p.style}</p>
                  </motion.div>
                ))}
              </div>
              <p className="mt-3 font-ui text-[0.62rem] text-[var(--cream)]/35">
                Edit agent profiles in src/agents/profiles.ts
              </p>
            </div>
          </motion.section>
        </div>

        <motion.button
          whileHover={{ scale: 1.02, boxShadow: "0 8px 26px rgba(224,160,64,0.4)" }}
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push("/")}
          className="mt-8 w-full rounded-xl py-3.5 font-display text-sm font-bold uppercase tracking-[0.24em] text-[var(--frame)]"
          style={{ background: "linear-gradient(180deg, var(--btn-gradient-to), var(--btn-gradient-from))", boxShadow: "0 4px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.3)" }}
        >
          Back to Menu
        </motion.button>
      </motion.div>
    </main>
  );
}
