"use client";

import type { Guess } from "@/lib/game";

const LABEL: Record<Guess["result"], string> = {
  higher: "go higher",
  lower: "go lower",
  correct: "exact",
};

const ARROW: Record<Guess["result"], string> = {
  higher: "↑",
  lower: "↓",
  correct: "★",
};

type Props = {
  guesses: Guess[];
  tone: "you" | "foe";
  empty: string;
};

export function GuessLog({ guesses, tone, empty }: Props) {
  if (guesses.length === 0) return <p className="log-empty">{empty}</p>;

  return (
    <ol className={`log log--${tone}`}>
      {guesses
        .map((guess, index) => ({ guess, turn: index + 1 }))
        // Newest first — that's the one you're reacting to.
        .reverse()
        .map(({ guess, turn }) => (
          <li key={turn} className={`log-row log-row--${guess.result}`}>
            <span className="log-n">{String(turn).padStart(2, "0")}</span>
            <span className="log-v">{guess.value}</span>
            <span className="log-r">
              <span className="log-arrow">{ARROW[guess.result]}</span>
              {LABEL[guess.result]}
            </span>
          </li>
        ))}
    </ol>
  );
}
