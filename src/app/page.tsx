"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CardBack } from "@/components/card";

export default function Home() {
  const router = useRouter();

  const startNewGame = async () => {
    const res = await fetch("/api/game/new", { method: "POST" });
    const { gameId } = await res.json();
    router.push(`/game/${gameId}`);
  };

  const cornerSuit = "font-card text-5xl text-[var(--gold)]/12 select-none";

  return (
    <main
      className="felt grain relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6"
      style={{ background: "radial-gradient(ellipse at center, #114A39 0%, #0B1E08 70%, #1F1307 100%)" }}
    >
      {/* Corner suit ornaments */}
      <span className={`${cornerSuit} absolute left-6 top-5`}>♠</span>
      <span className={`${cornerSuit} absolute right-6 top-5`}>♥</span>
      <span className={`${cornerSuit} absolute bottom-5 left-6`} style={{ transform: "rotate(180deg)" }}>♦</span>
      <span className={`${cornerSuit} absolute bottom-5 right-6`} style={{ transform: "rotate(180deg)" }}>♣</span>

      {/* Gold hairline frame */}
      <div className="pointer-events-none absolute inset-4 rounded-2xl"
        style={{ boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.25)" }} />

      <motion.div
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center gap-6"
      >
        {/* Fanned card backs behind the plaque */}
        <div className="relative">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, duration: 0.6 }}
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2"
            style={{ width: "17rem", height: "17rem" }}
          >
            {[-16, -8, 0, 8, 16].map((rot, i) => (
              <motion.div
                key={i}
                className="absolute left-1/2 top-1/2"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 4.5 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
              >
                <div
                  className="opacity-90"
                  style={{ transform: `translate(-50%, -50%) rotate(${rot}deg) translateX(${i * 14 - 28}px)` }}
                >
                  <CardBack size={92} ariaLabel="Decorative card" />
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Logo plaque */}
          <motion.div
            initial={{ scale: 0.82, rotateX: 18, opacity: 0 }}
            animate={{ scale: 1, rotateX: 0, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 190, damping: 18 }}
            className="relative z-10 rounded-lg p-[3px]"
            style={{
              background: "linear-gradient(180deg, #ffe6b0 0%, #9c6a1e 35%, #473f01 70%, #e0a040 100%)",
              boxShadow: "0 18px 44px rgba(0,0,0,0.6), 0 0 60px rgba(224,160,64,0.18)",
            }}
          >
            <div
              className="relative rounded-[calc(0.5rem-3px)] px-14 py-9 text-center sm:px-16"
              style={{
                background: "linear-gradient(165deg, #f7e2bf 0%, var(--card-face) 55%, #e2bc88 100%)",
                boxShadow: "inset 0 2px 5px rgba(255,255,255,0.6), inset 0 -4px 10px rgba(122,90,18,0.25)",
              }}
            >
              {/* Rivet corners */}
              <span className="absolute left-2 top-2 h-2 w-2 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #ffe6b0, #9c6a1e)" }} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #ffe6b0, #9c6a1e)" }} />
              <span className="absolute bottom-2 left-2 h-2 w-2 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #ffe6b0, #9c6a1e)" }} />
              <span className="absolute bottom-2 right-2 h-2 w-2 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #ffe6b0, #9c6a1e)" }} />

              {/* Suit pips flanking the numeral */}
              <span className="absolute left-6 top-1/2 -translate-y-1/2 font-card text-2xl text-red-900/70">♠</span>
              <span className="absolute right-6 top-1/2 -translate-y-1/2 font-card text-2xl text-red-900/70">♦</span>

              <span
                className="relative inline-block text-8xl font-black tracking-tighter text-red-900 sm:text-9xl"
                style={{ fontFamily: "var(--font-playfair), Georgia, serif", textShadow: "0 2px 0 rgba(255,255,255,0.35), 0 5px 14px rgba(122,26,10,0.35)" }}
              >
                28
              </span>
            </div>
          </motion.div>

          {/* Plaque ribbon — THURUPPU */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2"
          >
            <div
              className="rounded-full px-6 py-1.5 font-display text-sm font-bold uppercase tracking-[0.3em] text-[var(--cream)]"
              style={{
                background: "linear-gradient(180deg, #a04c0e, var(--header) 60%, #4a1c04)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.25), 0 0 0 2px rgba(224,160,64,0.45)",
              }}
            >
              Thuruppu
            </div>
          </motion.div>

          {/* Malayalam ribbon */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2 translate-y-1/2"
          >
            <div
              className="rounded-full px-4 py-0.5 font-ui text-[0.62rem] tracking-[0.2em] text-[var(--gold)]"
              style={{ background: "rgba(10,20,12,0.9)", boxShadow: "inset 0 0 0 1px rgba(224,160,64,0.4)" }}
            >
              ഇരുപത്തിയെട്ട്
            </div>
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-3 font-ui text-sm tracking-wide text-[var(--cream)]/70"
        >
          Kerala&apos;s Classic Card Game
        </motion.p>

        {/* Menu buttons */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="mt-2 flex flex-col gap-3.5"
        >
          <motion.button
            whileHover={{ scale: 1.04, boxShadow: "0 8px 26px rgba(224,160,64,0.45)" }}
            whileTap={{ scale: 0.97 }}
            onClick={startNewGame}
            className="relative w-64 overflow-hidden rounded-xl py-3.5 text-lg font-semibold text-[var(--cream)]"
            style={{ background: "linear-gradient(180deg, var(--btn-gradient-to), var(--btn-gradient-from))", boxShadow: "0 4px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.3)" }}
          >
            <span className="absolute inset-0 opacity-0 transition-opacity duration-300 hover:opacity-100"
              style={{ background: "linear-gradient(180deg, #ffc46e, #a04c0e)" }} />
            <span className="relative font-display uppercase tracking-[0.22em]">New Game</span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.04, boxShadow: "0 8px 26px rgba(224,160,64,0.35)" }}
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/settings")}
            className="relative w-64 overflow-hidden rounded-xl py-3.5 text-lg font-semibold text-[var(--cream)]/85"
            style={{ background: "linear-gradient(180deg, var(--btn-gradient-to), var(--btn-gradient-from))", boxShadow: "0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)" }}
          >
            <span className="relative font-display uppercase tracking-[0.22em]">Settings</span>
          </motion.button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85 }}
          className="mt-2 font-ui text-[0.62rem] uppercase tracking-[0.28em] text-[var(--cream)]/35"
        >
          ♠ You · Raman ♥ vs ♣ Krishnan · Kunjappu ♦
        </motion.p>
      </motion.div>
    </main>
  );
}
