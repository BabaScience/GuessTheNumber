"use client";

import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/ThemeToggle";
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

  useEffect(() => {
    /*
     * The display name and mute preference live in localStorage, which does not
     * exist while the page is prerendered — so these cannot be lazy useState
     * initialisers without a hydration mismatch. Runs once on mount.
     */
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(loadName());
    setMutedState(initSound());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (name) saveName(name);
  }, [name]);

  /**
   * An invite link arrives as /?room=CODE. Pre-fill the join screen and tidy
   * the URL, so a refresh mid-game doesn't try to re-join a room you're in.
   */
  useEffect(() => {
    if (duel.restoring) return;
    const invited = new URLSearchParams(window.location.search).get("room");
    if (!invited) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (duel.stage === "home") {
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
  const inRoom = duel.stage === "room" && room;

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="mark"
          onClick={() => duel.stage !== "room" && duel.goHome()}
          aria-label="Higher / Lower — home"
        >
          Higher<span className="mark-slash">/</span>Lower
        </button>

        {inRoom && (
          <>
            {me && foe && (
              <span className="pill" title="Rounds won">
                <span className="score-you">{me.wins}</span>
                <span className="score-sep">–</span>
                <span className="score-foe">{foe.wins}</span>
              </span>
            )}
            <span className="pill pill--code">{room.code}</span>
          </>
        )}

        <button
          type="button"
          className="icon-btn"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
        >
          {muted ? (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M9.5 4 5.8 7H3v6h2.8l3.7 3V4Z" strokeLinejoin="round" />
              <path d="m13 8 4 4M17 8l-4 4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M9.5 4 5.8 7H3v6h2.8l3.7 3V4Z" strokeLinejoin="round" />
              <path d="M13 7.5a3.5 3.5 0 0 1 0 5M15.3 5a7 7 0 0 1 0 10" strokeLinecap="round" />
            </svg>
          )}
        </button>

        <ThemeToggle />

        {inRoom && (
          <button type="button" className="link" onClick={() => duel.leave()}>
            Leave
          </button>
        )}
      </header>

      {duel.offline && (
        <div className="banner-offline" role="status">
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
