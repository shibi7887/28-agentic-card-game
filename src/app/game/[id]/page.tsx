"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import GameTable, { type PendingPlay } from "@/components/game-table";
import type { PlayerViewState, LegalMove } from "@/engine/types";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;

  const [view, setView] = useState<PlayerViewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentLog, setAgentLog] = useState<string[]>([]);

  // Transient plays for the center-medallion animation
  const [latestBatch, setLatestBatch] = useState<PendingPlay[]>([]);
  const [batchId, setBatchId] = useState(0);
  const viewRef = useRef<PlayerViewState | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/game/${gameId}/state`);
      const data = await res.json();
      if (data.error) setError(data.error);
      else setView(data.view);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  // On initial load, fetch once then poll until it's the human's turn
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/game/${gameId}/state`);
        const data = await res.json();
        if (data.error) { setError(data.error); setLoading(false); return; }
        if (cancelled) return;
        const v = data.view as PlayerViewState;
        setView(v);
        setLoading(false);
        // If it's not the human's turn yet (e.g. agent bidding first), poll
        if (
          v.currentPlayer !== v.playerIndex &&
          v.phase !== 'finished' &&
          v.phase !== 'scoring'
        ) {
          await pollUntilHumanTurn();
        }
      } catch (e) {
        if (!cancelled) { setError((e as Error).message); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const submitMove = async (move: LegalMove) => {
    setLoading(true);

    // Optimistically show the human's card flying to the table
    if (move.type === "playCard" && viewRef.current) {
      setLatestBatch([
        {
          player: viewRef.current.playerIndex,
          card: move.card,
          agentName: "You",
          moveType: "playCard",
        },
      ]);
      setBatchId(id => id + 1);
    }

    try {
      const batch: PendingPlay[] = [];

      const res = await fetch(`/api/game/${gameId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      setView(data.view);
      if (data.agentActions?.length) {
        const logEntries: string[] = [];
        for (const a of data.agentActions) {
          if (a.move?.type === "playCard") {
            batch.push({
              player: a.player,
              card: a.move.card,
              agentName: a.name,
              moveType: "playCard",
            });
          }
          logEntries.push(`${a.name}: ${a.reasoning}`);
        }
        setAgentLog(prev => [...prev, ...logEntries]);
      }
      setLatestBatch(batch);
      setBatchId(id => id + 1);

      // Poll for remaining agent turns until it's the human's turn
      await pollUntilHumanTurn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const pollUntilHumanTurn = async () => {
    const maxPolls = 40; // safety limit
    for (let i = 0; i < maxPolls; i++) {
      const res = await fetch(`/api/game/${gameId}/state`);
      const data = await res.json();
      if (data.error) break;

      const newView = data.view as PlayerViewState;
      setView(newView);

      // Animate agent card plays from polling
      const aa = data.agentAction;
      if (aa && aa.move?.type === 'playCard') {
        setLatestBatch([{
          player: aa.player,
          card: aa.move.card,
          agentName: aa.name,
          moveType: 'playCard',
        }]);
        setBatchId(id => id + 1);
      }
      if (aa?.reasoning) {
        setAgentLog(prev => [...prev, `${aa.name}: ${aa.reasoning}`]);
      }

      // Stop when it's the human's turn, game is finished, or in scoring
      if (
        newView.currentPlayer === newView.playerIndex ||
        newView.phase === 'finished' ||
        newView.phase === 'scoring'
      ) {
        break;
      }

      // Short delay between polls — gives time for card animation
      await new Promise(r => setTimeout(r, 1800));
    }
  };

  // Keep a ref of the latest view for move submission
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  if (loading && !view) {
    return (
      <div
        className="felt grain relative flex min-h-screen flex-col items-center justify-center"
        style={{ background: "radial-gradient(ellipse at center, #114A39 0%, #0B1E08 70%, #1F1307 100%)" }}
      >
        <div className="animate-spin-slow flex h-20 w-20 rotate-45 items-center justify-center rounded-2xl"
          style={{ background: "linear-gradient(180deg, #8c4006, #4a1c04)", boxShadow: "0 0 30px rgba(224,160,64,0.3), inset 0 0 0 2px rgba(224,160,64,0.6)" }}>
          <span className="-rotate-45 font-card text-3xl text-[var(--gold)]">♠</span>
        </div>
        <p className="mt-5 font-display text-sm uppercase tracking-[0.3em] text-[var(--gold)]/80">
          Dealing the cards
        </p>
        <div className="mt-3 flex gap-1.5">
          {[0, 1, 2].map(d => (
            <span
              key={d}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--gold-bright)]"
              style={{ animationDelay: `${d * 0.18}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="felt grain relative flex min-h-screen items-center justify-center"
        style={{ background: "radial-gradient(ellipse at center, #114A39 0%, #0B1E08 70%, #1F1307 100%)" }}
      >
        <div className="w-full max-w-sm rounded-2xl p-[2px]" style={{ background: "linear-gradient(180deg, #e07a5f, #473f01)" }}>
          <div className="rounded-[calc(1rem-2px)] bg-[#190d03] px-6 py-8 text-center">
            <span className="font-card text-3xl text-[#e07a5f]">✕</span>
            <p className="mt-2 font-display text-lg font-bold text-[var(--cream)]">Something went wrong</p>
            <p className="mt-1 font-ui text-xs text-[var(--cream)]/60">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="mt-5 h-10 w-full rounded-xl font-display text-xs font-bold uppercase tracking-[0.22em] text-[var(--frame)]"
              style={{ background: "linear-gradient(180deg, var(--btn-gradient-to), var(--btn-gradient-from))" }}
            >
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!view) return null;

  const concede = async () => {
    try {
      const res = await fetch(`/api/game/${gameId}/concede`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setView(data.view);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const resolveRound = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/game/${gameId}/resolve`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setView(data.view);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GameTable
      view={view}
      loading={loading}
      agentLog={agentLog}
      latestBatch={latestBatch}
      batchId={batchId}
      onMove={submitMove}
      onConcede={concede}
      onResolve={resolveRound}
      onExit={() => router.push("/")}
    />
  );
}
