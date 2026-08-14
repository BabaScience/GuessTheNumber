"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import * as api from "./client";
import { ApiError } from "./client";
import { isNewerRoom, type Credentials, type PublicRoom } from "./protocol";
import type { GuessResult } from "./game";


export type Stage = "home" | "create" | "join" | "room";

/** How often to re-poll, given what we're waiting for. */
function pollDelay(room: PublicRoom | null, myId: string | null): number {
  if (!room) return 1500;
  switch (room.phase) {
    case "lobby":
      return 1200; // waiting for someone to walk in
    case "pick":
      return 1200;
    case "duel":
      // On your own turn nothing can change until you move, so ease off.
      return room.turnPlayerId === myId ? 3000 : 900;
    case "over":
      return 2500; // just watching for a rematch
  }
}

const MAX_POLL_FAILURES = 3;

export type Duel = ReturnType<typeof useDuel>;

export function useDuel() {
  const [stage, setStage] = useState<Stage>("home");
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [restoring, setRestoring] = useState(true);
  /** Set briefly after your own guess resolves, to drive the feedback flash. */
  const [flash, setFlash] = useState<GuessResult | null>(null);

  // Refs so the polling loop always reads current values without restarting.
  const credentialsRef = useRef<Credentials | null>(null);
  const roomRef = useRef<PublicRoom | null>(null);
  const failuresRef = useRef(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myId = credentials?.playerId ?? null;

  const applyRoom = useCallback((next: PublicRoom) => {
    // Poll replies can arrive out of order behind an action's reply; never let
    // an older snapshot overwrite a newer one. Decided once, so the ref and the
    // rendered state cannot drift apart.
    if (!isNewerRoom(roomRef.current, next)) return;
    setRoom(next);
    roomRef.current = next;
  }, []);

  const remember = useCallback((creds: Credentials) => {
    credentialsRef.current = creds;
    setCredentials(creds);
    api.saveCredentials(creds);
  }, []);

  const forget = useCallback(() => {
    credentialsRef.current = null;
    roomRef.current = null;
    setCredentials(null);
    setRoom(null);
    api.clearCredentials();
  }, []);

  const goHome = useCallback(() => {
    forget();
    setStage("home");
    setError("");
    setOffline(false);
  }, [forget]);

  /* ---- polling -------------------------------------------------------- */

  const poll = useCallback(async () => {
    const creds = credentialsRef.current;
    if (!creds) return;
    try {
      const since = roomRef.current?.rev;
      const res = await api.fetchRoom(creds, since);
      failuresRef.current = 0;
      setOffline(false);
      if (api.isUnchanged(res)) {
        const current = roomRef.current;
        if (current) applyRoom(api.applyPresence(current, res.online));
      } else {
        applyRoom(res.room);
      }
    } catch (err) {
      // A 404 or 401 from the shared store is the truth, not a routing
      // accident: the room really has expired, or this seat isn't ours.
      if (err instanceof ApiError && (err.status === 404 || err.status === 401)) {
        forget();
        setStage("home");
        setError(
          err.status === 404 ? "That room is gone. Start a new one." : err.message,
        );
        return;
      }
      failuresRef.current += 1;
      if (failuresRef.current >= MAX_POLL_FAILURES) setOffline(true);
    }
  }, [applyRoom, forget]);

  useEffect(() => {
    if (stage !== "room" || !credentials) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      if (cancelled) return;
      // Keep polling while the tab is hidden, just slowly. Stopping outright
      // would let the presence heartbeat lapse, and a player who ducks away to
      // paste the room code would show up to their opponent as having quit.
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      await poll();
      if (cancelled) return;
      timer = setTimeout(loop, hidden ? 5000 : pollDelay(roomRef.current, credentials.playerId));
    };

    void loop();

    const onWake = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        void loop();
      }
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [stage, credentials, poll]);

  /* ---- restore a session on load -------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = api.loadCredentials();
      if (!saved) {
        if (!cancelled) setRestoring(false);
        return;
      }
      try {
        const res = await api.fetchRoom(saved);
        if (cancelled) return;
        if (!api.isUnchanged(res)) {
          credentialsRef.current = saved;
          setCredentials(saved);
          applyRoom(res.room);
          setStage("room");
        }
      } catch {
        // The room is gone or the token is stale — start fresh, quietly.
        api.clearCredentials();
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyRoom]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  /* ---- actions -------------------------------------------------------- */

  /** Wraps an action with the busy flag and turns thrown errors into a message. */
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, []);

  const create = useCallback(
    (name: string, levelId: string) =>
      run(async () => {
        const res = await api.createRoom(name, levelId);
        remember(res.credentials);
        applyRoom(res.room);
        setStage("room");
      }),
    [run, remember, applyRoom],
  );

  const join = useCallback(
    (code: string, name: string) =>
      run(async () => {
        const res = await api.joinRoom(code, name);
        remember(res.credentials);
        applyRoom(res.room);
        setStage("room");
      }),
    [run, remember, applyRoom],
  );

  const lockSecret = useCallback(
    (value: number) =>
      run(async () => {
        const creds = credentialsRef.current;
        if (!creds) return;
        applyRoom((await api.lockSecret(creds, value)).room);
      }),
    [run, applyRoom],
  );

  const guess = useCallback(
    (value: number) =>
      run(async () => {
        const creds = credentialsRef.current;
        if (!creds) return;
        const res = await api.sendGuess(creds, value);
        applyRoom(res.room);
        setFlash(res.result.result);
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => setFlash(null), 900);
      }),
    [run, applyRoom],
  );

  const rematch = useCallback(
    () =>
      run(async () => {
        const creds = credentialsRef.current;
        if (!creds) return;
        applyRoom((await api.requestRematch(creds)).room);
      }),
    [run, applyRoom],
  );

  const leave = useCallback(async () => {
    const creds = credentialsRef.current;
    goHome();
    if (creds) await api.leaveRoom(creds).catch(() => undefined);
  }, [goHome]);

  return {
    stage,
    setStage,
    room,
    credentials,
    myId,
    error,
    setError,
    busy,
    offline,
    restoring,
    flash,
    create,
    join,
    lockSecret,
    guess,
    rematch,
    leave,
    goHome,
  };
}
