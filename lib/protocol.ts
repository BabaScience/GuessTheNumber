/**
 * The wire format between the API and the browser. Deliberately narrower than
 * the stored room: no tokens, and no opponent secret until the round is over.
 */

import type { Guess, Phase } from "./game";

export type PublicPlayer = {
  id: string;
  name: string;
  /** Whether they've locked a number in — true without revealing what it is. */
  hasSecret: boolean;
  /**
   * The actual number. Present for your own seat, and for both seats once the
   * round is over. Null otherwise — the server never sends a live secret.
   */
  secret: number | null;
  guesses: Guess[];
  wins: number;
  /** Seen within the presence window. */
  online: boolean;
};

export type PublicRoom = {
  code: string;
  max: number;
  levelId: string;
  levelName: string;
  order: string[];
  players: Record<string, PublicPlayer>;
  round: number;
  startSeat: number;
  rev: number;
  /** Set when the room was last rebuilt after the server forgot it. */
  restartedAt: number | null;
  /** Convenience mirrors so the UI never has to recompute them to render. */
  phase: Phase;
  turnPlayerId: string | null;
  winnerId: string | null;
};

/**
 * Should `next` replace the snapshot we're already showing?
 *
 * Normally `rev` orders snapshots, so a poll that overtakes an action's reply
 * can't roll the board backwards. But a room rebuilt after the server forgot it
 * starts counting from 1 again, so a lower `rev` there means "newer", not
 * "stale" — `restartedAt` tells the two incarnations apart.
 */
export function isNewerRoom(current: PublicRoom | null, next: PublicRoom): boolean {
  if (!current) return true;
  if (current.restartedAt !== next.restartedAt) return true;
  return next.rev >= current.rev;
}

/** Identity handed to a player once, then replayed on every request. */
export type Credentials = {
  code: string;
  playerId: string;
  token: string;
};

export type RoomResponse = { room: PublicRoom };
export type JoinResponse = { room: PublicRoom; credentials: Credentials };
export type GuessResponse = { room: PublicRoom; result: Guess };
/**
 * Returned by the poll endpoint when the client's `rev` is already current.
 * Presence still ships, because coming and going doesn't change `rev` and the
 * client would otherwise never notice its opponent drop off.
 */
export type UnchangedResponse = { unchanged: true; rev: number; online: string[] };
/**
 * Why a request failed, when the client needs to act on it rather than just
 * show it. `room-gone` and `seat-lost` both mean the server no longer knows
 * about us and a reclaim should be attempted; `bad-token` means it does know,
 * and we are not who we say we are.
 */
export type ErrorCode = "room-gone" | "seat-lost" | "bad-token";

export type ErrorResponse = { error: string; code?: ErrorCode };

/**
 * Everything needed to rebuild a seat from the client after the server has
 * forgotten it. Deliberately excludes the secret and the guess history: those
 * are the round in progress, and a round that restarts in the open is better
 * than one a player could quietly rewrite.
 */
export type ReclaimRequest = {
  playerId: string;
  token: string;
  name: string;
  wins: number;
  levelId: string;
  round: number;
};
