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
export type ErrorResponse = { error: string };
