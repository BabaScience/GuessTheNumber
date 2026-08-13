import React, { useState, useEffect, useRef, useCallback } from "react";

/* ------------------------------------------------------------------ */
/* storage helpers                                                     */
/* ------------------------------------------------------------------ */

const RK = (code) => `hld:room:${code}`;

async function loadRoom(code) {
  try {
    const r = await window.storage.get(RK(code), true);
    return r ? JSON.parse(r.value) : null;
  } catch {
    return null;
  }
}

async function saveRoom(room) {
  try {
    await window.storage.set(RK(room.code), JSON.stringify(room), true);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* pure game logic                                                     */
/* ------------------------------------------------------------------ */

const LEVELS = [
  { id: "quick", max: 10, name: "Quick", note: "Ten numbers. Over in a blink." },
  { id: "classic", max: 100, name: "Classic", note: "The one everybody knows." },
  { id: "brutal", max: 1000, name: "Brutal", note: "Ten guesses if you're sharp." },
];

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  let s = "";
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function hashCode(code) {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 9973;
  return h;
}

function seats(room) {
  if (!room) return [];
  return room.order.map((id) => room.players[id]).filter(Boolean);
}

function opponentOf(room, pid) {
  const other = room.order.find((id) => id !== pid);
  return other ? room.players[other] : null;
}

function phaseOf(room) {
  if (!room) return "none";
  const s = seats(room);
  if (s.length < 2) return "lobby";
  if (s.some((p) => p.secret == null)) return "pick";
  if (s.some((p) => p.guesses.some((g) => g.result === "correct"))) return "over";
  return "duel";
}

function winnerOf(room) {
  return (
    seats(room).find((p) => p.guesses.some((g) => g.result === "correct")) || null
  );
}

/* whose turn — derived, so both clients always agree */
function starterIndex(room) {
  return (hashCode(room.code) + room.round) % 2;
}

function turnPid(room) {
  const total = seats(room).reduce((n, p) => n + p.guesses.length, 0);
  const idx = (starterIndex(room) + total) % 2;
  return room.order[idx];
}

/* the window a hunter has narrowed the target down to */
function boundsFor(player, max) {
  let lo = 1;
  let hi = max;
  for (const g of player.guesses) {
    if (g.result === "higher") lo = Math.max(lo, g.value + 1);
    if (g.result === "lower") hi = Math.min(hi, g.value - 1);
  }
  return { lo, hi };
}

/* ------------------------------------------------------------------ */
/* small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function Caliper({ lo, hi, max, tone, latest }) {
  const pct = (v) => ((v - 1) / Math.max(1, max - 1)) * 100;
  const left = pct(lo);
  const right = 100 - pct(hi);
  const remaining = Math.max(0, hi - lo + 1);
  const step = max <= 10 ? 1 : max <= 100 ? 5 : 50;

  return (
    <div className={`cal cal--${tone}`}>
      <div className="cal-track">
        <div
          className="cal-ticks"
          style={{ backgroundSize: `${(step / max) * 100}% 100%` }}
        />
        <div className="cal-zone" style={{ left: `${left}%`, right: `${right}%` }} />
        <div className="cal-jaw cal-jaw--l" style={{ left: `${left}%` }} />
        <div className="cal-jaw cal-jaw--r" style={{ right: `${right}%` }} />
        {latest != null && (
          <div className="cal-pin" style={{ left: `${pct(latest)}%` }} />
        )}
      </div>
      <div className="cal-read">
        <span className="cal-end">{lo}</span>
        <span className="cal-count">
          {remaining} {remaining === 1 ? "number" : "numbers"} left
        </span>
        <span className="cal-end">{hi}</span>
      </div>
    </div>
  );
}

function GuessLog({ guesses, tone, empty }) {
  if (!guesses.length) return <p className="log-empty">{empty}</p>;
  return (
    <ol className={`log log--${tone}`}>
      {guesses
        .slice()
        .reverse()
        .map((g, i) => (
          <li key={guesses.length - i} className={`log-row log-row--${g.result}`}>
            <span className="log-n">{String(guesses.length - i).padStart(2, "0")}</span>
            <span className="log-v">{g.value}</span>
            <span className="log-r">
              {g.result === "correct"
                ? "exact"
                : g.result === "higher"
                ? "go higher ↑"
                : "go lower ↓"}
            </span>
          </li>
        ))}
    </ol>
  );
}

function Keypad({ value, onChange, onSubmit, disabled }) {
  const tap = (k) => {
    if (disabled) return;
    if (k === "del") onChange(value.slice(0, -1));
    else if (value.length < 4) onChange((value + k).replace(/^0+/, ""));
  };
  return (
    <div className="pad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
        <button key={k} className="pad-key" onClick={() => tap(k)} disabled={disabled}>
          {k}
        </button>
      ))}
      <button className="pad-key" onClick={() => tap("del")} disabled={disabled}>
        ⌫
      </button>
      <button className="pad-key" onClick={() => tap("0")} disabled={disabled}>
        0
      </button>
      <button
        className="pad-key pad-key--go"
        onClick={onSubmit}
        disabled={disabled || !value}
      >
        ↵
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

export default function HigherLowerDuel() {
  const [pid] = useState(() => makeId());
  const [screen, setScreen] = useState("home"); // home | create | join | room
  const [name, setName] = useState("");
  const [room, setRoom] = useState(null);
  const [code, setCode] = useState("");
  const [level, setLevel] = useState(LEVELS[1]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState(null); // 'higher' | 'lower' | 'correct'
  const codeRef = useRef("");

  const me = room?.players?.[pid] || null;
  const foe = room ? opponentOf(room, pid) : null;
  const phase = phaseOf(room);
  const max = room?.max || 100;

  /* ---- polling ---------------------------------------------------- */
  useEffect(() => {
    codeRef.current = room?.code || "";
  }, [room?.code]);

  useEffect(() => {
    if (screen !== "room") return;
    let alive = true;
    const tick = async () => {
      const c = codeRef.current;
      if (!c) return;
      const fresh = await loadRoom(c);
      if (alive && fresh) setRoom((cur) => (cur && fresh.rev < cur.rev ? cur : fresh));
    };
    const t = setInterval(tick, 1200);
    tick();
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [screen]);

  /* ---- mutations -------------------------------------------------- */
  const commit = useCallback(async (mutate) => {
    const c = codeRef.current;
    const latest = (await loadRoom(c)) || null;
    if (!latest) return null;
    const next = mutate(structuredClone(latest));
    if (!next) return latest;
    next.rev = (latest.rev || 0) + 1;
    setRoom(next);
    await saveRoom(next);
    return next;
  }, []);

  /* ---- actions ---------------------------------------------------- */
  const displayName = () => name.trim().slice(0, 14) || "Anonymous";

  async function createRoom() {
    setBusy(true);
    setNote("");
    let c = makeCode();
    for (let i = 0; i < 5; i++) {
      if (!(await loadRoom(c))) break;
      c = makeCode();
    }
    const fresh = {
      code: c,
      max: level.max,
      levelName: level.name,
      round: 0,
      rev: 1,
      order: [pid],
      players: { [pid]: { id: pid, name: displayName(), secret: null, guesses: [] } },
    };
    const ok = await saveRoom(fresh);
    setBusy(false);
    if (!ok) return setNote("Couldn't reach the game server. Check your connection and try again.");
    codeRef.current = c;
    setRoom(fresh);
    setScreen("room");
  }

  async function joinRoom(claimSeat) {
    const c = code.trim().toUpperCase();
    if (c.length !== 4) return setNote("Room codes are four characters.");
    setBusy(true);
    setNote("");
    const found = await loadRoom(c);
    if (!found) {
      setBusy(false);
      return setNote(`No room called ${c}. Check the code with whoever made it.`);
    }
    if (found.order.length >= 2 && !claimSeat) {
      setBusy(false);
      codeRef.current = c;
      setRoom(found);
      return setNote("full");
    }
    codeRef.current = c;
    const next = structuredClone(found);
    if (claimSeat) {
      // rejoin an existing seat (e.g. after a refresh)
      const old = next.players[claimSeat];
      delete next.players[claimSeat];
      next.players[pid] = { ...old, id: pid };
      next.order = next.order.map((x) => (x === claimSeat ? pid : x));
    } else {
      next.players[pid] = { id: pid, name: displayName(), secret: null, guesses: [] };
      next.order = [...next.order, pid];
    }
    next.rev = (found.rev || 0) + 1;
    await saveRoom(next);
    setBusy(false);
    setRoom(next);
    setNote("");
    setScreen("room");
  }

  async function lockSecret() {
    const v = parseInt(draft, 10);
    if (!v || v < 1 || v > max) return setNote(`Pick a number from 1 to ${max}.`);
    setNote("");
    setDraft("");
    await commit((r) => {
      if (!r.players[pid]) return null;
      r.players[pid].secret = v;
      return r;
    });
  }

  async function submitGuess() {
    const v = parseInt(draft, 10);
    if (!v || v < 1 || v > max) return setNote(`Guesses run from 1 to ${max}.`);
    if (me.guesses.some((g) => g.value === v)) return setNote(`You already tried ${v}.`);
    setNote("");
    setDraft("");
    const target = foe?.secret;
    const result = v === target ? "correct" : v < target ? "higher" : "lower";
    setFlash(result);
    setTimeout(() => setFlash(null), 700);
    await commit((r) => {
      if (!r.players[pid]) return null;
      r.players[pid].guesses = [...r.players[pid].guesses, { value: v, result }];
      return r;
    });
  }

  async function rematch() {
    await commit((r) => {
      r.round += 1;
      for (const id of r.order) {
        r.players[id].secret = null;
        r.players[id].guesses = [];
      }
      return r;
    });
    setDraft("");
    setNote("");
  }

  function leave() {
    codeRef.current = "";
    setRoom(null);
    setScreen("home");
    setDraft("");
    setNote("");
    setCode("");
  }

  function copyCode() {
    const t = document.createElement("textarea");
    t.value = room.code;
    document.body.appendChild(t);
    t.select();
    try {
      document.execCommand("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
    document.body.removeChild(t);
  }

  /* ---- render ----------------------------------------------------- */
  const myTurn = room && phase === "duel" && turnPid(room) === pid;
  const winner = room ? winnerOf(room) : null;

  return (
    <div className="hld">
      <style>{CSS}</style>

      <header className="top">
        <div className="wordmark">
          <span className="wm-up">↑</span>
          <span className="wm-txt">Higher</span>
          <span className="wm-slash">/</span>
          <span className="wm-txt">Lower</span>
          <span className="wm-dn">↓</span>
        </div>
        {room && screen === "room" && (
          <div className="top-meta">
            <span className="chip">{room.code}</span>
            <span className="chip chip--ghost">1–{max}</span>
            <button className="link" onClick={leave}>
              Leave
            </button>
          </div>
        )}
      </header>

      {/* ---------------- HOME ---------------- */}
      {screen === "home" && (
        <main className="stage stage--center">
          <p className="pitch">
            Two players. Two secret numbers. Take turns guessing, watch each other
            close in, and the first one to land it exactly takes the round.
          </p>
          <label className="field">
            <span className="field-label">What should we call you</span>
            <input
              className="input"
              value={name}
              maxLength={14}
              placeholder="Anonymous"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="choice">
            <button className="btn btn--solid" onClick={() => setScreen("create")}>
              Start a room
            </button>
            <button className="btn" onClick={() => setScreen("join")}>
              Join with a code
            </button>
          </div>
        </main>
      )}

      {/* ---------------- CREATE ---------------- */}
      {screen === "create" && (
        <main className="stage stage--center">
          <h2 className="eyebrow">How wide should the field be</h2>
          <div className="levels">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                className={`level ${level.id === l.id ? "is-on" : ""}`}
                onClick={() => setLevel(l)}
              >
                <span className="level-range">1–{l.max}</span>
                <span className="level-name">{l.name}</span>
                <span className="level-note">{l.note}</span>
              </button>
            ))}
          </div>
          {note && <p className="note">{note}</p>}
          <div className="choice">
            <button className="btn btn--solid" onClick={createRoom} disabled={busy}>
              {busy ? "Opening…" : "Open the room"}
            </button>
            <button className="btn" onClick={() => setScreen("home")}>
              Back
            </button>
          </div>
        </main>
      )}

      {/* ---------------- JOIN ---------------- */}
      {screen === "join" && (
        <main className="stage stage--center">
          <h2 className="eyebrow">Enter the room code</h2>
          <input
            className="input input--code"
            value={code}
            maxLength={4}
            placeholder="••••"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
          />
          {note === "full" && room ? (
            <div className="seats">
              <p className="note">
                That room already has two players. If one of them was you, take your
                seat back.
              </p>
              {seats(room).map((p) => (
                <button key={p.id} className="btn" onClick={() => joinRoom(p.id)}>
                  Rejoin as {p.name}
                </button>
              ))}
            </div>
          ) : (
            note && <p className="note">{note}</p>
          )}
          <div className="choice">
            <button className="btn btn--solid" onClick={() => joinRoom()} disabled={busy}>
              {busy ? "Looking…" : "Join the room"}
            </button>
            <button className="btn" onClick={() => { setScreen("home"); setNote(""); }}>
              Back
            </button>
          </div>
        </main>
      )}

      {/* ---------------- LOBBY ---------------- */}
      {screen === "room" && phase === "lobby" && (
        <main className="stage stage--center">
          <h2 className="eyebrow">Send this code to your opponent</h2>
          <button className="bigcode" onClick={copyCode} title="Copy">
            {room.code}
          </button>
          <p className="note">{copied ? "Copied to your clipboard." : "Tap the code to copy it."}</p>
          <div className="waiting">
            <span className="dot" />
            <span>Holding the room open — {room.levelName}, 1 to {max}</span>
          </div>
        </main>
      )}

      {/* ---------------- PICK ---------------- */}
      {screen === "room" && phase === "pick" && (
        <main className="stage stage--center">
          <h2 className="eyebrow">Choose the number they'll be hunting</h2>
          {me?.secret == null ? (
            <>
              <div className="secret-in">
                <span className="secret-caret">#</span>
                <input
                  className="input input--secret"
                  inputMode="numeric"
                  value={draft}
                  placeholder="—"
                  onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  onKeyDown={(e) => e.key === "Enter" && lockSecret()}
                />
              </div>
              <p className="note">Anything from 1 to {max}. Only you can see it.</p>
              {note && <p className="note note--warn">{note}</p>}
              <button className="btn btn--solid" onClick={lockSecret}>
                Lock it in
              </button>
            </>
          ) : (
            <>
              <div className="locked">
                <span className="locked-label">Your number</span>
                <span className="locked-val">{me.secret}</span>
              </div>
              <div className="waiting">
                <span className="dot" />
                <span>Waiting on {foe?.name || "your opponent"} to choose</span>
              </div>
            </>
          )}
        </main>
      )}

      {/* ---------------- DUEL + OVER ---------------- */}
      {screen === "room" && (phase === "duel" || phase === "over") && (
        <main className="stage">
          {phase === "duel" ? (
            <div className={`banner ${myTurn ? "banner--mine" : ""}`}>
              {myTurn ? (
                <>
                  <span className="banner-tag">Your move</span>
                  <span className="banner-txt">
                    Name a number between {boundsFor(me, max).lo} and {boundsFor(me, max).hi}
                  </span>
                </>
              ) : (
                <>
                  <span className="banner-tag banner-tag--wait">
                    <span className="dot" />
                    {foe?.name || "Opponent"}
                  </span>
                  <span className="banner-txt">is taking a shot at your number</span>
                </>
              )}
            </div>
          ) : (
            <div className="banner banner--end">
              <span className="banner-tag">
                {winner?.id === pid ? "You won" : `${winner?.name} won`}
              </span>
              <span className="banner-txt">
                {winner?.id === pid
                  ? `Landed it in ${me.guesses.length} ${me.guesses.length === 1 ? "guess" : "guesses"}`
                  : `${foe?.secret} was the number you were chasing`}
              </span>
            </div>
          )}

          <div className="panes">
            {/* --- mine --- */}
            <section className={`pane pane--you ${flash ? `flash-${flash}` : ""}`}>
              <header className="pane-head">
                <span className="pane-who">Your hunt</span>
                <span className="pane-sub">
                  chasing {foe?.name || "them"}
                  {phase === "over" ? ` · it was ${foe?.secret}` : ""}
                </span>
              </header>
              <Caliper
                {...boundsFor(me, max)}
                max={max}
                tone="you"
                latest={me.guesses.length ? me.guesses[me.guesses.length - 1].value : null}
              />
              {phase === "duel" && (
                <div className="turnbox">
                  <div className="turn-display">
                    <span className="turn-hash">#</span>
                    <span className="turn-val">{draft || "—"}</span>
                  </div>
                  <Keypad
                    value={draft}
                    onChange={setDraft}
                    onSubmit={submitGuess}
                    disabled={!myTurn}
                  />
                  {!myTurn && <p className="note note--dim">Hold tight, it's their turn.</p>}
                  {note && myTurn && <p className="note note--warn">{note}</p>}
                </div>
              )}
              <GuessLog guesses={me.guesses} tone="you" empty="No guesses yet." />
            </section>

            {/* --- theirs --- */}
            <section className="pane pane--foe">
              <header className="pane-head">
                <span className="pane-who">{foe?.name || "Opponent"}'s hunt</span>
                <span className="pane-sub">
                  chasing your {phase === "over" ? me?.secret : "number"}
                </span>
              </header>
              <Caliper
                {...boundsFor(foe, max)}
                max={max}
                tone="foe"
                latest={foe.guesses.length ? foe.guesses[foe.guesses.length - 1].value : null}
              />
              <div className="foe-secret">
                <span className="fs-label">Your number</span>
                <span className="fs-val">{me?.secret}</span>
              </div>
              <GuessLog
                guesses={foe.guesses}
                tone="foe"
                empty="They haven't guessed yet."
              />
            </section>
          </div>

          {phase === "over" && (
            <div className="choice choice--end">
              <button className="btn btn--solid" onClick={rematch}>
                Play again
              </button>
              <button className="btn" onClick={leave}>
                Leave the room
              </button>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Martian+Mono:wght@300;400;600;700&family=Inter+Tight:wght@400;500;600;700&display=swap');

.hld {
  --ink:#0F1319; --panel:#161C25; --panel-2:#1C242F;
  --line:#28323F; --line-soft:#202935;
  --chalk:#E9ECF1; --mute:#8A97A8;
  --you:#F2A93B; --you-dim:#54401C;
  --foe:#54D2CE; --foe-dim:#1B4544;
  --bad:#E0716B;
  --mono:'Martian Mono',ui-monospace,monospace;
  --body:'Inter Tight',system-ui,sans-serif;

  background:var(--ink); color:var(--chalk); font-family:var(--body);
  min-height:100vh; padding:20px 18px 48px;
  background-image:radial-gradient(circle at 50% -10%, #1A2330 0%, var(--ink) 60%);
}
.hld *{box-sizing:border-box}
.hld button:focus-visible,.hld input:focus-visible{outline:2px solid var(--you);outline-offset:2px}

/* header */
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;
  max-width:1080px;margin:0 auto 28px;flex-wrap:wrap}
.wordmark{font-family:var(--mono);font-weight:700;font-size:13px;letter-spacing:.14em;
  text-transform:uppercase;display:flex;align-items:center;gap:6px}
.wm-up{color:var(--you)} .wm-dn{color:var(--foe)} .wm-slash{color:var(--mute);font-weight:300}
.top-meta{display:flex;align-items:center;gap:10px}
.chip{font-family:var(--mono);font-size:11px;letter-spacing:.18em;padding:5px 10px;
  border:1px solid var(--line);border-radius:3px;background:var(--panel)}
.chip--ghost{color:var(--mute)}
.link{background:none;border:none;color:var(--mute);font-family:var(--body);
  font-size:13px;cursor:pointer;padding:4px}
.link:hover{color:var(--chalk)}

/* stage */
.stage{max-width:1080px;margin:0 auto}
.stage--center{max-width:560px;display:flex;flex-direction:column;align-items:center;
  gap:20px;text-align:center;padding-top:20px}
.pitch{color:var(--mute);font-size:16px;line-height:1.6;max-width:44ch;margin:0}
.eyebrow{font-family:var(--mono);font-size:11px;font-weight:400;letter-spacing:.22em;
  text-transform:uppercase;color:var(--mute);margin:0}

/* form bits */
.field{display:flex;flex-direction:column;gap:8px;width:100%;max-width:320px;text-align:left}
.field-label{font-family:var(--mono);font-size:10px;letter-spacing:.2em;
  text-transform:uppercase;color:var(--mute)}
.input{width:100%;background:var(--panel);border:1px solid var(--line);border-radius:4px;
  color:var(--chalk);font-family:var(--body);font-size:16px;padding:12px 14px}
.input::placeholder{color:#4E5A6A}
.input--code{font-family:var(--mono);font-size:34px;letter-spacing:.34em;text-align:center;
  padding:16px 0 16px 12px;max-width:280px;font-weight:600}
.input--secret{font-family:var(--mono);font-size:44px;font-weight:600;text-align:center;
  border:none;background:none;padding:0;width:5ch}
.secret-in{display:flex;align-items:baseline;gap:4px;background:var(--panel);
  border:1px solid var(--line);border-radius:5px;padding:14px 20px}
.secret-caret{font-family:var(--mono);font-size:22px;color:var(--you)}
.note{color:var(--mute);font-size:13px;margin:0;line-height:1.5}
.note--warn{color:var(--bad)}
.note--dim{opacity:.7;margin-top:10px}

/* buttons */
.choice{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.choice--end{margin-top:26px}
.btn{font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.1em;
  text-transform:uppercase;padding:13px 20px;border-radius:4px;cursor:pointer;
  background:var(--panel);border:1px solid var(--line);color:var(--chalk);
  transition:background .15s,border-color .15s,transform .1s}
.btn:hover:not(:disabled){background:var(--panel-2);border-color:#3A4757}
.btn:active:not(:disabled){transform:translateY(1px)}
.btn:disabled{opacity:.45;cursor:default}
.btn--solid{background:var(--you);border-color:var(--you);color:#1A1206}
.btn--solid:hover:not(:disabled){background:#FFBB4D;border-color:#FFBB4D}

/* levels */
.levels{display:flex;flex-direction:column;gap:8px;width:100%}
.level{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;
  gap:2px 16px;text-align:left;padding:16px 18px;border-radius:5px;cursor:pointer;
  background:var(--panel);border:1px solid var(--line);color:var(--chalk);
  transition:border-color .15s,background .15s}
.level:hover{background:var(--panel-2)}
.level.is-on{border-color:var(--you);background:#1E1B14}
.level-range{grid-row:1/3;align-self:center;font-family:var(--mono);font-size:19px;
  font-weight:600;color:var(--mute);min-width:82px}
.level.is-on .level-range{color:var(--you)}
.level-name{font-weight:600;font-size:15px}
.level-note{font-size:13px;color:var(--mute)}

/* lobby */
.bigcode{font-family:var(--mono);font-size:clamp(44px,13vw,76px);font-weight:700;
  letter-spacing:.16em;padding:22px 10px 22px 26px;background:var(--panel);
  border:1px solid var(--line);border-radius:6px;color:var(--chalk);cursor:pointer;
  width:100%;transition:border-color .15s}
.bigcode:hover{border-color:var(--you)}
.waiting{display:flex;align-items:center;gap:9px;font-size:14px;color:var(--mute)}
.dot{width:7px;height:7px;border-radius:50%;background:var(--you);
  animation:pulse 1.5s ease-in-out infinite;flex:none}
@keyframes pulse{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
.seats{display:flex;flex-direction:column;gap:8px;align-items:center;width:100%}
.locked{display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 40px;
  background:var(--panel);border:1px solid var(--you);border-radius:6px}
.locked-label{font-family:var(--mono);font-size:10px;letter-spacing:.2em;
  text-transform:uppercase;color:var(--mute)}
.locked-val{font-family:var(--mono);font-size:46px;font-weight:700;color:var(--you)}

/* banner */
.banner{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 18px;
  border-radius:5px;background:var(--panel);border:1px solid var(--line);margin-bottom:16px}
.banner--mine{border-color:var(--you);background:#1C1913}
.banner--end{border-color:var(--foe);background:#14201F}
.banner-tag{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.18em;
  text-transform:uppercase;color:var(--you);display:flex;align-items:center;gap:8px}
.banner--end .banner-tag{color:var(--foe)}
.banner-tag--wait{color:var(--foe)}
.banner-tag--wait .dot{background:var(--foe)}
.banner-txt{font-size:14px;color:var(--mute)}

/* panes */
.panes{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pane{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:18px;
  transition:box-shadow .3s}
.pane--you{border-top:2px solid var(--you)}
.pane--foe{border-top:2px solid var(--foe)}
.pane-head{display:flex;flex-direction:column;gap:3px;margin-bottom:16px}
.pane-who{font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.12em;
  text-transform:uppercase}
.pane--you .pane-who{color:var(--you)} .pane--foe .pane-who{color:var(--foe)}
.pane-sub{font-size:13px;color:var(--mute)}
.flash-higher{box-shadow:0 -14px 30px -14px var(--you) inset}
.flash-lower{box-shadow:0 14px 30px -14px var(--you) inset}
.flash-correct{box-shadow:0 0 0 1px var(--you),0 0 34px -6px var(--you)}

/* caliper */
.cal{margin-bottom:18px}
.cal-track{position:relative;height:38px;background:var(--ink);border:1px solid var(--line-soft);
  border-radius:3px;overflow:hidden}
.cal-ticks{position:absolute;inset:0;
  background-image:linear-gradient(90deg,var(--line) 0 1px,transparent 1px 100%);
  background-repeat:repeat-x;opacity:.9}
.cal-zone{position:absolute;top:0;bottom:0;transition:left .45s cubic-bezier(.2,.8,.2,1),right .45s cubic-bezier(.2,.8,.2,1)}
.cal--you .cal-zone{background:linear-gradient(180deg,rgba(242,169,59,.22),rgba(242,169,59,.06))}
.cal--foe .cal-zone{background:linear-gradient(180deg,rgba(84,210,206,.22),rgba(84,210,206,.06))}
.cal-jaw{position:absolute;top:0;bottom:0;width:3px;
  transition:left .45s cubic-bezier(.2,.8,.2,1),right .45s cubic-bezier(.2,.8,.2,1)}
.cal--you .cal-jaw{background:var(--you)} .cal--foe .cal-jaw{background:var(--foe)}
.cal-jaw--l{transform:translateX(-1px)} .cal-jaw--r{transform:translateX(1px)}
.cal-pin{position:absolute;top:50%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;
  border-radius:50%;background:var(--chalk);transition:left .45s cubic-bezier(.2,.8,.2,1)}
.cal-read{display:flex;justify-content:space-between;align-items:center;margin-top:7px;
  font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--mute)}
.cal-end{font-weight:600;color:var(--chalk)}

/* turn input */
.turnbox{margin-bottom:18px}
.turn-display{display:flex;align-items:baseline;justify-content:center;gap:6px;
  background:var(--ink);border:1px solid var(--line-soft);border-radius:4px;padding:12px;
  margin-bottom:10px}
.turn-hash{font-family:var(--mono);font-size:16px;color:var(--mute)}
.turn-val{font-family:var(--mono);font-size:36px;font-weight:700;color:var(--you);
  min-width:3ch;text-align:center}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.pad-key{font-family:var(--mono);font-size:17px;font-weight:600;padding:14px 0;
  background:var(--panel-2);border:1px solid var(--line);border-radius:4px;
  color:var(--chalk);cursor:pointer;transition:background .12s,transform .08s}
.pad-key:hover:not(:disabled){background:#25303D}
.pad-key:active:not(:disabled){transform:translateY(1px)}
.pad-key:disabled{opacity:.3;cursor:default}
.pad-key--go{background:var(--you);border-color:var(--you);color:#1A1206}
.pad-key--go:hover:not(:disabled){background:#FFBB4D}

/* foe secret readout */
.foe-secret{display:flex;align-items:center;justify-content:space-between;
  background:var(--ink);border:1px dashed var(--line);border-radius:4px;
  padding:11px 14px;margin-bottom:18px}
.fs-label{font-family:var(--mono);font-size:10px;letter-spacing:.18em;
  text-transform:uppercase;color:var(--mute)}
.fs-val{font-family:var(--mono);font-size:22px;font-weight:700;color:var(--foe)}

/* logs */
.log{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;
  max-height:260px;overflow-y:auto}
.log-row{display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:10px;
  padding:8px 10px;border-radius:3px;background:var(--ink);border:1px solid var(--line-soft);
  animation:slide .25s ease-out}
@keyframes slide{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
.log-n{font-family:var(--mono);font-size:10px;color:#4E5A6A}
.log-v{font-family:var(--mono);font-size:17px;font-weight:600}
.log-r{font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--mute)}
.log-row--correct{border-color:var(--you);background:#1E1B14}
.log--foe .log-row--correct{border-color:var(--foe);background:#14201F}
.log-row--correct .log-r{color:var(--you)}
.log--foe .log-row--correct .log-r{color:var(--foe)}
.log-empty{font-size:13px;color:#4E5A6A;margin:0;font-style:italic}

@media (max-width:720px){
  .panes{grid-template-columns:1fr}
  .pane--foe{order:2}
}
@media (prefers-reduced-motion:reduce){
  .hld *{animation:none!important;transition:none!important}
}
`;
