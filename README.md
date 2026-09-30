# Cashu-XX

<p align="center">
  <img src="docs/img/keyart.png" alt="Cashu-XX key art: a pixel-art nut hero walking through an 8-bit Berlin-inspired city" width="720" />
</p>

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

## Screenshots

| Title & payment | Nussstadt |
| --- | --- |
| <img src="docs/screenshots/2-payment.png" alt="Payment screen with a lightning invoice QR and Trainer ID" width="360" /> | <img src="docs/screenshots/3-overworld.png" alt="The hero walking the cobblestone streets of Nussstadt" width="360" /> |

| Reading the signs | Hickory's lab |
| --- | --- |
| <img src="docs/screenshots/4-dialog.png" alt="A sign dialog: a proof is a promise from the mint" width="360" /> | <img src="docs/screenshots/5-lab.png" alt="Professor Hickory's lab interior" width="360" /> |

Promo clip: [docs/media/promo.mp4](docs/media/promo.mp4)

## Status

v1 complete (P0–P5) — real Minibits mint integration: pay 100 sats, play, claim
100 sats back. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Docs

| Doc | Contents |
| --- | --- |
| [docs/GDD.md](docs/GDD.md) | Game design: story, characters, world, challenges, token economy |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Client/server design, wallet flows, QR entry & redemption, art pipeline |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Build phases P0–P5 |

## The loop

1. **Pay** — scan a 100-sat Lightning invoice (any LN wallet works). Your
   **Trainer ID** (claim code) appears on the payment screen — save it.
2. **Play** — ~30 min of quests modeled on the NUT contribution process.
3. **Claim** — 10 tokens × 10 sats, each a `cashuA` QR any cashu wallet can take
   (the receptionist at Minibits HQ re-displays any of them). The game never
   takes a cut.

Ecash on the [Minibits mint](https://minibits.cash) (best-effort beta mint —
small amounts only).

## Stack

- **Client:** Phaser 4 · TypeScript · Vite
- **Server:** Node · Fastify · SQLite · [`@cashu/coco-core`](https://github.com/cashubtc/coco) + `@cashu/coco-sqlite`
- **Art:** hand-authored GBC pixel art as code ([`client/src/art/`](client/src/art/)), inspired by New Bark Town; XX is drawn from the Cashu logo
- **Audio:** 8-bit generated tracks + SFX

## Development

```bash
npm install
npm run dev        # mock wallet — free  (client :5173, server :8787)
npm run dev:real   # real Minibits mint — real sats!
npm test           # vitest (wallet + API + world data)
```

With `dev:real`: pay the 100-sat invoice with any Lightning wallet, play, and
claim 10 × 10-sat cashu tokens with any cashu wallet.

Controls: arrows/WASD move · Z talk/read · X menu · N night · text speed and
sound in the menu's SETTINGS page.

## Credits & licenses

- Game design, code, and pixel pipeline: this repo (MIT or TBD).
- In-game pixel art is hand-authored in code (`client/src/art/`). Key art and the promo
  clip were generated via fal.ai; music and jingles generated with
  Stable Audio 2.5; all generation provenance in
  [`assets/manifest.json`](assets/manifest.json).
- SFX "Videogame Menu Select" by Fupicat and "Wooden door open-close" by Ryding
  ([Freesound](https://freesound.org)) — both **CC0 1.0**.
- Cashu protocol: [cashubtc/nuts](https://github.com/cashubtc/nuts).
