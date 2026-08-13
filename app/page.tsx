"use client";

import { useEffect, useState } from "react";

import { CreateScreen } from "@/components/screens/CreateScreen";
import { DuelScreen } from "@/components/screens/DuelScreen";
import { HomeScreen } from "@/components/screens/HomeScreen";
import { JoinScreen } from "@/components/screens/JoinScreen";
import { LobbyScreen } from "@/components/screens/LobbyScreen";
import { PickScreen } from "@/components/screens/PickScreen";
import { loadName, saveName } from "@/lib/client";
import { normalizeCode, opponentOf } from "@/lib/game";
import { initSound, setMuted } from "@/lib/sound";
import { useDuel } from "@/lib/use-duel";

export default function Page() {
  const duel = useDuel();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [muted, setMutedState] = useState(false);

  /*
   * Restore the display name and the mute preference.
   *
   * These live in localStorage, which does not exist while the page is being
   * prerendered, so they cannot be lazy useState initialisers without causing a
   * hydration mismatch. This runs once on mount and never again — the cascading
   * re-render the lint rule guards against is a single extra pass here.
   */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(loadName());
    setMutedState(initSound());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (name) saveName(name);
  }, [name]);

  /**
   * An invite link lands as /?room=CODE. Pre-fill the join screen and tidy the
   * URL, so a refresh mid-game doesn't try to re-join a room you're already in.
   */
  useEffect(() => {
    if (duel.restoring) return;
    const params = new URLSearchParams(window.location.search);
    const invited = params.get("room");
    if (!invited) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (duel.stage === "home") {
      // Reading window.location is inherently a post-mount job, and this fires
      // at most once per page load.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCode(normalizeCode(invited));
      duel.setStage("join");
    }
    // Only react to the restore finishing; `duel` is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel.restoring]);

  const room = duel.room;
  const me = room && duel.myId ? room.players[duel.myId] ?? null : null;
  const foe = room && duel.myId ? opponentOf(room, duel.myId) : null;

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  return (
    <div className="hld">
      <header className="top">
        <button
          type="button"
          className="wordmark"
          onClick={() => duel.stage !== "room" && duel.goHome()}
          aria-label="Higher / Lower — home"
        >
          <span className="wm-up">↑</span>
          <span className="wm-txt">Higher</span>
          <span className="wm-slash">/</span>
          <span className="wm-txt">Lower</span>
          <span className="wm-dn">↓</span>
        </button>

        <div className="top-meta">
          {room && duel.stage === "room" && (
            <>
              {me && foe && (
                <span className="chip chip--score" title="Rounds won">
                  <span className="score-you">{me.wins}</span>
                  <span className="score-sep">–</span>
                  <span className="score-foe">{foe.wins}</span>
                </span>
              )}
              <span className="chip">{room.code}</span>
              <span className="chip chip--ghost">1–{room.max}</span>
            </>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? "Unmute sound" : "Mute sound"}
            title={muted ? "Sound off" : "Sound on"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          {duel.stage === "room" && (
            <button type="button" className="link" onClick={() => duel.leave()}>
              Leave
            </button>
          )}
        </div>
      </header>

      {duel.offline && (
        <div className="offline" role="status">
          Lost touch with the server — still trying…
        </div>
      )}

      {duel.restoring ? (
        <main className="stage stage--center">
          <div className="waiting">
            <span className="dot" />
            <span>Looking for your game…</span>
          </div>
        </main>
      ) : duel.stage === "home" ? (
        <HomeScreen duel={duel} name={name} onNameChange={setName} />
      ) : duel.stage === "create" ? (
        <CreateScreen duel={duel} name={name} />
      ) : duel.stage === "join" ? (
        <JoinScreen
          duel={duel}
          name={name}
          onNameChange={setName}
          code={code}
          onCodeChange={setCode}
        />
      ) : room && me ? (
        room.phase === "lobby" ? (
          <LobbyScreen room={room} onLeave={() => duel.leave()} />
        ) : room.phase === "pick" ? (
          <PickScreen duel={duel} room={room} me={me} foe={foe} />
        ) : foe ? (
          // Keyed on the round so a rematch remounts with a clean keypad
          // rather than inheriting whatever was half-typed when it ended.
          <DuelScreen key={room.round} duel={duel} room={room} me={me} foe={foe} />
        ) : null
      ) : (
        <main className="stage stage--center">
          <div className="waiting">
            <span className="dot" />
            <span>Loading the room…</span>
          </div>
        </main>
      )}
    </div>
  );
}
