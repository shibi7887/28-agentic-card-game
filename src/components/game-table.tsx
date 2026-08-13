"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import HeaderBanner from "./header-banner";
import PlayerSeat from "./player-seat";
import TrickArea from "./trick-area";
import BidPanel from "./bid-panel";
import RoundResult from "./round-result";
import { SEATS } from "./table-config";
import type { Card, LegalMove, PlayerIndex, PlayerViewState, TrickCard, Phase } from "@/engine/types";

export interface PendingPlay {
  player: PlayerIndex;
  card: Card;
  agentName?: string;
  moveType: string;
}

interface GameTableProps {
  view: PlayerViewState;
  loading: boolean;
  agentLog: string[];
  latestBatch: PendingPlay[];
  batchId: number;
  onMove: (move: LegalMove) => void;
  onConcede: () => void;
  onResolve: () => void;
  onExit: () => void;
}

export function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "bidding": return "Bidding";
    case "selectingTrump": return "Select Trump";
    case "rebidding": return "Rebid (24+)";
    case "firstPhase": return "Play · Trump Hidden";
    case "secondPhase": return "Play · Trump Active";
    case "scoring": return "Round Complete";
    case "finished": return "Game Over";
    default: return "Dealing";
  }
}

const EMPTY_TRICK: (TrickCard | null)[] = [null, null, null, null];

