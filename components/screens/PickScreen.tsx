"use client";

import { useState } from "react";

import type { PublicPlayer, PublicRoom } from "@/lib/protocol";
import { validateSecret } from "@/lib/game";
import type { Duel } from "@/lib/use-duel";

type Props = {
  duel: Duel;
  room: PublicRoom;
  me: PublicPlayer;
  foe: PublicPlayer | null;
};

export function PickScreen({ duel, room, me, foe }: Props) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState("");

  const digits = String(room.max).length;

  const submit = () => {
    const value = Number.parseInt(draft, 10);
    const check = validateSecret(Number.isNaN(value) ? NaN : value, room.max);
    if (!check.ok) {
      setProblem(check.reason);
      return;
    }
    setProblem("");
    duel.lockSecret(value);
  };

  if (me.hasSecret) {
    return (
      <main className="stage stage--center">
        <h2 className="eyebrow">Locked in</h2>
        <div className="locked">
          <span className="locked-label">Your number</span>
          <span className="locked-val">{me.secret}</span>
        </div>
        <p className="note">
          {foe?.name ?? "Your opponent"} will be hunting this. Only you can see it.
        </p>
        <div className="waiting">
          <span className="dot" />
          <span>Waiting on {foe?.name ?? "your opponent"} to choose</span>
        </div>
      </main>
    );
  }

  return (
    <main className="stage stage--center">
      <h2 className="eyebrow">Choose the number they&apos;ll be hunting</h2>

      <div className="secret-in">
        <span className="secret-caret">#</span>
        <input
          className="input input--secret"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          placeholder="—"
          style={{ width: `${digits + 1}ch` }}
          aria-label={`Your secret number, 1 to ${room.max}`}
          autoFocus
          onChange={(event) =>
            setDraft(event.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, digits))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
      </div>

      <p className="note">Anything from 1 to {room.max}. Only you can see it.</p>
      {(problem || duel.error) && <p className="note note--warn">{problem || duel.error}</p>}

      <button
        type="button"
        className="btn btn--solid"
        onClick={submit}
        disabled={duel.busy || !draft}
      >
        {duel.busy ? "Locking…" : "Lock it in"}
      </button>

      {foe?.hasSecret && (
        <div className="waiting">
          <span className="dot dot--foe" />
          <span>{foe.name} has already picked</span>
        </div>
      )}
    </main>
  );
}
