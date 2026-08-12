"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CardFace, CardBack, SUIT_SYMBOL } from "./card";
import type { TrickCard, Suit, PlayerIndex } from "@/engine/types";
import type { SeatPosition } from "./table-config";

interface TrickAreaProps {
  cards: (TrickCard | null)[];
  winningPlayer: PlayerIndex | null;
  trumpSuit: Suit | null;
  trumpRevealed: boolean;
  hiddenTrump: boolean;
  /** The actual hidden trump card (null for non-bidder or if not set) */
  hiddenTrumpCard: import("@/engine/types").Card | null;
  busy: boolean;
  revealKey: number;
  /** Called when bidder clicks their hidden trump to peek */
  onPeekTrump?: () => void;
  /** Whether the peek is active (card is shown) */
  peekingTrump?: boolean;
}

const SLOT_POS: Record<SeatPosition, { className: string; rotate: number }> = {
  south: { className: "bottom-[4%] left-1/2 -translate-x-1/2", rotate: 0 },
  north: { className: "top-[4%] left-1/2 -translate-x-1/2", rotate: 180 },
  east: { className: "right-[4%] top-1/2 -translate-y-1/2", rotate: 90 },
  west: { className: "left-[4%] top-1/2 -translate-y-1/2", rotate: -90 },
};

const SLOT_INDEX: Record<SeatPosition, PlayerIndex> = {
  south: 0,
  east: 1,
  north: 2,
  west: 3,
};

const FLY_FROM: Record<SeatPosition, { x: number; y: number }> = {
  south: { x: 0, y: 70 },
  north: { x: 0, y: -70 },
  east: { x: 70, y: 0 },
  west: { x: -70, y: 0 },
};

export default function TrickArea({
  cards,
  winningPlayer,
  trumpSuit,
  trumpRevealed,
  hiddenTrump,
  hiddenTrumpCard,
  busy,
  revealKey,
  onPeekTrump,
  peekingTrump = false,
}: TrickAreaProps) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Diamond medallion */}
      <div
        className="medallion-border relative h-[clamp(9.5rem,30vw,13.5rem)] w-[clamp(9.5rem,30vw,13.5rem)] rotate-45 rounded-[1.4rem] p-[3px]"
        style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.55), 0 0 40px rgba(224,160,64,0.12)" }}
      >
        <div
          className="relative h-full w-full rounded-[1.25rem]"
          style={{
            background:
              "radial-gradient(circle at 50% 40%, #17483a 0%, #0d2b1d 55%, #081708 100%)",
            boxShadow: "inset 0 0 24px rgba(0,0,0,0.6)",
          }}
        >
          {/* Inner stitch texture */}
          <div className="felt-stitch absolute inset-0 rounded-[1.25rem] opacity-60" />

          {/* Counter-rotated content plane */}
          <div className="absolute inset-0 -rotate-45">
            {/* Trump seal at center — removed per user request */}

            {/* Played card slots */}
            {(Object.keys(SLOT_POS) as SeatPosition[]).map(position => {
              const slot = SLOT_POS[position];
              const slotIdx = SLOT_INDEX[position];
              const trickCard = cards[slotIdx];
              const from = FLY_FROM[position];
              const isWinner = winningPlayer === slotIdx;

              return (
                <div
                  key={position}
                  className={`absolute ${slot.className}`}
                  style={{ width: "clamp(2.1rem, 6.5vw, 3rem)" }}
                >
                  <AnimatePresence>
                    {trickCard ? (
                      <motion.div
                        key={`${trickCard.card.suit}-${trickCard.card.rank}-${slotIdx}`}
                        initial={{ opacity: 0, scale: 0.5, x: from.x, y: from.y, rotate: slot.rotate + 25 }}
                        animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: slot.rotate }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className={isWinner ? "relative" : ""}
                      >
                        {isWinner && (
                          <motion.div
                            className="pointer-events-none absolute -inset-2 z-10 rounded-xl"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 0.6] }}
                            transition={{ duration: 1.4 }}
                            style={{ boxShadow: "0 0 22px 6px rgba(224,160,64,0.75)" }}
                          />
                        )}
                        <CardFace
                          card={trickCard.card}
                          size="100%"
                          className={isWinner ? "brightness-110" : ""}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key={`empty-${position}-${revealKey}`}
                        className="flex items-center justify-center rounded-[var(--card-r)] border border-dashed border-[var(--gold)]/20"
                        style={{ aspectRatio: "1 / 1.42", opacity: 0.35 }}
                      >
                        <span className="font-card text-[var(--gold)]/40" style={{ fontSize: "0.8rem" }}>
                          ✦
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
