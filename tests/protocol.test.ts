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
    restartedAt: null,
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

  it("accepts the same rev, since presence rides along unchanged revs", () => {
    assert.equal(isNewerRoom(room({ rev: 5 }), room({ rev: 5 })), true);
  });

  it("rejects a lower rev — a poll overtaking an action's reply", () => {
    assert.equal(isNewerRoom(room({ rev: 5 }), room({ rev: 4 })), false);
  });

  it("accepts a rebuilt room even though its rev counts from 1 again", () => {
    // The regression this exists for: after the server forgets a room and a
    // client reclaims it, the fresh room arrives at rev 1. Ordering on rev
    // alone discards it, and the player sits looking at a board that no longer
    // exists on the server.
    const before = room({ rev: 9, restartedAt: null, phase: "duel" });
    const rebuilt = room({ rev: 1, restartedAt: 1_700_000_000_000, phase: "lobby" });
    assert.equal(isNewerRoom(before, rebuilt), true);
  });

  it("still orders by rev within one incarnation of a rebuilt room", () => {
    const stamp = 1_700_000_000_000;
    assert.equal(isNewerRoom(room({ rev: 4, restartedAt: stamp }), room({ rev: 3, restartedAt: stamp })), false);
    assert.equal(isNewerRoom(room({ rev: 4, restartedAt: stamp }), room({ rev: 5, restartedAt: stamp })), true);
  });
});
