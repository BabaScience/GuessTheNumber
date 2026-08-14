"use client";

import { useEffect, useRef, useState } from "react";

import { GuessChips } from "@/components/GuessChips";
import { Keypad } from "@/components/Keypad";
import { Petals } from "@/components/Petals";
import { RangeMeter } from "@/components/RangeMeter";
import { boundsFor, validateGuess, type PlayerView } from "@/lib/game";
import { buzz } from "@/lib/haptics";
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

const VERDICT: Record<string, string> = {
  higher: "Go higher ↑",
  lower: "Go lower ↓",
  correct: "That's it ✓",
};

export function DuelScreen({ duel, room, me, foe }: Props) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState("");
  const [foeOpen, setFoeOpen] = useState(false);

  const over = room.phase === "over";
  const myTurn = !over && room.turnPlayerId === me.id;
  const iWon = room.winnerId === me.id;
  const mine = boundsFor(asView(me), room.max);
  const theirs = boundsFor(asView(foe), room.max);
  const digits = String(room.max).length;

  /* ---- cues for things that happen while you're watching ---------------- */

  const foeCount = useRef(foe.guesses.length);
  const ended = useRef(false);

  useEffect(() => {
    if (foe.guesses.length > foeCount.current) {
      const latest = foe.guesses[foe.guesses.length - 1];
      if (latest && latest.result !== "correct") {
        play(latest.result);
        buzz("nudge");
      }
    }
    foeCount.current = foe.guesses.length;
  }, [foe.guesses]);

  useEffect(() => {
    if (over && !ended.current) {
      ended.current = true;
      play(iWon ? "correct" : "lose");
      buzz(iWon ? "win" : "lose");
    }
    if (!over) ended.current = false;
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
      buzz("refuse");
      setProblem(check.reason);
      return;
    }
    setProblem("");
    setDraft("");
    duel.guess(value);
  };

  const message = problem || duel.error;
  const lastMine = me.guesses.length ? me.guesses[me.guesses.length - 1] : null;

  /* ---- the end --------------------------------------------------------- */

  if (over) {
    return (
      <>
        {iWon && <Petals />}
        <div className="stage stage--center">
          <div className={`result ${iWon ? "result--win" : ""}`}>
            <span className="result-k">{iWon ? "You won" : `${foe.name} won`}</span>
            <h2 className="result-title">
              {iWon ? "Got it." : "So close."}
            </h2>
            <p className="result-sub">
              {iWon
                ? `You found ${foe.secret} in ${me.guesses.length} ${
                    me.guesses.length === 1 ? "guess" : "guesses"
                  }.`
                : `${foe.name} found your ${me.secret} in ${foe.guesses.length} ${
                    foe.guesses.length === 1 ? "guess" : "guesses"
                  }.`}
            </p>

            {/* Just the two names: "Grace's number" wraps on a narrow phone,
                and the heading above already says what these are. */}
            <div className="reveal-row">
              <div className="reveal reveal--you">
                <div className="reveal-who">You hid</div>
                <div className="reveal-n">{me.secret}</div>
              </div>
              <div className="reveal reveal--foe">
                <div className="reveal-who">{foe.name} hid</div>
                <div className="reveal-n">{foe.secret}</div>
              </div>
            </div>
          </div>

          <div className="choice">
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => duel.rematch()}
              disabled={duel.busy}
            >
              {duel.busy ? "Dealing…" : "Play again"}
            </button>
            <button type="button" className="btn btn--block" onClick={() => duel.leave()}>
              Leave the room
            </button>
          </div>
        </div>
      </>
    );
  }

  /* ---- the round ------------------------------------------------------- */

  return (
    <div className={`duel ${duel.flash ? `flash-${duel.flash}` : ""}`}>
      <div className={`turn ${myTurn ? "" : "turn--wait"}`} aria-live="polite">
        <div className="turn-k">
          {myTurn ? (
            "Your move"
          ) : (
            <>
              <span className="dot dot--foe" />
              {foe.name}
            </>
          )}
        </div>
        <p className="turn-v">
          {myTurn
            ? `It's between ${mine.lo} and ${mine.hi}`
            : foe.online
              ? "is taking a shot at your number"
              : "seems to have stepped away…"}
        </p>
        {myTurn && lastMine && (
          <p className="turn-hint">
            {lastMine.value} was too {lastMine.result === "higher" ? "low" : "high"}
          </p>
        )}
      </div>

      <div className="meter-wrap">
        <RangeMeter {...mine} max={room.max} tone="you" />
      </div>

      <div className="chips-wrap">
        <GuessChips guesses={me.guesses} tone="you" empty="No guesses yet — anything goes." />
      </div>

      <div className="foe-col">
        <button
          type="button"
          className="foe-strip"
          onClick={() => setFoeOpen((open) => !open)}
          aria-expanded={foeOpen}
        >
          <span className="foe-av">{foe.name.slice(0, 1).toUpperCase()}</span>
          <span>
            <span className="foe-name">{foe.name}</span>
            <span className="foe-sub">
              {foe.guesses.length === 0
                ? `hunting your ${me.secret}`
                : `${theirs.lo}–${theirs.hi} · ${foe.guesses.length} ${
                    foe.guesses.length === 1 ? "guess" : "guesses"
                  }`}
            </span>
          </span>
          <span className="foe-last">
            {foe.guesses.length
              ? foe.guesses[foe.guesses.length - 1]!.value
              : "—"}
          </span>
        </button>

        {foeOpen && (
          <div className="foe-body">
            <div className="foe-secret">
              <span>They&apos;re hunting</span>
              <b>{me.secret}</b>
            </div>
            <RangeMeter {...theirs} max={room.max} tone="foe" />
            <GuessChips guesses={foe.guesses} tone="foe" empty="They haven't guessed yet." />
          </div>
        )}
      </div>

      <div className="padzone">
        {myTurn && message ? (
          <p className="note note--warn" style={{ textAlign: "center" }}>
            {message}
          </p>
        ) : myTurn && duel.flash && VERDICT[duel.flash] ? (
          <p className="verdict">{VERDICT[duel.flash]}</p>
        ) : null}

        <div className="readout">
          <span className="readout-hash">#</span>
          <span className={`readout-n ${draft ? "" : "is-empty"}`}>{draft || "—"}</span>
        </div>

        <Keypad
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          disabled={!myTurn || duel.busy}
          maxDigits={digits}
        />

        {!myTurn && (
          <p className="note" style={{ textAlign: "center" }}>
            Waiting for {foe.name} to guess…
          </p>
        )}
      </div>
    </div>
  );
}
