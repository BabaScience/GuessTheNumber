# Higher / Lower

A two-player number duel. One of you opens a room and shares the four-letter
code; you each secretly pick a number for the other to hunt; then you guess in
turns, each miss answering only "higher" or "lower". First to land the number
exactly takes the round.

Both players watch the whole board — your own narrowing range and theirs — so
the half of the game you spend waiting is still worth watching.

## Running it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Locally there is only one server process, so no
database is needed — rooms are kept in memory and you can play immediately. For
a deployment that is not true; see below.

To play against yourself while developing, use a second browser (or
`127.0.0.1` instead of `localhost`) — the two tabs need separate
`localStorage`, since that is where a player's seat is remembered.

To develop against the real database, copy [.env.example](.env.example) to
`.env.local` and fill it in. `.env.local` is gitignored; never put real
credentials in `.env.example`, which is committed.

## Scripts

| Command             | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Dev server with hot reload                            |
| `npm run build`     | Production build                                      |
| `npm start`         | Serve the production build                            |
| `npm test`          | Rule and config unit tests (`node:test`, no browser)  |
| `npm run smoke`     | Plays a whole game over HTTP against a running server |
| `npm run typecheck` | `tsc --noEmit`                                        |
| `npm run lint`      | ESLint                                                |
| `npm run verify`    | typecheck + test + build, in that order               |

## Deploying to Vercel

The game needs a database. Not for scale — for correctness. See
[Why a database is not optional](#why-a-database-is-not-optional) below if
you're tempted to skip it.

**1. Create a free MongoDB cluster.** At
[atlas.mongodb.com](https://atlas.mongodb.com), create an **M0** cluster — free
forever, no card. Put it in the region closest to the one in
[vercel.json](vercel.json), since every turn is a round trip.

**2. Create a database user.** *Database Access → Add New Database User*. That
username and password become `MONGODB_USERNAME` and `MONGODB_PASSWORD`.

**3. Allow access from anywhere.** *Network Access → 0.0.0.0/0*. Vercel's
functions have no fixed IP, so the cluster has to accept any of them. Leaving
this out produces a timeout, not a permission error, which is confusing.

**4. Copy the connection string.** *Connect → Drivers*. Paste it into
`MONGODB_URI` and **delete the `<username>:<password>@` part**. Credentials are
passed to the driver separately, so a password containing `@`, `/` or `:` needs
no escaping — the usual reason a correct password appears to fail. The app
refuses to start on a URI that still has `<placeholders>` in it.

**5. Set all three in Vercel** under *Settings → Environment Variables*, then
**redeploy** — variables are applied at build time, so an existing deployment
won't pick them up.

**6. Verify.**

```bash
npm run smoke -- https://your-app.vercel.app
```

That plays a complete game against the deployment: storage durability, secret
redaction, turn order, winning, rematch. It fails loudly rather than subtly if
anything is wrong. `/api/health` on its own gives the short version.

### Pick your region

[vercel.json](vercel.json) pins functions to one region, currently `fra1`
(Frankfurt). Change it to whichever is nearest you and your database — `iad1`
for the US east coast, `sfo1` for the west, `sin1` for Singapore.

This is now only about latency. It is not load-bearing for correctness.

### Why a database is not optional

Running rooms in the server's memory looks like it works. It doesn't, and the
way it fails is worth understanding, because it cost this project a rewrite.

Vercel runs **several instances per region**, each a separate process with its
own memory, and it spreads requests across them with no affinity. Two players
polling once a second generate constant overlapping requests, which is exactly
what makes the platform start another instance. From then on, some of your
requests are answered by a process that has never heard of your room.

The symptoms are strange rather than obviously fatal: a join that fails right
after the room was created, guesses that vanish, a game that resets to the
number-picking screen partway through. Pinning the region does not help — that
controls *where*, not *how many*.

A shared store removes the question. Every instance reads and writes the same
rooms, so which one answers stops mattering. That is why ordinary Next.js apps
never hit this: they keep nothing in memory.

Set `MONGODB_URI` partially (say, without the password) and the app refuses to
run rather than falling back to memory, because a silent fallback is a failure
nobody notices until mid-game.

### Using Redis instead

The store is an interface ([lib/store.ts](lib/store.ts)). Set
`KV_REST_API_URL` and `KV_REST_API_TOKEN` for any Upstash-compatible Redis and
it will use that instead, with no code change. MongoDB takes precedence when
both are set.

## How it fits together

```
app/
  page.tsx              screen routing; everything below is a client component
  api/rooms/            create · join · read · secret · guess · rematch · leave
components/screens/     home · create · join · lobby · pick · duel
components/             Caliper (the range meter) · GuessLog · Keypad
lib/
  game.ts               pure rules — phases, turn order, bounds, validation
  store.ts              room storage: MongoDB, Redis, or memory for local dev
  mongo.ts              the connection, cached per process
  mongo-config.ts       reading and validating the environment
  store-types.ts        the stored room, kept apart to avoid an import cycle
  server.ts             auth, redaction, id generation
  protocol.ts           the exact shape of what crosses the wire
  use-duel.ts           client state machine and the polling loop
scripts/smoke.mjs       plays a whole game against a running deployment
tests/                  rule and configuration tests
```

`lib/game.ts` has no imports and no side effects, so the server decides the game
and the client describes it using the same functions. Whose turn it is, for
instance, is derived from the number of guesses played rather than stored, which
means two clients cannot disagree about it even briefly.

### Secrets stay on the server

A player's number never reaches their opponent's browser. `toPublicRoom` in
`lib/server.ts` is the only path from stored state to the network, and it
replaces the opponent's `secret` with `null` (keeping a `hasSecret` flag so the
UI can still say "they've picked"). Both numbers are revealed only once the
round is decided. Guesses are judged server-side, so a guesser learns exactly
one bit per turn.

Each seat gets a random token at join time, replayed in `x-player-id` and
`x-player-token` headers. Without it you cannot read the room or take a turn,
which is also what stops one player from submitting a guess as the other.

### Staying in sync

Clients poll. The interval adapts — roughly a second while waiting for the
opponent, three seconds on your own turn when nothing can change, five while the
tab is hidden — and `GET /api/rooms/:code?since=<rev>` answers with a small
`{ unchanged: true }` when nothing has happened, which is most of the time.

Polling was chosen over websockets deliberately: this is a turn-based game where
a second of latency is invisible, and it means no connection state to hold open
on a platform that bills for exactly that.

Writes use compare-and-set on the room's revision rather than a lock: a mutation
only lands if nobody has written since it read, and a lost race retries against
fresh state. Two players are rarely writing at once, but when they are — the
same person's guess arriving twice, or a rematch clicked by both — nothing is
silently overwritten, and there is no lock to leak if an instance dies holding
one.

## Rules worth knowing

- **Guesses alternate strictly.** Whoever moves first has a real edge, so the
  first move alternates each round rather than staying with the host.
- **You can't waste a turn.** Repeating a guess, or naming a number your own
  clues have already ruled out, is rejected with a reason.
- **Locking is final.** Once you've committed your number you cannot change it.
- **Leaving frees your seat** rather than closing the room; the room is deleted
  only when nobody is left. Rooms expire six hours after the last action.
