"use client";

import { motion } from "framer-motion";
import type { TeamIndex } from "@/engine/types";

interface RoundResultProps {
  biddingTeamWon: boolean;
  bidAmount: number;
  biddingTeamPoints: number;
  defendingTeamPoints: number;
  pointsChange: number;
  humanTeam: TeamIndex;
  winner: TeamIndex | null;
  onNextRound: () => void;
  onExit: () => void;
}

export default function RoundResult({
  biddingTeamWon,
  bidAmount,
  biddingTeamPoints,
  defendingTeamPoints,
  pointsChange,
  humanTeam,
  winner,
  onNextRound,
  onExit,
}: RoundResultProps) {
  const matchEnd = winner !== null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ background: "rgba(8, 14, 8, 0.72)", backdropFilter: "blur(3px)" }}
    >
      <motion.div
        initial={{ scale: 0.75, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl p-[2px]"
        style={{
          background: "linear-gradient(180deg, #ffe6b0 0%, #9c6a1e 30%, #473f01 70%, #e0a040 100%)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 50px rgba(224,160,64,0.25)",
        }}
      >
        <div
          className="relative rounded-[calc(1rem-2px)] px-6 py-7 text-center"
          style={{
            background: "radial-gradient(circle at 50% 0%, #2c1c0a 0%, #190d03 70%)",
          }}
        >
          {/* Suit corner decorations */}
          <span className="absolute left-3 top-2 font-card text-lg text-[var(--gold)]/25">♠</span>
          <span className="absolute right-3 top-2 font-card text-lg text-[var(--gold)]/25">♦</span>
          <span className="absolute bottom-2 left-3 font-card text-lg text-[var(--gold)]/25">♥</span>
          <span className="absolute bottom-2 right-3 font-card text-lg text-[var(--gold)]/25">♣</span>

          {matchEnd ? (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 14 }}
                className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full"
                style={{
                  background: "radial-gradient(circle at 35% 30%, #3a1d05, var(--header) 70%)",
                  boxShadow: "0 0 0 2px rgba(224,160,64,0.7), 0 0 30px rgba(224,160,64,0.5)",
                }}
              >
                <span className="font-card text-3xl text-[var(--gold)]">♛</span>
              </motion.div>
              <p className="font-display text-2xl font-bold uppercase tracking-[0.08em] text-[var(--gold)]">
                {winner === humanTeam ? "Victory!" : "Defeat"}
              </p>
              <p className="mt-1 font-ui text-sm text-[var(--cream)]/85">
                Team <span className="font-bold text-[var(--gold-bright)]">{winner === 0 ? "A" : "B"}</span> wins the
                match
              </p>
              <p className="mt-1 font-ui text-xs text-[var(--cream)]/50">
                Final score {winner === 0 ? "your team" : "opponents"} reached the winning mark
              </p>
            </>
          ) : (
            <>
              <motion.p
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="font-display text-xl font-bold uppercase tracking-[0.06em]"
                style={{
                  color: biddingTeamWon ? "var(--gold-bright)" : "#e07a5f",
                }}
              >
                {biddingTeamWon ? "Bid Made!" : "Bid Failed"}
              </motion.p>

              <div className="mt-4 space-y-1.5 font-ui text-sm">
                <div className="flex items-center justify-between text-[var(--cream)]/80">
                  <span>Bid</span>
                  <span className="font-bold text-[var(--gold)]">{bidAmount}</span>
                </div>
                <div className="flex items-center justify-between text-[var(--cream)]/80">
                  <span>Bidding team</span>
                  <span className="font-bold text-[var(--cream)]">{biddingTeamPoints} pts</span>
                </div>
                <div className="flex items-center justify-between text-[var(--cream)]/80">
                  <span>Defending team</span>
                  <span className="font-bold text-[var(--cream)]">{defendingTeamPoints} pts</span>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--gold)]/25 pt-1.5">
                  <span className="text-[var(--cream)]/60">Bidding team {biddingTeamWon ? "gained" : "lost"}</span>
                  <motion.span
                    key={`${biddingTeamWon}-${pointsChange}`}
                    initial={{ scale: 1.6, color: "#ffe6b0" }}
                    animate={{ scale: 1, color: biddingTeamWon ? "var(--gold)" : "#e07a5f" }}
                    className="font-display text-lg font-bold"
                  >
                    {pointsChange > 0 ? `+${pointsChange}` : pointsChange}
                  </motion.span>
                </div>
              </div>
            </>
          )}

          <div className="mt-6 flex flex-col gap-2">
            {!matchEnd && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={onNextRound}
                className="h-11 rounded-xl font-display text-sm font-bold uppercase tracking-[0.22em] text-[var(--frame)]"
                style={{
                  background: "linear-gradient(180deg, var(--btn-gradient-to), var(--btn-gradient-from))",
                  boxShadow: "0 3px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35)",
                }}
              >
                Next Round
              </motion.button>
            )}
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={onExit}
              className="h-10 rounded-xl font-ui text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cream)]/70"
              style={{ boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.4)" }}
            >
              Back to Menu
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
