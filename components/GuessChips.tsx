"use client";

import type { Guess } from "@/lib/game";

const ARROW: Record<Guess["result"], string> = {
  higher: "↑",
  lower: "↓",
  correct: "✓",
};

type Props = {
  guesses: Guess[];
  tone: "you" | "foe";
  empty: string;
};

/**
 * Past guesses as a scrollable row rather than a stacked log. The list was
 * eating the vertical space the keypad needs on a phone, and newest-first in a
 * horizontal strip is quicker to scan than a table you have to read down.
 */
export function GuessChips({ guesses, tone, empty }: Props) {
  if (guesses.length === 0) return <p className="chips-empty">{empty}</p>;

  return (
    <div
      className={`chips chips--${tone}`}
      role="list"
      aria-label={tone === "you" ? "Your guesses" : "Their guesses"}
    >
      {guesses
        .slice()
        .reverse()
        .map((guess, i) => (
          <span
            key={`${guesses.length - i}-${guess.value}`}
            role="listitem"
            className={`chip chip--${guess.result}`}
          >
            {guess.value}
            <span className="chip-dir">{ARROW[guess.result]}</span>
          </span>
        ))}
    </div>
  );
}
