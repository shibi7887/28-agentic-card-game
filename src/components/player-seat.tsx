"use client";

import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { CardFace, CardBack } from "./card";
import type { SeatPosition } from "./table-config";
import type { Card, Phase } from "@/engine/types";

interface PlayerSeatProps {
  position: SeatPosition;
  name: string;
  role: "you" | "partner" | "opponent";
  isHuman: boolean;
  hand?: Card[];
  handCount?: number;
  isTurn: boolean;
  isThinking: boolean;
  isDealer: boolean;
  isWinner: boolean;
  isBidder: boolean;
  trumpRevealed: boolean;
  hiddenTrumpCard: import("@/engine/types").Card | null;
  tricksWon: number;
  legalCards: Card[];
  selectedCard: Card | null;
  loading: boolean;
  phase: Phase;
  onCardClick: (card: Card) => void;
}

const FAN_STEP: Record<SeatPosition, number> = {
  south: 3.4,
  north: 2.3,
  east: 3.8,
  west: 3.8,
};

const OVERLAP: Record<SeatPosition, number> = {
  south: 0.6,
  north: 0.68,
  east: 0.68,
  west: 0.68,
};

function fanRotation(position: SeatPosition, index: number, count: number): number {
  const step = FAN_STEP[position];
  const start = -((count - 1) / 2) * step;
  return start + index * step;
}

function isLegal(card: Card, legalCards: Card[]): boolean {
  return legalCards.some(c => c.suit === card.suit && c.rank === card.rank);
}

