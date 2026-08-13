"use client";

import { useEffect, useRef, useState } from "react";

import { Caliper } from "@/components/Caliper";
import { GuessLog } from "@/components/GuessLog";
import { Keypad } from "@/components/Keypad";
import { boundsFor, optimalRemaining, validateGuess, type PlayerView } from "@/lib/game";
import type { PublicPlayer, PublicRoom } from "@/lib/protocol";
import { play } from "@/lib/sound";
import type { Duel } from "@/lib/use-duel";

type Props = {
  duel: Duel;
  room: PublicRoom;
  me: PublicPlayer;
  foe: PublicPlayer;
};

/** PublicPlayer already satisfies PlayerView; this just names the narrowing. */
const asView = (p: PublicPlayer): PlayerView => p;

export function DuelScreen({ duel, room, me, foe }: Props) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState("");

  const over = room.phase === "over";
  const myTurn = !over && room.turnPlayerId === me.id;
  const iWon = room.winnerId === me.id;
  const myBounds = boundsFor(asView(me), room.max);
  const foeBounds = boundsFor(asView(foe), room.max);
  const digits = String(room.max).length;

  /* ---- sound cues for things that happen while you're watching ---------- */
  const foeGuessCount = useRef(foe.guesses.length);
  const endedRef = useRef(false);

  useEffect(() => {
    if (foe.guesses.length > foeGuessCount.current) {
      const latest = foe.guesses[foe.guesses.length - 1];
      if (latest && latest.result !== "correct") play(latest.result);
    }
    foeGuessCount.current = foe.guesses.length;
  }, [foe.guesses]);

  useEffect(() => {
    if (over && !endedRef.current) {
      endedRef.current = true;
      play(iWon ? "correct" : "lose");
    }
    if (!over) endedRef.current = false;
  }, [over, iWon]);

  /* ---- submitting ------------------------------------------------------ */

  const submit = () => {
    if (!myTurn || duel.busy) return;
    const value = Number.parseInt(draft, 10);
    if (Number.isNaN(value)) {
      setProblem("Type a number first.");
      return;
    }
    const check = validateGuess(asView(me), value, room.max);
    if (!check.ok) {
      setProblem(check.reason);
      return;
    }
    setProblem("");
    setDraft("");
    duel.guess(value);
  };

  const message = problem || duel.error;

  return (
    <main className="stage">
      {/* -------- banner -------- */}
      {over ? (
        <div className={`banner banner--end ${iWon ? "banner--win" : "banner--loss"}`}>
          <span className="banner-tag">{iWon ? "You won" : `${foe.name} won`}</span>
          <span className="banner-txt">
            {iWon
              ? `You landed ${foe.secret} in ${me.guesses.length} ${
                  me.guesses.length === 1 ? "guess" : "guesses"
                }.`
              : `They found your ${me.secret} in ${foe.guesses.length} ${
                  foe.guesses.length === 1 ? "guess" : "guesses"
                }. Theirs was ${foe.secret}.`}
          </span>
        </div>
      ) : (
        <div className={`banner ${myTurn ? "banner--mine" : ""}`} aria-live="polite">
          {myTurn ? (
            <>
              <span className="banner-tag">Your move</span>
              <span className="banner-txt">
                Name a number between {myBounds.lo} and {myBounds.hi}
                {optimalRemaining(asView(me), room.max) > 0 && (
                  <span className="banner-hint">
                    {" "}
                    · {optimalRemaining(asView(me), room.max)} left at best play
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              <span className="banner-tag banner-tag--wait">
                <span className="dot dot--foe" />
                {foe.name}
              </span>
              <span className="banner-txt">
                {foe.online ? "is taking a shot at your number" : "seems to have dropped out…"}
              </span>
            </>
          )}
        </div>
      )}

      {/* -------- the two hunts -------- */}
      <div className="panes">
        <section className={`pane pane--you ${duel.flash ? `flash-${duel.flash}` : ""}`}>
          <header className="pane-head">
            <span className="pane-who">Your hunt</span>
            <span className="pane-sub">
              chasing {foe.name}
              {over && foe.secret !== null ? ` · it was ${foe.secret}` : ""}
            </span>
          </header>

          <Caliper {...myBounds} max={room.max} tone="you" guesses={me.guesses} />

          {!over && (
            <div className="turnbox">
              <div className={`turn-display ${myTurn ? "is-live" : ""}`}>
                <span className="turn-hash">#</span>
                <span className="turn-val">{draft || "—"}</span>
              </div>
              <Keypad
                value={draft}
                onChange={setDraft}
                onSubmit={submit}
                disabled={!myTurn || duel.busy}
                maxDigits={digits}
              />
              {!myTurn && <p className="note note--dim">Hold tight — it&apos;s their turn.</p>}
              {myTurn && message && <p className="note note--warn">{message}</p>}
            </div>
          )}

          <GuessLog guesses={me.guesses} tone="you" empty="No guesses yet." />
        </section>

        <section className="pane pane--foe">
          <header className="pane-head">
            <span className="pane-who">{foe.name}&apos;s hunt</span>
            <span className="pane-sub">chasing your number</span>
          </header>

          <Caliper {...foeBounds} max={room.max} tone="foe" guesses={foe.guesses} />

          <div className="foe-secret">
            <span className="fs-label">Your number</span>
            <span className="fs-val">{me.secret}</span>
          </div>

          <GuessLog guesses={foe.guesses} tone="foe" empty="They haven't guessed yet." />
        </section>
      </div>

      {over && (
        <div className="choice choice--end">
          <button
            type="button"
            className="btn btn--solid"
            onClick={() => duel.rematch()}
            disabled={duel.busy}
          >
            {duel.busy ? "Dealing…" : "Play again"}
          </button>
          <button type="button" className="btn" onClick={() => duel.leave()}>
            Leave the room
          </button>
        </div>
      )}
    </main>
  );
}