export default function GameTable({
  view,
  loading,
  agentLog,
  latestBatch,
  batchId,
  onMove,
  onConcede,
  onResolve,
  onExit,
}: GameTableProps) {
  const isHumanTurn = view.currentPlayer === view.playerIndex;
  const humanTeam = view.teamIndex;

  // ── Center medallion display state ──────────────────────────────
  const [displayCards, setDisplayCards] = useState<(TrickCard | null)[]>(EMPTY_TRICK);
  const [winningPlayer, setWinningPlayer] = useState<PlayerIndex | null>(null);
  const [revealKey, setRevealKey] = useState(0);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [peekingTrump, setPeekingTrump] = useState(false);
  const [showPoints, setShowPoints] = useState(true);
  const [showResult, setShowResult] = useState(false);
  const [dismissDecided, setDismissDecided] = useState(false);

  // Reset dismiss when a new round starts (tricks reset to empty)
  useEffect(() => {
    if (view.tricks.length === 0) setDismissDecided(false);
  }, [view.tricks.length]);

  // Delay the round-result overlay so the last trick stays visible
  useEffect(() => {
    if (view.roundResult !== null || view.winner !== null) {
      const t = setTimeout(() => setShowResult(true), 3000);
      return () => clearTimeout(t);
    }
    setShowResult(false);
  }, [view.roundResult, view.winner]);

  const prevTrickCount = useRef(view.tricks.length);
  const prevCurTrick = useRef<(TrickCard | null)[]>(view.currentTrick.cards);
  const prevTrumpRevealed = useRef(view.trumpRevealed);

  useEffect(() => {
    const newCount = view.tricks.length;
    const trickCompleted = newCount > prevTrickCount.current;

    // Don't clear cards when game is in scoring/finished — keep last trick visible
    if (view.phase === 'scoring' || view.phase === 'finished') {
      if (newCount === 8 && displayCards.some(c => c !== null)) {
        // Keep last trick visible
        return;
      }
    }

    if (trickCompleted) {
      // Reconstruct the completed trick: cards that were on the table before,
      // plus this cycle's plays that do NOT belong to the next (in-progress) trick.
      const filled: (TrickCard | null)[] = [...prevCurTrick.current];
      for (const p of latestBatch) {
        const inNextTrick = view.currentTrick.cards.some(
          c => c !== null && c.card.suit === p.card.suit && c.card.rank === p.card.rank,
        );
        if (!inNextTrick && filled[p.player] === null) {
          filled[p.player] = { card: p.card, player: p.player };
        }
      }
      setDisplayCards(filled);
      setWinningPlayer(view.tricks[newCount - 1].winner);

      const isLastTrick = newCount === 8;
      const holdTime = isLastTrick ? 4000 : 3000;

      const t = setTimeout(() => {
        if (!isLastTrick) {
          setDisplayCards([...view.currentTrick.cards]);
        }
        // For last trick, keep cards visible — round result will clear them
        setWinningPlayer(null);
      }, holdTime);
      prevTrickCount.current = newCount;
      prevCurTrick.current = [...view.currentTrick.cards];
      return () => clearTimeout(t);
    }

    // Normal case — current trick plus this cycle's plays
    const merged: (TrickCard | null)[] = [...view.currentTrick.cards];
    for (const p of latestBatch) {
      if (merged[p.player] === null) {
        merged[p.player] = { card: p.card, player: p.player };
      }
    }
    setDisplayCards(merged);
    setWinningPlayer(null);
    prevTrickCount.current = newCount;
    prevCurTrick.current = [...view.currentTrick.cards];

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, batchId]);

  // Trump reveal — replay flip animation
  useEffect(() => {
    if (view.trumpRevealed && !prevTrumpRevealed.current) {
      setRevealKey(k => k + 1);
    }
    prevTrumpRevealed.current = view.trumpRevealed;
  }, [view.trumpRevealed]);

  // Clear selection and peek when the hand changes
  useEffect(() => {
    setSelectedCard(null);
    setPeekingTrump(false);
  }, [view.hand.length, view.phase]);

  // ── Derived data ────────────────────────────────────────────────
  const legalCards = useMemo<Card[]>(() => {
    const cards: Card[] = [];
    for (const m of view.legalMoves) {
      if (m.type === "playCard" || m.type === "selectTrump") {
        if (!cards.some(c => c.suit === m.card.suit && c.rank === m.card.rank)) {
          cards.push(m.card);
        }
      }
    }
    return cards;
  }, [view.legalMoves]);

  const tricksWonBy = useMemo(() => {
    const counts: Record<PlayerIndex, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const t of view.tricks) counts[t.winner] = (counts[t.winner] ?? 0) + 1;
    return counts;
  }, [view.tricks]);

  // Running card points won by each team in the current round
  const teamRoundPoints = useMemo(() => {
    let team0 = 0;
    let team1 = 0;
    for (const t of view.tricks) {
      if (t.winner === 0 || t.winner === 2) team0 += t.points;
      else team1 += t.points;
    }
    return { team0, team1 };
  }, [view.tricks]);

  const canCallTrump = view.legalMoves.some(m => m.type === "callTrump");
  const canShowPair = view.legalMoves.some(m => m.type === "showPair");

  // ── Hand interaction ────────────────────────────────────────────
  const handleCardClick = (card: Card) => {
    if (!isHumanTurn || loading) return;
    if (view.phase === "selectingTrump") {
      setSelectedCard(prev =>
        prev && prev.suit === card.suit && prev.rank === card.rank ? null : card,
      );
      return;
    }
    if (
      selectedCard &&
      selectedCard.suit === card.suit &&
      selectedCard.rank === card.rank
    ) {
      onMove({ type: "playCard", card });
      return;
    }
    setSelectedCard(card);
  };

  const confirmSelection = () => {
    if (!selectedCard) return;
    if (view.phase === "selectingTrump") {
      onMove({ type: "selectTrump", card: selectedCard });
    } else {
      onMove({ type: "playCard", card: selectedCard });
    }
  };

  // ── Status line ─────────────────────────────────────────────────
  const status = loading
    ? "The table is thinking"
    : view.phase === "bidding"
      ? isHumanTurn ? "Place your bid" : "Waiting for bids"
      : view.phase === "rebidding"
        ? isHumanTurn ? "Raise the bid to 24+ or pass" : "Opponent considering rebid…"
        : view.phase === "selectingTrump"
          ? isHumanTurn ? "Pick the trump suit" : "Choosing trump…"
          : view.phase === "scoring"
            ? "Round complete"
            : view.phase === "finished"
              ? "Match over"
              : canShowPair
                ? "Play a card or show your pair"
                : "Your turn — play a card";

  return (
    <div className="felt grain relative flex min-h-screen flex-col" style={{ background: "radial-gradient(ellipse at center, #114A39 0%, #0B1E08 70%, #1F1307 100%)" }}>
      <HeaderBanner
        scores={view.scores}
        humanTeam={humanTeam}
        phase={view.phase}
        phaseLabel={phaseLabel(view.phase)}
        trumpSuit={view.trumpSuit}
        trumpRevealed={view.trumpRevealed}
        trumpCard={view.trumpCard}
        bid={view.bid}
        trickNumber={view.trickNumber}
        winner={view.winner}
        currentBidder={view.currentPlayer}
        biddingActive={view.phase === 'bidding'}
      />

      {/* Running team points — toggleable */}
      <div className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-center gap-3 px-4 pt-2">
        <button
          type="button"
          onClick={() => setShowPoints(p => !p)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1 font-ui text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[var(--cream)]/60 transition-colors hover:text-[var(--gold)]"
          style={{ boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.3)", background: "rgba(0,0,0,0.2)" }}
        >
          <span>{showPoints ? "▾" : "▸"} Points</span>
        </button>
        {showPoints && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="flex items-center gap-4 overflow-hidden"
          >
            <span className="font-ui text-[0.72rem] text-[var(--cream)]/75">
              <span className="font-bold text-[var(--gold-bright)]">{teamRoundPoints.team0}</span> Your Team
            </span>
            <span className="text-[var(--gold)]/30">·</span>
            <span className="font-ui text-[0.72rem] text-[var(--cream)]/75">
              <span className="font-bold text-[var(--gold-bright)]">{teamRoundPoints.team1}</span> Opponents
            </span>
            <span className="font-ui text-[0.6rem] text-[var(--cream)]/45">/ 28</span>
          </motion.div>
        )}
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col px-2 pb-8 pt-3 sm:px-6">
        {/* North seat */}
        <div className="mb-1 flex justify-center">
          <PlayerSeat
            position="north"
            name={SEATS[2].name}
            role={SEATS[2].role}
            isHuman={false}
            handCount={view.partnerHandCount}
            isTurn={view.currentPlayer === 2}
            isThinking={loading && !isHumanTurn}
            isDealer={view.dealer === 2}
            isBidder={view.bid?.bidder === 2}
            trumpRevealed={view.trumpRevealed}
            hiddenTrumpCard={view.hiddenTrumpCard}
            trumpSuit={view.trumpSuit}
            trumpCard={view.trumpCard}
            isWinner={winningPlayer === 2}
            tricksWon={tricksWonBy[2]}
            legalCards={[]}
            selectedCard={null}
            loading={loading}
            phase={view.phase}
            onCardClick={() => {}}
          />
        </div>

        {/* Middle row: West · Medallion · East */}
        <div className="my-1 grid grid-cols-3 items-center gap-1 sm:gap-4">
          <div className="flex justify-center sm:justify-start">
            <PlayerSeat
              position="west"
              name={SEATS[3].name}
              role={SEATS[3].role}
              isHuman={false}
              handCount={view.opponentHandCounts[1]}
              isTurn={view.currentPlayer === 3}
              isThinking={loading && !isHumanTurn}
              isDealer={view.dealer === 3}
              isBidder={view.bid?.bidder === 3}
              trumpRevealed={view.trumpRevealed}
              trumpSuit={view.trumpSuit}
              trumpCard={view.trumpCard}
              hiddenTrumpCard={view.hiddenTrumpCard}
              isWinner={winningPlayer === 3}
              tricksWon={tricksWonBy[3]}
              legalCards={[]}
              selectedCard={null}
              loading={loading}
              phase={view.phase}
              onCardClick={() => {}}
            />
          </div>

          <div className="flex justify-center">
              <TrickArea
                cards={displayCards}
                winningPlayer={winningPlayer}
                trumpSuit={view.trumpSuit}
                trumpRevealed={view.trumpRevealed}
                hiddenTrump={view.phase === "firstPhase"}
                hiddenTrumpCard={view.hiddenTrumpCard}
                busy={loading}
                revealKey={revealKey}
                onPeekTrump={
                  view.hiddenTrumpCard ? () => setPeekingTrump(p => !p) : undefined
                }
                peekingTrump={peekingTrump}
              />
          </div>

          <div className="flex justify-center sm:justify-end">
            <PlayerSeat
              position="east"
              name={SEATS[1].name}
              role={SEATS[1].role}
              isHuman={false}
              handCount={view.opponentHandCounts[0]}
              isTurn={view.currentPlayer === 1}
              isThinking={loading && !isHumanTurn}
              isDealer={view.dealer === 1}
              isBidder={view.bid?.bidder === 1}
              trumpRevealed={view.trumpRevealed}
              trumpSuit={view.trumpSuit}
              trumpCard={view.trumpCard}
              hiddenTrumpCard={view.hiddenTrumpCard}
              isWinner={winningPlayer === 1}
              tricksWon={tricksWonBy[1]}
              legalCards={[]}
              selectedCard={null}
              loading={loading}
              phase={view.phase}
              onCardClick={() => {}}
            />
          </div>
        </div>

        {/* South — human seat */}
        <div className="mt-1 flex justify-center">
          <PlayerSeat
            position="south"
            name={SEATS[0].name}
            role={SEATS[0].role}
            isHuman
            hand={view.hand}
            isTurn={isHumanTurn}
            isThinking={false}
            isDealer={view.dealer === 0}
            isBidder={view.bid?.bidder === 0}
            trumpRevealed={view.trumpRevealed}
            hiddenTrumpCard={view.hiddenTrumpCard}
            trumpSuit={view.trumpSuit}
            trumpCard={view.trumpCard}
            isWinner={winningPlayer === 0}
            tricksWon={tricksWonBy[0]}
            legalCards={legalCards}
            selectedCard={selectedCard}
            loading={loading}
            phase={view.phase}
            onCardClick={handleCardClick}
          />
        </div>

        {/* Control strip */}
        <div className="mt-4 flex flex-col items-center gap-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={status}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-center gap-2"
            >
              {loading && (
                <span className="flex gap-1">
                  {[0, 1, 2].map(d => (
                    <motion.span
                      key={d}
                      className="h-1.5 w-1.5 rounded-full bg-[var(--gold-bright)]"
                      animate={{ y: [0, -5, 0], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.2 }}
                    />
                  ))}
                </span>
              )}
              <span
                className={`font-display text-[0.78rem] font-bold uppercase tracking-[0.24em] ${
                  isHumanTurn && !loading ? "text-[var(--gold)]" : "text-[var(--cream)]/60"
                }`}
              >
                {status}
              </span>
              {isHumanTurn && !loading && view.phase !== "scoring" && view.phase !== "finished" && (
                <span className="animate-pulse-glow rounded-full px-2 py-0.5 font-ui text-[0.55rem] font-bold uppercase tracking-[0.18em] text-[var(--frame)]"
                  style={{ background: "linear-gradient(180deg, var(--gold-bright), var(--btn-gradient-from))" }}>
                  Your turn
                </span>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Concede — end the match early (configurable) */}
          {view.allowConcede && view.phase !== "finished" && view.phase !== "scoring" && !loading && (
            <button
              type="button"
              onClick={onConcede}
              className="rounded-full px-3 py-1 font-ui text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-[var(--cream)]/50 transition-colors hover:text-[#e07a5f] hover:shadow-[inset_0_0_0_1px_rgba(224,122,95,0.5)]"
              style={{ boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.25)", background: "rgba(0,0,0,0.15)" }}
            >
              Concede
            </button>
          )}

          {/* Round already decided — stop or continue */}
          {view.roundDecided?.decided && !dismissDecided && view.phase !== "finished" && view.phase !== "scoring" && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-2 rounded-xl px-4 py-3"
              style={{ boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.5)", background: "rgba(224,160,64,0.08)" }}
            >
              <p className="text-center font-ui text-[0.72rem] text-[var(--gold)]">
                Round decided — {view.roundDecided.winner === view.teamIndex ? "your team" : "opponents"} will win.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onResolve}
                  disabled={loading}
                  className="rounded-lg px-4 py-1.5 font-display text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[var(--frame)] disabled:opacity-50"
                  style={{ background: "linear-gradient(180deg, var(--btn-gradient-to), var(--btn-gradient-from))" }}
                >
                  Stop round
                </button>
                <button
                  type="button"
                  onClick={() => setDismissDecided(true)}
                  className="rounded-lg px-4 py-1.5 font-ui text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[var(--cream)]/80"
                  style={{ boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.5)" }}
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {/* Bid grid — bidding (14+) and rebidding (24+) */}
          {(view.phase === "bidding" || view.phase === "rebidding") && isHumanTurn && !loading && (
            <BidPanel
              legalMoves={view.legalMoves}
              currentBid={view.bid}
              bidHistory={view.bidHistory}
              onMove={onMove}
            />
          )}

          {/* Trump selection / confirmation */}
          {view.phase === "selectingTrump" && isHumanTurn && !loading && (
            <div className="flex flex-col items-center gap-2">
              <p className="font-ui text-xs text-[var(--cream)]/70">
                {view.changingTrump
                  ? "Bid raised — you may change the trump suit, or keep the current one"
                  : selectedCard
                    ? `Trump will be ${selectedCard.rank}${selectedCard.suit === "hearts" ? "♥" : selectedCard.suit === "diamonds" ? "♦" : selectedCard.suit === "clubs" ? "♣" : "♠"} — it stays hidden in your hand until called`
                    : "Tap a card to set the trump suit"}
              </p>
              <div className="flex gap-2">
                {view.changingTrump && (
                  <button
                    type="button"
                    onClick={() => onMove({ type: "keepTrump" })}
                    className="h-11 rounded-xl px-6 font-display text-sm font-bold uppercase tracking-[0.2em]"
                    style={{
                      background: "linear-gradient(180deg, #ffb45e, #d97b12)",
                      boxShadow: "0 3px 10px rgba(0,0,0,0.45)",
                      color: "var(--frame)",
                    }}
                  >
                    Keep Trump
                  </button>
                )}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={confirmSelection}
                  disabled={!selectedCard}
                  className={`h-11 rounded-xl px-10 font-display text-sm font-bold uppercase tracking-[0.24em] transition-opacity ${
                    selectedCard ? "" : "opacity-40"
                  }`}
                  style={{
                    background: "linear-gradient(180deg, var(--btn-gradient-to), var(--btn-gradient-from))",
                    boxShadow: "0 3px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35)",
                    color: "var(--frame)",
                  }}
                >
                  {view.changingTrump ? "Change Trump" : "Confirm Trump"}
                </motion.button>
              </div>
            </div>
          )}

          {/* Play-phase action buttons */}
          {(view.phase === "firstPhase" || view.phase === "secondPhase") && isHumanTurn && !loading && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {selectedCard && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={confirmSelection}
                  className="h-10 rounded-xl px-6 font-display text-xs font-bold uppercase tracking-[0.22em] text-[var(--frame)]"
                  style={{ background: "linear-gradient(180deg, var(--btn-gradient-to), var(--btn-gradient-from))", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
                >
                  Play {selectedCard.rank}
                </motion.button>
              )}
              {canCallTrump && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onMove({ type: "callTrump" })}
                  className="h-10 rounded-xl px-6 font-display text-xs font-bold uppercase tracking-[0.22em] text-[var(--frame)]"
                  style={{ background: "linear-gradient(180deg, #ffb45e, #d97b12)", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
                >
                  Call Trump
                </motion.button>
              )}
              {canShowPair && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onMove({ type: "showPair" })}
                  className="h-10 rounded-xl px-6 font-display text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-bright)]"
                  style={{ boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.6), 0 2px 8px rgba(0,0,0,0.3)", background: "rgba(224,160,64,0.1)" }}
                >
                  Show Pair
                </motion.button>
              )}
            </div>
          )}

          {/* Completed tricks ribbon */}
          {view.tricks.length > 0 && view.phase !== "scoring" && view.phase !== "finished" && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="font-ui text-[0.58rem] uppercase tracking-[0.18em] text-[var(--cream)]/45">
                Tricks
              </span>
              <div className="flex gap-1">
                {view.tricks.map((t, i) => {
                  const name = SEATS[t.winner as PlayerIndex]?.name ?? `P${t.winner}`;
                  return (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-ui text-[0.58rem] font-bold text-[var(--frame)]"
                      style={{
                        background: "linear-gradient(180deg, #ffe6b0, var(--gold) 60%, #9c6a1e)",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
                      }}
                      title={`Won by ${name}`}
                    >
                      {t.points}
                    </motion.span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Table talk — agent reasoning log */}
        {agentLog.length > 0 && (
          <div className="mx-auto mt-6 w-full max-w-md">
            <details className="group">
              <summary className="flex cursor-pointer select-none items-center justify-center gap-2 font-ui text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-[var(--cream)]/45 transition-colors hover:text-[var(--gold)]">
                <span className="h-px w-6 bg-current" />
                Table Talk ({agentLog.length})
                <span className="h-px w-6 bg-current" />
              </summary>
              <div className="thin-scroll mt-2 max-h-44 space-y-1.5 overflow-y-auto rounded-xl p-3"
                style={{ background: "rgba(0,0,0,0.3)", boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.15)" }}>
                {agentLog.map((entry, i) => {
                  const sep = entry.indexOf(":");
                  const name = sep > 0 ? entry.slice(0, sep) : "";
                  const text = sep > 0 ? entry.slice(sep + 1).trim() : entry;
                  return (
                    <motion.p
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-xs leading-snug"
                    >
                      <span className="font-display font-bold text-[var(--gold)]">{name}</span>
                      <span className="text-[var(--cream)]/55"> — {text}</span>
                    </motion.p>
                  );
                })}
              </div>
            </details>
          </div>
        )}
      </main>

      {/* Round result / match end overlay */}
      <AnimatePresence>
        {showResult && view.roundResult && (
          <RoundResult
            biddingTeamWon={view.roundResult.biddingTeamWon}
            bidAmount={view.roundResult.bidAmount}
            biddingTeamPoints={view.roundResult.biddingTeamPoints}
            defendingTeamPoints={view.roundResult.defendingTeamPoints}
            pointsChange={view.roundResult.pointsChange}
            humanTeam={humanTeam}
            winner={view.winner}
            onNextRound={() => onMove({ type: "nextRound" })}
            onExit={onExit}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
