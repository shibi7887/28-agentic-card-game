"use client";

import { motion } from "framer-motion";
import { SEATS } from "./table-config";
import type { LegalMove, PlayerIndex, BidRecord } from "@/engine/types";

interface BidPanelProps {
  legalMoves: LegalMove[];
  currentBid: { amount: number; bidder: PlayerIndex } | null;
  bidHistory: BidRecord[];
  onMove: (move: LegalMove) => void;
}

const BID_NUMBERS = Array.from({ length: 15 }, (_, i) => i + 14);

export default function BidPanel({ legalMoves, currentBid, bidHistory, onMove }: BidPanelProps) {
  const canPass = legalMoves.some(m => m.type === "pass");
  const canRedeal = legalMoves.some(m => m.type === "redeal");

  const recentBids = bidHistory.slice(-4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="mx-auto w-full max-w-sm"
    >
      <div className="mb-2 flex items-center justify-center gap-2">
        <span className="h-px w-8" style={{ background: "linear-gradient(90deg, transparent, var(--gold))" }} />
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.28em] text-[var(--gold)]">
          Place Your Bid
        </h3>
        <span className="h-px w-8" style={{ background: "linear-gradient(90deg, var(--gold), transparent)" }} />
      </div>

      {/* Current bid */}
      <div className="mb-2.5 text-center">
        {currentBid ? (
          <span className="font-ui text-xs text-[var(--cream)]/80">
            Current bid{" "}
            <span className="font-bold text-[var(--gold-bright)]">{currentBid.amount}</span> by{" "}
            <span className="font-semibold text-[var(--cream)]">
              {currentBid.bidder === 0 ? "You" : SEATS[currentBid.bidder as PlayerIndex]?.name ?? `P${currentBid.bidder}`}
            </span>
          </span>
        ) : (
          <span className="font-ui text-xs text-[var(--cream)]/60">Opening bid — 14 or higher</span>
        )}
      </div>

      {/* 5×3 grid */}
      <div className="grid grid-cols-5 gap-1.5">
        {BID_NUMBERS.map((n, i) => {
          const legal = legalMoves.some(m => m.type === "bid" && m.amount === n);
          return (
            <motion.button
              key={n}
              type="button"
              whileTap={legal ? { scale: 0.92 } : undefined}
              onClick={() => legal && onMove({ type: "bid", amount: n })}
              disabled={!legal}
              className={`h-10 rounded-lg font-display text-base font-bold transition-all duration-150 ${
                legal
                  ? "cursor-pointer text-[var(--cream)] hover:brightness-125 hover:shadow-[0_0_14px_rgba(224,160,64,0.35)]"
                  : "cursor-not-allowed text-[var(--cream)]/25"
              }`}
              style={{
                background: legal
                  ? "linear-gradient(180deg, #7c0a0a 0%, var(--bid-btn) 55%, #3f0000 100%)"
                  : "rgba(0,0,0,0.3)",
                boxShadow: legal ? "inset 0 0 0 1px rgba(224,160,64,0.25), 0 2px 5px rgba(0,0,0,0.4)" : "inset 0 0 0 1px rgba(255,255,255,0.05)",
              }}
            >
              {n}
            </motion.button>
          );
        })}
      </div>

      {/* Pass / redeal */}
      <div className="mt-2.5 flex justify-center gap-2">
        {canPass && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => onMove({ type: "pass" })}
            className="h-10 rounded-lg px-8 font-display text-sm font-bold uppercase tracking-[0.2em] text-[var(--frame)]"
            style={{ background: "linear-gradient(180deg, var(--btn-gradient-to), var(--btn-gradient-from))", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
          >
            Pass
          </motion.button>
        )}
        {canRedeal && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => onMove({ type: "redeal" })}
            className="h-10 rounded-lg px-8 font-display text-sm font-bold uppercase tracking-[0.2em] text-[var(--frame)]"
            style={{ background: "linear-gradient(180deg, var(--btn-gradient-to), var(--btn-gradient-from))", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
          >
            Redeal
          </motion.button>
        )}
      </div>

      {/* Recent bid history */}
      {recentBids.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          {recentBids.map((b, i) => {
            const name = b.player === 0 ? "You" : SEATS[b.player as PlayerIndex]?.name ?? `P${b.player}`;
            return (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`rounded-full px-2 py-0.5 font-ui text-[0.6rem] font-semibold uppercase tracking-wider ${
                  b.pass
                    ? "text-[var(--cream)]/55"
                    : "text-[var(--gold-bright)]"
                }`}
                style={{
                  background: b.pass ? "rgba(255,255,255,0.06)" : "rgba(224,160,64,0.12)",
                  boxShadow: b.pass ? "inset 0 0 0 1px rgba(255,255,255,0.1)" : "inset 0 0 0 1px rgba(224,160,64,0.35)",
                }}
              >
                {name} {b.pass ? "pass" : b.amount}
              </motion.span>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
