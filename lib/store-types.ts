import type { Guess } from "./game";

/**
 * The server-side room. Secrets and tokens live here and never leave —
 * everything the network sees goes through `toPublicRoom` first.
 *
 * Kept in its own module so storage backends can import it without importing
 * the store itself, which imports them.
 */

export type StoredPlayer = {
  id: string;
  name: string;
  /** The number this player chose for their opponent to hunt. Never sent out. */
  secret: number | null;
  guesses: Guess[];
  /** Bearer secret proving "I am this seat". Never sent to the other player. */
  token: string;
  /** Rounds this player has won in this room. */
  wins: number;
};

export type StoredRoom = {
  code: string;
  max: number;
  levelId: string;
  levelName: string;
  order: string[];
  players: Record<string, StoredPlayer>;
  round: number;
  startSeat: number;
  /** Bumped on every mutation; also the compare-and-set token for writes. */
  rev: number;
  createdAt: number;
  updatedAt: number;
};

/** Rooms disappear this long after the last action. */
export const ROOM_TTL_SECONDS = 60 * 60 * 6;

/**
 * How long after a player's last request we still consider them present.
 * Clients poll well inside this, so a real disconnect surfaces in a few seconds
 * while an ordinary slow request never flickers them offline.
 */
export const PRESENCE_TTL_SECONDS = 15;

/**
 * Outcome of a mutation callback. `commit: false` leaves the room untouched —
 * used to reject a move while still reporting why.
 */
export type Mutation<T> = { commit: boolean; value: T };
