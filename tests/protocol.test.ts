import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isNewerRoom, type PublicRoom } from "../lib/protocol.ts";

function room(over: Partial<PublicRoom> = {}): PublicRoom {
  return {
    code: "AB23",
    max: 100,
    levelId: "classic",
    levelName: "Classic",
    order: ["a", "b"],
    players: {},
    round: 0,
    startSeat: 0,
    rev: 5,
    phase: "duel",
    turnPlayerId: "a",
    winnerId: null,
    ...over,
  };
}

describe("isNewerRoom", () => {
  it("accepts anything when we hold nothing", () => {
    assert.equal(isNewerRoom(null, room()), true);
  });

  it("accepts a higher rev", () => {
    assert.equal(isNewerRoom(room({ rev: 5 }), room({ rev: 6 })), true);
  });

  it("accepts an equal rev, since presence rides along on unchanged rooms", () => {
    assert.equal(isNewerRoom(room({ rev: 5 }), room({ rev: 5 })), true);
  });

  it("rejects a lower rev — a poll overtaking an action's reply", () => {
    // The scenario: you submit a guess, and a poll issued moments earlier
    // returns afterwards carrying the board as it was before your move.
    assert.equal(isNewerRoom(room({ rev: 5 }), room({ rev: 4 })), false);
  });

  it("accepts a different room regardless of rev", () => {
    // rev counts per room, so it means nothing across two of them. Leaving a
    // long game for a fresh one must not be filtered out as stale.
    const oldGame = room({ code: "AB23", rev: 40 });
    const newGame = room({ code: "QQ77", rev: 1 });
    assert.equal(isNewerRoom(oldGame, newGame), true);
  });
});
