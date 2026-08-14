"use client";

import { MAX_NAME_LENGTH } from "@/lib/game";
import type { Duel } from "@/lib/use-duel";

type Props = {
  duel: Duel;
  name: string;
  onNameChange: (next: string) => void;
};

export function HomeScreen({ duel, name, onNameChange }: Props) {
  return (
    <main className="stage stage--center">
      <h1 className="title">Two numbers, two players, one winner.</h1>
      <p className="lede">
        You each hide a number. Take turns guessing — every miss tells you higher
        or lower. First to land it exactly takes the round.
      </p>

      <label className="field">
        <span className="field-label">What should we call you?</span>
        <input
          className="input"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Anonymous"
          autoComplete="nickname"
          onChange={(event) => onNameChange(event.target.value)}
        />
      </label>

      {duel.error && <p className="note note--warn">{duel.error}</p>}

      <div className="choice">
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => duel.setStage("create")}
        >
          Start a room
        </button>
        <button
          type="button"
          className="btn btn--block"
          onClick={() => duel.setStage("join")}
        >
          Join with a code
        </button>
      </div>

      <ol className="howto">
        <li>
          <span className="howto-n">1</span>One of you opens a room and shares the code.
        </li>
        <li>
          <span className="howto-n">2</span>You each pick a number in secret.
        </li>
        <li>
          <span className="howto-n">3</span>Guess in turns and close in.
        </li>
      </ol>
    </main>
  );
}
