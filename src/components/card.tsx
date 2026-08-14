"use client";

import type { CSSProperties } from "react";
import type { Card, Suit } from "@/engine/types";

export const SUIT_SYMBOL: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

export function isRedSuit(suit: Suit): boolean {
  return suit === "hearts" || suit === "diamonds";
}

/** Red for hearts/diamonds, deep ink for spades/clubs — classic poker ink */
function suitColor(suit: Suit): string {
  return isRedSuit(suit) ? "#b3261e" : "#201510";
}

interface CardFaceProps {
  card: Card;
  /** width; number px or CSS length — defaults to the responsive --card-w variable */
  size?: number | string;
  elevated?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

/** CSS-only card face — ivory, gold hairline, serif corners */
export function CardFace({
  card,
  size,
  elevated,
  dimmed,
  onClick,
  className = "",
  style,
}: CardFaceProps) {
  const ink = suitColor(card.suit);

  const rootStyle: CSSProperties = {
    width: size,
    aspectRatio: "1 / 1.42",
    ...style,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${card.rank} of ${card.suit}`}
      className={`relative shrink-0 select-none rounded-[var(--card-r)] font-card transition-all duration-200 ${
        dimmed ? "opacity-65 saturate-[0.55]" : "opacity-100"
      } ${onClick ? "cursor-pointer hover:brightness-105 active:scale-[0.97]" : "cursor-default"} ${
        elevated ? "-translate-y-2.5 shadow-[0_14px_20px_-6px_rgba(0,0,0,0.6)]" : ""
      } ${className}`}
      style={rootStyle}
    >
      {/* Ivory face */}
      <div
        className="absolute inset-0 overflow-hidden rounded-[var(--card-r)]"
        style={{
          background:
            "linear-gradient(165deg, #f7e2bf 0%, var(--card-face) 55%, #e2bc88 100%)",
          boxShadow:
            "inset 0 0 0 1px rgba(122, 90, 18, 0.55), inset 0 2px 4px rgba(255,255,255,0.75), inset 0 -3px 6px rgba(122, 90, 18, 0.28), 0 3px 7px rgba(0,0,0,0.45)",
        }}
      >
        {/* Corner watermark diamonds */}
        <div className="absolute -right-4 -top-4 h-12 w-12 rotate-45 opacity-[0.07]" style={{ background: ink }} />
        <div className="absolute -bottom-4 -left-4 h-12 w-12 rotate-45 opacity-[0.07]" style={{ background: ink }} />

        {/* Center pip */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: ink, textShadow: "0 1px 0 rgba(255,255,255,0.5)" }}
        >
          <span
            className="font-card"
            style={{ fontSize: "clamp(1.1rem, 2.6cqw + 0.55rem, 2.3rem)", lineHeight: 1 }}
          >
            {SUIT_SYMBOL[card.suit]}
          </span>
        </div>

        {/* Corner indices */}
        <div
          className="absolute left-[7%] top-[4%] flex flex-col items-center leading-none"
          style={{ color: ink }}
        >
          <span className="font-card font-bold" style={{ fontSize: "clamp(0.72rem, 1.5cqw + 0.4rem, 1.35rem)" }}>
            {card.rank}
          </span>
          <span className="font-card" style={{ fontSize: "clamp(0.62rem, 1.2cqw + 0.35rem, 1.1rem)" }}>
            {SUIT_SYMBOL[card.suit]}
          </span>
        </div>

        <div
          className="absolute bottom-[4%] right-[7%] flex rotate-180 flex-col items-center leading-none"
          style={{ color: ink }}
        >
          <span className="font-card font-bold" style={{ fontSize: "clamp(0.72rem, 1.5cqw + 0.4rem, 1.35rem)" }}>
            {card.rank}
          </span>
          <span className="font-card" style={{ fontSize: "clamp(0.62rem, 1.2cqw + 0.35rem, 1.1rem)" }}>
            {SUIT_SYMBOL[card.suit]}
          </span>
        </div>
      </div>
    </button>
  );
}

interface CardBackProps {
  size?: number | string;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

/** CSS-only card back — burnt sienna crosshatch with a gold diamond seal */
export function CardBack({ size, onClick, className = "", style, ariaLabel }: CardBackProps) {
  const rootStyle: CSSProperties = {
    width: size,
    aspectRatio: "1 / 1.42",
    ...style,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={ariaLabel ?? "Card back"}
      className={`relative shrink-0 select-none rounded-[var(--card-r)] transition-all duration-200 ${
        onClick ? "cursor-pointer" : "cursor-default"
      } ${className}`}
      style={rootStyle}
    >
      <div
        className="card-back-pattern absolute inset-0 overflow-hidden rounded-[var(--card-r)]"
        style={{
          boxShadow:
            "inset 0 0 0 1px rgba(240, 211, 171, 0.35), inset 0 2px 3px rgba(255,255,255,0.12), inset 0 -3px 6px rgba(0,0,0,0.5), 0 3px 7px rgba(0,0,0,0.5)",
        }}
      >
        {/* Inner hairline */}
        <div
          className="absolute inset-[7%] rounded-[calc(var(--card-r)*0.6)]"
          style={{ boxShadow: "inset 0 0 0 1px rgba(224, 160, 64, 0.55)" }}
        />
        {/* Center diamond seal */}
        <div
          className="absolute left-1/2 top-1/2 h-[46%] w-[30%] -translate-x-1/2 -translate-y-1/2 rotate-45"
          style={{
            background: "linear-gradient(135deg, #5a2a10, var(--card-back-dark) 60%)",
            boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.65), 0 0 6px rgba(224,160,64,0.35)",
          }}
        >
          <div
            className="absolute left-1/2 top-1/2 h-[38%] w-[38%] -translate-x-1/2 -translate-y-1/2"
            style={{ background: "radial-gradient(circle, rgba(247,158,66,0.5), transparent 70%)" }}
          />
        </div>
      </div>
    </button>
  );
}
