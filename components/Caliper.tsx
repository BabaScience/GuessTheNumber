"use client";

import type { Guess } from "@/lib/game";

type Props = {
  lo: number;
  hi: number;
  max: number;
  tone: "you" | "foe";
  guesses: Guess[];
};

/**
 * The live picture of how far a hunter has narrowed the field: two jaws close
 * in on the surviving range, past guesses stay pinned where they fell.
 */
export function Caliper({ lo, hi, max, tone, guesses }: Props) {
  const pct = (v: number) => ((v - 1) / Math.max(1, max - 1)) * 100;
  const left = pct(lo);
  const right = 100 - pct(hi);
  const remaining = Math.max(0, hi - lo + 1);
  const latest = guesses.length ? guesses[guesses.length - 1] : null;
  // Density of the tick pattern, so 1–10 and 1–1000 both read clearly.
  const step = max <= 10 ? 1 : max <= 100 ? 5 : 50;

  return (
    <div className={`cal cal--${tone}`}>
      <div className="cal-track">
        <div className="cal-ticks" style={{ backgroundSize: `${(step / max) * 100}% 100%` }} />
        <div className="cal-zone" style={{ left: `${left}%`, right: `${right}%` }} />
        <div className="cal-jaw cal-jaw--l" style={{ left: `${left}%` }} />
        <div className="cal-jaw cal-jaw--r" style={{ right: `${right}%` }} />
        {guesses.map((g, i) => (
          <span
            key={`${g.value}-${i}`}
            className={`cal-mark cal-mark--${g.result}`}
            style={{ left: `${pct(g.value)}%` }}
            aria-hidden="true"
          />
        ))}
        {latest && (
          <span className="cal-pin" style={{ left: `${pct(latest.value)}%` }} aria-hidden="true">
            <span className="cal-pin-label">{latest.value}</span>
          </span>
        )}
      </div>
      <div className="cal-read">
        <span className="cal-end">{lo}</span>
        <span className="cal-count">
          {remaining.toLocaleString()} {remaining === 1 ? "number" : "numbers"} left
        </span>
        <span className="cal-end">{hi}</span>
      </div>
    </div>
  );
}
