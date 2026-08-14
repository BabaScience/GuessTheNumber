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
  /** Convenience mirrors so the UI never has to recompute them to render. */
  phase: Phase;
  turnPlayerId: string | null;
  winnerId: string | null;
};

/**
 * Should `next` replace the snapshot we're already showing?
 *
 * `rev` increases on every mutation and now comes from one shared store, so it
 * totally orders snapshots: a poll that overtakes an action's reply can never
 * roll the board backwards. Equal revs still pass, because presence rides along
 * on an otherwise unchanged room.
 */
export function isNewerRoom(current: PublicRoom | null, next: PublicRoom): boolean {
  if (!current) return true;
  // A different room in the same tab (rematch elsewhere, or a fresh join)
  // shouldn't be filtered by a rev that means nothing across rooms.
  if (current.code !== next.code) return true;
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
 * show it. `room-gone` means the room has genuinely expired or been closed —
 * with a shared store that is a real answer, not an artefact of which server
 * happened to reply.
 */
export type ErrorCode = "room-gone" | "bad-token";

export type ErrorResponse = { error: string; code?: ErrorCode };