export default function PlayerSeat({
  position,
  name,
  role,
  isHuman,
  hand,
  handCount,
  isTurn,
  isThinking,
  isDealer,
  isWinner,
  isBidder,
  trumpRevealed,
  hiddenTrumpCard,
  tricksWon,
  legalCards,
  selectedCard,
  loading,
  phase,
  onCardClick,
}: PlayerSeatProps) {
  const interactive = isHuman && isTurn && !loading;
  const vertical = position === "east" || position === "west";
  const count = isHuman ? (hand?.length ?? 0) : (handCount ?? 0);

  const cardEls = Array.from({ length: count }, (_, i) => {
    const card = isHuman ? hand?.[i] : undefined;
    const rot = fanRotation(position, i, count);
    const selected =
      card !== undefined &&
      selectedCard !== null &&
      card.suit === selectedCard.suit &&
      card.rank === selectedCard.rank;
    const legal = card !== undefined && isLegal(card, legalCards);

    const overlap = `calc(var(--card-w) * -${OVERLAP[position]})`;

    const style: CSSProperties = {
      transform: `rotate(${rot}deg)`,
      zIndex: selected ? 40 : i + 1,
      marginLeft: i === 0 ? undefined : vertical ? 0 : overlap,
      marginTop: i === 0 ? undefined : vertical ? "calc(var(--card-w) * -0.55)" : 0,
    };

    if (isHuman && card) {
      return (
        <motion.div
          key={`${card.suit}-${card.rank}-${i}`}
          initial={{ opacity: 0, y: 26, rotate: rot - 10 }}
          animate={{ opacity: 1, y: 0, rotate: rot }}
          transition={{ delay: i * 0.045, type: "spring", stiffness: 260, damping: 22 }}
          style={style}
        >
        <CardFace
            card={card}
            size="var(--card-w)"
            elevated={selected}
            dimmed={interactive && !legal}
            onClick={interactive && legal ? () => onCardClick(card) : undefined}
            className={selected ? "-translate-y-3" : ""}
          />
        </motion.div>
      );
    }

    return (
      <motion.div
        key={i}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.04, type: "spring", stiffness: 240, damping: 24 }}
        style={style}
      >
        <CardBack ariaLabel={`${name}'s card`} size="var(--card-w)" />
      </motion.div>
    );
  });

  const fanStyle: CSSProperties = vertical
    ? { flexDirection: "column", alignItems: "center" }
    : { flexDirection: "row", alignItems: position === "north" ? "flex-start" : "flex-end" };

  const plate = (
    <div className="relative flex items-center justify-center gap-1.5">
      {isDealer && (
        <motion.span
          animate={isTurn && !loading ? { boxShadow: [
            "0 0 0 0 rgba(224,160,64,0.7)",
            "0 0 0 6px rgba(224,160,64,0)",
            "0 0 0 0 rgba(224,160,64,0.7)",
          ]} : {}}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-4 w-4 items-center justify-center rounded-full text-[0.55rem] font-bold text-[var(--frame)]"
          style={{ background: "linear-gradient(180deg, #ffe6b0, var(--gold) 60%, #9c6a1e)", boxShadow: "0 1px 3px rgba(0,0,0,0.5)" }}
          title="Dealer"
        >
          D
        </motion.span>
      )}
      <span
        className={`font-display text-[0.72rem] font-bold uppercase tracking-[0.14em] ${
          role === "you" ? "text-[var(--gold-bright)]" : role === "partner" ? "text-[var(--gold)]" : "text-[var(--cream)]/80"
        }`}
      >
        {name}
      </span>
      {isHuman && (
        <span
          className="rounded-full px-1.5 py-px text-[0.55rem] font-semibold uppercase tracking-wider text-[var(--frame)]"
          style={{ background: "linear-gradient(180deg, var(--gold-bright), var(--btn-gradient-from))" }}
        >
          You
        </span>
      )}
      {tricksWon > 0 && (
        <span
          className="rounded-full px-1.5 py-px text-[0.58rem] font-bold text-[var(--gold)]"
          style={{ boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.5)", background: "rgba(224,160,64,0.08)" }}
          title={`${tricksWon} trick${tricksWon > 1 ? "s" : ""} won`}
        >
          {tricksWon}✦
        </span>
      )}
      {isBidder && phase === "firstPhase" && !trumpRevealed && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="animate-trump-pulse ml-0.5 flex h-7 items-center rounded-md px-1"
          style={{ boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.6)", background: "rgba(224,160,64,0.1)" }}
          title="Has hidden trump card"
        >
          <CardBack size="16px" />
        </motion.span>
      )}
      {isBidder && trumpRevealed && hiddenTrumpCard && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="ml-0.5 flex h-7 items-center rounded-md px-1 gap-0.5"
          style={{ boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.8)", background: "rgba(224,160,64,0.15)" }}
          title="Trump card revealed"
        >
          <span className="font-card text-xs font-bold" style={{ color: hiddenTrumpCard.suit === "hearts" || hiddenTrumpCard.suit === "diamonds" ? "#b3261e" : "#201510" }}>
            {hiddenTrumpCard.rank}
          </span>
          <span className="text-[0.55rem] text-[var(--gold-bright)]">♚</span>
        </motion.span>
      )}
      {isThinking && (
        <span className="ml-0.5 flex items-end gap-[3px]">
          {[0, 1, 2].map(d => (
            <motion.span
              key={d}
              className="h-1 w-1 rounded-full bg-[var(--gold-bright)]"
              animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.18 }}
            />
          ))}
        </span>
      )}
    </div>
  );

  const opponentScale = { "--card-w": "calc(var(--card-w) * 0.6)" } as CSSProperties;

  return (
    <div className="relative flex flex-col items-center">
      {/* Winner glow */}
      {isWinner && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2, times: [0, 0.2, 0.75, 1] }}
        >
          <div
            className="absolute inset-0 rounded-2xl"
            style={{ boxShadow: "0 0 30px 8px rgba(224,160,64,0.6), inset 0 0 20px 4px rgba(224,160,64,0.4)", border: "1px solid rgba(255,230,176,0.85)" }}
          />
        </motion.div>
      )}

      {/* The fan — south & north are horizontal, east & west vertical */}
      <div className="flex flex-col items-center">
        {position === "north" && <div className="mb-1.5">{plate}</div>}

        <div
          className={`relative flex rounded-[calc(var(--card-r)*1.5)] p-1.5 ${
            isTurn && isHuman && !loading ? "animate-pulse-glow" : ""
          }`}
          style={isHuman ? undefined : opponentScale}
        >
          <div className="flex" style={fanStyle}>
            {cardEls}
          </div>
        </div>

        {(position === "south" || position === "east" || position === "west") && (
          <div className={vertical ? "mt-1.5" : "mt-1.5"}>{plate}</div>
        )}
      </div>
    </div>
  );
}
