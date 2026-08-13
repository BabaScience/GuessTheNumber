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

Open <http://localhost:3000>. To play against yourself while developing, use a
second browser (or `127.0.0.1` instead of `localhost`) — the two tabs need
separate `localStorage`, since that is where a player's seat is remembered.

## Scripts

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Dev server with hot reload                          |
| `npm run build`     | Production build                                    |
| `npm start`         | Serve the production build                          |
| `npm test`          | Game-rule unit tests (`node:test`, no browser)      |
| `npm run typecheck` | `tsc --noEmit`                                      |
| `npm run lint`      | ESLint                                              |
| `npm run verify`    | typecheck + test + build, in that order             |

## Deploying to Vercel

1. Push this repository to GitHub, then **Add New… → Project** on Vercel and
   import it. The framework preset, build command, and output are all detected;
   nothing needs configuring.
2. **Add Redis before you invite anyone.** In the project, go to
   **Storage → Create Database → Upstash Redis** and connect it. That injects
   `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which the app picks up on its own.
3. Redeploy, then open `/api/health`. It should say `"storage": "redis"`.

### Why step 2 matters

Without those variables the app keeps rooms in the server process's memory.
That is genuinely fine locally, where there is one process. On Vercel every
request can hit a different serverless instance, so the player who created a
room and the player joining it may be talking to two different memories — the
join fails with "no room called ABCD", intermittently and confusingly. The
in-memory backend is a development convenience, not a deployment mode.

Any Upstash-compatible Redis works; the app talks to it over the REST API, so
there is no TCP connection to keep alive between invocations.

## How it fits together

```
app/
  page.tsx              screen routing; everything below is a client component
  api/rooms/            create · join · read · secret · guess · rematch · leave
components/screens/     home · create · join · lobby · pick · duel
components/             Caliper (the range meter) · GuessLog · Keypad
lib/
  game.ts               pure rules — phases, turn order, bounds, validation
  store.ts              room storage: Upstash Redis, or memory as a fallback
  server.ts             auth, redaction, id generation
  protocol.ts           the exact shape of what crosses the wire
  use-duel.ts           client state machine and the polling loop
tests/game.test.ts      rules tests
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

## Rules worth knowing

- **Guesses alternate strictly.** Whoever moves first has a real edge, so the
  first move alternates each round rather than staying with the host.
- **You can't waste a turn.** Repeating a guess, or naming a number your own
  clues have already ruled out, is rejected with a reason.
- **Locking is final.** Once you've committed your number you cannot change it.
- **Leaving frees your seat** rather than closing the room; the room is deleted
  only when nobody is left. Rooms expire six hours after the last action.
