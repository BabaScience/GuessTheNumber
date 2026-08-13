"use client";

import { useState } from "react";

import { DEFAULT_LEVEL_ID, LEVELS, type LevelId } from "@/lib/game";
import type { Duel } from "@/lib/use-duel";

type Props = { duel: Duel; name: string };

export function CreateScreen({ duel, name }: Props) {
  const [levelId, setLevelId] = useState<LevelId>(DEFAULT_LEVEL_ID);

  return (
    <main className="stage stage--center">
      <h2 className="eyebrow">How wide should the field be</h2>

      <div className="levels" role="radiogroup" aria-label="Difficulty">
        {LEVELS.map((level) => (
          <button
            key={level.id}
            type="button"
            role="radio"
            aria-checked={levelId === level.id}
            aria-label={`${level.name}, 1 to ${level.max}. ${level.note}`}
            className={`level ${levelId === level.id ? "is-on" : ""}`}
            onClick={() => setLevelId(level.id)}
          >
            <span className="level-range">1–{level.max}</span>
            <span className="level-name">{level.name}</span>
            <span className="level-note">{level.note}</span>
            <span className="level-par">≈{level.par} guesses if you play it perfectly</span>
          </button>
        ))}
      </div>

      {duel.error && <p className="note note--warn">{duel.error}</p>}

      <div className="choice">
        <button
          type="button"
          className="btn btn--solid"
          onClick={() => duel.create(name, levelId)}
          disabled={duel.busy}
        >
          {duel.busy ? "Opening…" : "Open the room"}
        </button>
        <button type="button" className="btn" onClick={() => duel.goHome()}>
          Back
        </button>
      </div>
    </main>
  );
}
