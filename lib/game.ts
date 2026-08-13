/**
 * Pure game rules. No I/O, no React, no server APIs — so the same functions
 * decide the game on the server and describe it on the client, and both always
 * agree about whose turn it is.
 */

export type LevelId = "quick" | "classic" | "brutal";

export type Level = {
  id: LevelId;
  max: number;
  name: string;
  note: string;
  /** Guesses a perfect binary-search player needs in the worst case. */
  par: number;
};

export const LEVELS: readonly Level[] = [
  { id: "quick", max: 10, name: "Quick", note: "Ten numbers. Over in a blink.", par: 4 },
  { id: "classic", max: 100, name: "Classic", note: "The one everybody knows.", par: 7 },
  { id: "brutal", max: 1000, name: "Brutal", note: "Ten guesses if you're sharp.", par: 10 },
];

export const DEFAULT_LEVEL_ID: LevelId = "classic";

export function levelById(id: string): Level | null {
  return LEVELS.find((l) => l.id === id) ?? null;
}

export type GuessResult = "higher" | "lower" | "correct";

export type Guess = {
  /** The number that was named. */
  value: number;
  /** Advice for the guesser: "higher" means the target is above `value`. */
  result: GuessResult;
  at: number;
};

export type Phase = "lobby" | "pick" | "duel" | "over";

/**
 * The shape both the server room and the redacted client room satisfy. The
 * rule functions only ever read these fields, so they work on either.
 */
export type PlayerView = {
  id: string;
  name: string;
  hasSecret: boolean;
  guesses: Guess[];
};

export type RoomView = {
  code: string;
  max: number;
  /** Seat order. Index 0 is the host. Always 1 or 2 entries. */
  order: string[];
  players: Record<string, PlayerView>;
  round: number;
  /** Seat index (0 or 1) that guesses first this round. */
  startSeat: number;
};

export const ROOM_CODE_LENGTH = 4;
/** No 0/O/1/I — room codes get read aloud and typed by hand. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MAX_NAME_LENGTH = 14;

const CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function isValidCode(raw: string): boolean {
  return CODE_PATTERN.test(raw);
}

export function normalizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // Collapse whitespace and drop control characters so names can't wreck layout.
  return raw
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

/** Seated players in seat order, skipping any dangling ids. */
export function seats<P extends PlayerView>(room: {
  order: string[];
  players: Record<string, P>;
}): P[] {
  return room.order.map((id) => room.players[id]).filter((p): p is P => Boolean(p));
}

export function opponentOf<P extends PlayerView>(
  room: { order: string[]; players: Record<string, P> },
  playerId: string,
): P | null {
  const otherId = room.order.find((id) => id !== playerId);
  return otherId ? room.players[otherId] ?? null : null;
}

export function phaseOf(room: RoomView | null): Phase {
  if (!room) return "lobby";
  const players = seats(room);
  if (players.length < 2) return "lobby";
  if (players.some((p) => p.guesses.some((g) => g.result === "correct"))) return "over";
  if (players.some((p) => !p.hasSecret)) return "pick";
  return "duel";
}

export function winnerOf(room: RoomView | null): PlayerView | null {
  if (!room) return null;
  return seats(room).find((p) => p.guesses.some((g) => g.result === "correct")) ?? null;
}

/**
 * Whose turn it is. Guesses strictly alternate, so the total number of guesses
 * played this round tells us how far the turn has walked from the starter.
 * Derived rather than stored, so two clients can never disagree.
 */
export function turnPlayerId(room: RoomView): string | null {
  const players = seats(room);
  if (players.length < 2) return null;
  const played = players.reduce((n, p) => n + p.guesses.length, 0);
  const seat = (room.startSeat + played) % 2;
  return room.order[seat] ?? null;
}

/** The window a hunter has squeezed the target down to, from their own clues. */
export function boundsFor(player: PlayerView | null, max: number): { lo: number; hi: number } {
  let lo = 1;
  let hi = max;
  if (!player) return { lo, hi };
  for (const g of player.guesses) {
    if (g.result === "higher") lo = Math.max(lo, g.value + 1);
    if (g.result === "lower") hi = Math.min(hi, g.value - 1);
  }
  // A correct guess pins the window shut; clamp so lo never passes hi.
  return { lo, hi: Math.max(lo, hi) };
}

export function remainingCount(player: PlayerView | null, max: number): number {
  const { lo, hi } = boundsFor(player, max);
  return Math.max(0, hi - lo + 1);
}

export function judge(guess: number, secret: number): GuessResult {
  if (guess === secret) return "correct";
  return guess < secret ? "higher" : "lower";
}

/**
 * Is `value` a legal guess for this player? Rejects out-of-range numbers,
 * repeats, and anything their own clues have already ruled out — the last one
 * saves people from wasting a turn on a number they've proven is wrong.
 */
export function validateGuess(
  player: PlayerView,
  value: number,
  max: number,
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(value)) return { ok: false, reason: "Guesses have to be whole numbers." };
  if (value < 1 || value > max) return { ok: false, reason: `Guesses run from 1 to ${max}.` };
  if (player.guesses.some((g) => g.value === value)) {
    return { ok: false, reason: `You already tried ${value}.` };
  }
  const { lo, hi } = boundsFor(player, max);
  if (value < lo || value > hi) {
    return { ok: false, reason: `Your clues already rule that out — it's between ${lo} and ${hi}.` };
  }
  return { ok: true };
}

export function validateSecret(value: number, max: number): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(value)) return { ok: false, reason: "Pick a whole number." };
  if (value < 1 || value > max) return { ok: false, reason: `Pick a number from 1 to ${max}.` };
  return { ok: true };
}

/** Fewest guesses a perfect player could still need, given what they know. */
export function optimalRemaining(player: PlayerView | null, max: number): number {
  const left = remainingCount(player, max);
  return left <= 1 ? (left === 1 ? 1 : 0) : Math.ceil(Math.log2(left));
}
