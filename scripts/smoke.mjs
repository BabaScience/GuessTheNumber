/**
 * Plays a complete game over HTTP against a running server.
 *
 *   npm run smoke                          # http://localhost:3000
 *   npm run smoke -- https://you.vercel.app
 *
 * Point it at a deployment to confirm the whole thing actually works there:
 * storage is durable, secrets stay hidden, turns alternate, and a round can be
 * won and replayed. Everything it creates is a throwaway room that expires on
 * its own.
 */
import assert from "node:assert/strict";

const BASE = (process.argv[2] ?? process.env.BASE ?? "http://localhost:3000").replace(/\/$/, "");

let passed = 0;
const ok = (label) => {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
};
const section = (label) => console.log(`\n\x1b[1m${label}\x1b[0m`);

async function call(path, { method = "GET", body, auth } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (auth) {
    headers["x-player-id"] = auth.playerId;
    headers["x-player-token"] = auth.token;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body, leave null */
  }
  return { status: res.status, body: json };
}

console.log(`\nSmoke-testing ${BASE}`);

/* -------------------------------------------------------------- health -- */

section("Storage");

const health = await call("/api/health");
if (health.status !== 200) {
  console.error(`\n\x1b[31mHealth check failed (${health.status}).\x1b[0m`);
  console.error(health.body?.warning ?? health.body?.store ?? health.body);
  process.exit(1);
}
ok(`storage is "${health.body.storage}" (${health.body.store})`);

if (!health.body.durable) {
  console.error(
    "\n\x1b[31mStorage is not durable.\x1b[0m Rooms are in instance memory; " +
      "two players will end up on different instances. Set MONGODB_URI, " +
      "MONGODB_USERNAME and MONGODB_PASSWORD.\n",
  );
  process.exit(1);
}
ok("storage is durable — every instance sees the same rooms");

/* ---------------------------------------------------------------- game -- */

section("Opening a room");

const created = await call("/api/rooms", {
  method: "POST",
  body: { name: "Smoke A", levelId: "classic" },
});
assert.equal(created.status, 201, "room creation failed");
const A = created.body.credentials;
const code = A.code;
ok(`created room ${code}`);

const joined = await call(`/api/rooms/${code}/join`, {
  method: "POST",
  body: { name: "Smoke B" },
});
assert.equal(joined.status, 201, "join failed");
const B = joined.body.credentials;
ok("second player joined");

assert.equal((await call(`/api/rooms/${code}/join`, { method: "POST", body: { name: "C" } })).status, 409);
ok("a third player is turned away");

section("Secrecy");

const SECRET_A = 63;
const SECRET_B = 17;
assert.equal((await call(`/api/rooms/${code}/secret`, { method: "POST", body: { value: SECRET_A }, auth: A })).status, 200);
assert.equal((await call(`/api/rooms/${code}/secret`, { method: "POST", body: { value: SECRET_B }, auth: B })).status, 200);
ok("both numbers locked in");

const asA = (await call(`/api/rooms/${code}`, { auth: A })).body.room;
assert.equal(asA.players[A.playerId].secret, SECRET_A, "you should see your own number");
assert.equal(asA.players[B.playerId].secret, null, "OPPONENT SECRET LEAKED");
assert.equal(asA.players[B.playerId].hasSecret, true);
ok("opponent's number is withheld, but you can tell they've picked");

const payload = JSON.stringify(asA);
assert.ok(!payload.includes(A.token) && !payload.includes(B.token), "TOKEN LEAKED");
ok("no seat tokens on the wire");

assert.equal((await call(`/api/rooms/${code}/guess`, { method: "POST", body: { value: 5 }, auth: { playerId: B.playerId, token: A.token } })).status, 401);
ok("one player cannot act as the other");

section("Playing");

assert.equal(asA.phase, "duel");
assert.equal(asA.turnPlayerId, B.playerId);
ok("the guest opens the first round");

assert.equal((await call(`/api/rooms/${code}/guess`, { method: "POST", body: { value: 50 }, auth: A })).status, 409);
ok("guessing out of turn is refused");

async function guess(who, value, expected) {
  const res = await call(`/api/rooms/${code}/guess`, { method: "POST", body: { value }, auth: who });
  assert.equal(res.status, 200, `guess ${value} failed: ${res.body?.error}`);
  assert.equal(res.body.result.result, expected, `guess ${value} judged wrong`);
}

await guess(B, 50, "higher");
await guess(A, 50, "lower");
ok("higher/lower feedback is correct for both players");

assert.equal((await call(`/api/rooms/${code}/guess`, { method: "POST", body: { value: 50 }, auth: B })).status, 400);
ok("repeating a guess is refused");
assert.equal((await call(`/api/rooms/${code}/guess`, { method: "POST", body: { value: 20 }, auth: B })).status, 400);
ok("a guess your own clues rule out is refused");

await guess(B, 75, "lower");
await guess(A, 25, "lower");
await guess(B, 62, "higher");
await guess(A, 17, "correct");

const over = (await call(`/api/rooms/${code}`, { auth: A })).body.room;
assert.equal(over.phase, "over");
assert.equal(over.winnerId, A.playerId);
ok("an exact guess ends the round and names the winner");
assert.equal(over.players[B.playerId].secret, SECRET_B);
ok("both numbers revealed once it's over");
assert.equal(over.players[A.playerId].wins, 1);
ok("the score is recorded");

section("Rematch and cleanup");

const rematch = await call(`/api/rooms/${code}/rematch`, { method: "POST", auth: B });
assert.equal(rematch.status, 200);
assert.equal(rematch.body.room.phase, "pick");
assert.equal(rematch.body.room.startSeat, 0);
ok("board cleared and the first move alternates");
assert.equal(rematch.body.room.players[A.playerId].wins, 1);
ok("the score carries across rounds");

const since = rematch.body.room.rev;
const unchanged = await call(`/api/rooms/${code}?since=${since}`, { auth: A });
assert.equal(unchanged.body.unchanged, true);
ok("polling with ?since returns a short 'unchanged' reply");
assert.ok(unchanged.body.online.includes(B.playerId));
ok("presence tracks both players");

await call(`/api/rooms/${code}/leave`, { method: "POST", auth: A });
await call(`/api/rooms/${code}/leave`, { method: "POST", auth: B });
assert.equal((await call(`/api/rooms/${code}`, { auth: A })).status, 404);
ok("the room is removed once everyone leaves");

console.log(`\n\x1b[32m${passed} checks passed.\x1b[0m\n`);
