"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SUIT_SYMBOL } from "./card";
import { TEAM_NAMES } from "./table-config";
import type { Phase, Suit, PlayerIndex, TeamIndex } from "@/engine/types";

interface HeaderBannerProps {
  scores: { team0: number; team1: number };
  humanTeam: TeamIndex;
  phase: Phase;
  phaseLabel: string;
  trumpSuit: Suit | null;
  trumpRevealed: boolean;
  bid: { amount: number; bidder: PlayerIndex } | null;
  trickNumber: number;
  winner: TeamIndex | null;
  currentBidder?: PlayerIndex;
  biddingActive?: boolean;
}

export default function HeaderBanner({
  scores,
  humanTeam,
  phase,
  phaseLabel,
  trumpSuit,
  trumpRevealed,
  bid,
  trickNumber,
  winner,
  currentBidder,
  biddingActive,
}: HeaderBannerProps) {
  const prevScores = useRef(scores);
  const [pulseTeam, setPulseTeam] = useState<TeamIndex | null>(null);

  useEffect(() => {
    const prev = prevScores.current;
    if (scores.team0 !== prev.team0) {
      setPulseTeam(0);
      prevScores.current = scores;
      const t = setTimeout(() => setPulseTeam(null), 1100);
      return () => clearTimeout(t);
    }
    if (scores.team1 !== prev.team1) {
      setPulseTeam(1);
      prevScores.current = scores;
      const t = setTimeout(() => setPulseTeam(null), 1100);
      return () => clearTimeout(t);
    }
    prevScores.current = scores;
  }, [scores]);

  const inPlay = phase === "firstPhase" || phase === "secondPhase";

  return (
    <header
      className="relative z-20 w-full px-4 pb-3 pt-2.5"
      style={{
        background: "linear-gradient(180deg, #8c4006 0%, var(--header) 55%, #4a1c04 100%)",
        boxShadow: "0 4px 18px rgba(0,0,0,0.55)",
      }}
    >
      {/* Gold trims */}
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "linear-gradient(90deg, transparent, #ffe6b0 20%, var(--gold) 50%, #ffe6b0 80%, transparent)" }} />
      <div className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: "linear-gradient(90deg, transparent, rgba(224,160,64,0.6) 50%, transparent)" }} />

      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
        {/* Your team */}
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold text-[var(--frame)] sm:flex"
            style={{ background: "linear-gradient(180deg, #ffe6b0, var(--gold) 60%, #9c6a1e)" }}
            title={TEAM_NAMES[humanTeam]}
          >
            A
          </span>
          <div className="flex flex-col leading-tight">
            <span className="font-ui text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[var(--cream)]/75">
              Your Team
            </span>
            <motion.span
              key={`${scores.team0}-${scores.team1}-${pulseTeam}`}
              className="font-display text-2xl font-bold leading-none"
              animate={pulseTeam === 0 ? { scale: [1, 1.28, 1], color: ["#e0a040", "#ffe6b0", "#e0a040"] } : { scale: 1 }}
              transition={{ duration: 0.6 }}
              style={{ color: "var(--gold)" }}
            >
              {scores.team0}
            </motion.span>
          </div>
        </div>

        {/* Phase + trump + bid */}
        <div className="flex min-w-0 flex-col items-center text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={phase + (winner !== null ? "-win" : "")}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-2"
            >
              <span
                className={`font-display text-[0.72rem] font-bold uppercase tracking-[0.2em] ${
                  winner !== null ? "text-[var(--gold-bright)]" : "text-[var(--cream)]"
                }`}
              >
                {winner !== null ? "Match Over" : phaseLabel}
              </span>
              {trumpRevealed && trumpSuit && (
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full font-card text-[0.7rem]"
                  style={{
                    background: "radial-gradient(circle at 35% 30%, #3a1d05, var(--header) 70%)",
                    boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.85)",
                    color: trumpSuit === "hearts" || trumpSuit === "diamonds" ? "#ff9d8a" : "#ffe9c9",
                  }}
                  title="Trump"
                >
                  {SUIT_SYMBOL[trumpSuit]}
                </span>
              )}
              {inPlay && !trumpRevealed && (
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full font-card text-[0.7rem] text-[var(--gold)]/80"
                  style={{ boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.5)" }}
                  title="Trump hidden"
                >
                  ?
                </span>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-0.5 flex items-center gap-2 font-ui text-[0.58rem] uppercase tracking-[0.12em] text-[var(--cream)]/60">
            {biddingActive && currentBidder !== undefined ? (
              <motion.span
                key={`bidder-${currentBidder}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-full px-2 py-0.5 text-[var(--gold-bright)]"
                style={{ boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.7)", background: "rgba(224,160,64,0.12)" }}
              >
                {currentBidder === 0 ? "Your bid" : `${["You","Krishnan","Raman","Kunjappu"][currentBidder]} bids`}
              </motion.span>
            ) : bid ? (
              <span>
                Bid {bid.amount} · {bid.bidder === 0 ? "You" : ["","Krishnan","Raman","Kunjappu"][bid.bidder]}
              </span>
            ) : null}
            {inPlay && <span>· Trick {Math.min(trickNumber, 8)}/8</span>}
          </div>
        </div>

        {/* Opponents */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex flex-col items-end leading-tight">
            <span className="font-ui text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[var(--cream)]/75">
              Opponents
            </span>
            <motion.span
              key={`${scores.team1}-${scores.team0}-${pulseTeam}`}
              className="font-display text-2xl font-bold leading-none"
              animate={pulseTeam === 1 ? { scale: [1, 1.28, 1], color: ["#e0a040", "#ffe6b0", "#e0a040"] } : { scale: 1 }}
              transition={{ duration: 0.6 }}
              style={{ color: "var(--gold)" }}
            >
              {scores.team1}
            </motion.span>
          </div>
          <span
            className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold text-[var(--frame)] sm:flex"
            style={{ background: "linear-gradient(180deg, #ffe6b0, var(--gold) 60%, #9c6a1e)" }}
            title={TEAM_NAMES[humanTeam === 0 ? 1 : 0]}
          >
            B
          </span>
        </div>
      </div>
    </header>
  );
}
