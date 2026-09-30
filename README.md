# Cashu-XX

A Pokémon Crystal–style 8-bit browser RPG about getting merged into the Cashu spec.

You are **XX** — a nut with sunglasses and no NUT number, a walking placeholder
(`NUT-XX`). Pay a 100-sat invoice to enter **Nussstadt**, a Berlin-inspired city
populated by the Cashu ecosystem (Rusty the cdk crab, Coco the cashu-ts coconut,
Pip the nutshell python, DJ Mac the macadamia, Kimi from the red team, and
Professor Hickory). Follow the real [CONTRIBUTING.md](https://github.com/cashubtc/nuts/blob/main/CONTRIBUTING.md)
process — open an issue, get reviews, land implementation PRs — and get merged
as a new NUT.

Your 100 sats come back as **10 real cashu tokens** (10 sats each), earned at
milestones and found hidden around the city. Scan them with any cashu wallet.

## Status

P0 scaffold landed — walkable grey-box world + mock wallet loop. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Docs

| Doc | Contents |
| --- | --- |
| [docs/GDD.md](docs/GDD.md) | Game design: story, characters, world, challenges, token economy |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Client/server design, wallet flows, QR entry & redemption |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Build phases P0–P5 |

## The loop

1. **Pay** — scan a 100-sat Lightning invoice (any LN wallet works).
2. **Play** — ~30 min of quests modeled on the NUT contribution process.
3. **Claim** — 10 tokens × 10 sats, each a `cashuA` QR any cashu wallet can take.
   The game never takes a cut.

Ecash on the [Minibits mint](https://minibits.cash) (best-effort beta mint — small amounts only).

## Stack (planned)

- **Client:** Phaser 4 · TypeScript · Vite
- **Server:** Node · Fastify · SQLite · [`@cashu/coco-core`](https://github.com/cashubtc/coco)
- **Art:** AI-generated, palette-snapped GBC pixel art
- **Audio:** 8-bit generated tracks + SFX

## Development

```bash
npm install
npm run dev        # mock wallet — free  (client :5173, server :8787)
npm run dev:real   # real Minibits mint — real sats (lands in P3)
npm test           # vitest (wallet + API)
```

Walk around with arrows/WASD. Press `U` in the overworld to unlock a mock token.

## License

TBD.
