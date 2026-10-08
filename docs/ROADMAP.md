# Cashu-XX — Roadmap v0.1

Phased build plan. Scope: ~30-minute game, one city district, 7 named NPCs,
10 real cashu tokens. See [GDD.md](GDD.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

---

## P0 — Scaffold

- [x] Monorepo: `client/`, `server/`, `shared/`, `assets/`, `tools/` (workspaces)
- [x] Tooling parity with `cypherpunk-rpg`: Vite, TypeScript, Biome, Vitest
- [x] Placeholder tiles + a walking rectangle so movement is testable day one
- [x] WalletService interface + `MockWallet`
- [x] CI: `typecheck` + `lint` + `test`

**Exit:** `npm run dev` boots a walkable grey-box world.

## P1 — World & feel

- [x] Grid movement, collisions, camera follow, door warps with fades
- [x] Dialogue engine (typewriter, choices) + sign interaction
- [x] Nutsterdam overworld + 8 interiors (grey-box with doors in the right places)
- [x] ~30 signs written (`data/signs.ts`), Numo POS terminal verbatim line
- [x] Menu shell: DRAFT / TOKENS / SIGNS / SAVE

**Exit:** a 5-minute walk around Nutsterdam with readable signs, no quests yet.

## P2 — Quests & NPCs (mock wallet)

- [x] Flag/quest engine + journal mirroring CONTRIBUTING.md stages
- [x] All 7 named NPCs with dialogue
- [x] Act 1: RFC 2119 keyword mini-challenge
- [x] Rusty: Swap Puzzle · Coco: Blind Shuffle · Pip: Trace the Proof
- [x] DJ Mac: lost record fetch · Kimi: disclosure test (3 scenarios)
- [x] 2-of-3 endgame gate + ceremony scene + NUT-31 assignment
- [x] Hidden-token pickup logic (4 spots)

**Exit:** full game completable with `WALLET=mock`, fake tokens.

## P3 — Real money (Minibits mint)

- [x] `MinibitsWallet` on `@cashu/coco-core` + `@cashu/coco-sqlite`
- [x] Session + claim code ("Trainer ID") + SQLite ledger
- [x] NUT-04 mint quote → BOLT11 QR payment screen (countdown, re-quote on expiry)
- [x] Mint + NUT-03 pre-split into 10 × (8+2) bundles
- [x] Unlock → `cashuA` claim screen (QR + copy + save-for-later)
- [x] Claim-code recovery flow + receptionist token bank
- [x] Boot-time mint verification (`input_fee_ppk`, endpoints) with soft-fail UX
- [x] Mint directory: curated + manual URL selection, per-session mint, live NUT-06/NUT-02 checks
- [x] NUT-20 locked quotes (fixes mints that return an empty `pubkey`, e.g. Coinos)
- [x] End-of-run melt: cash out to a Lightning address / bolt11 invoice (early or at the ending)
- [x] `recycle` operator command for paid-but-unissued quotes

**Exit:** pay 100 sats → play → claim 100 sats back, all real, on localhost.

## P4 — Art & audio

- [x] Style bible locked (16-color palette from the Cashu logo)
- [x] AI pipeline: generate → downscale → palette-snap → sheet assemble → QA script
- [x] Character sheets (XX, Hickory, Rusty, Coco, Pip, DJ Mac, Kimi, receptionist)
- [x] Tileset + interiors dressed
- [x] 8 chiptune tracks + SFX (text, menu, door, item jingle, token sting)
- [x] Night palette swap (multiply-overlay night mode, N toggles)

**Exit:** it looks and sounds like a weird 8-bit Cashu cousin.

## P5 — Polish & release

- [x] Ending sequence + 100% completion tracking (all 10 tokens)
- [x] Accessibility pass (text speed, mute, QR polarity, copy fallbacks, Trainer ID on payment screen)
- [x] Playtest: timing, hint quality, QR scanability on real wallets (real-mint E2E verified manually)
- [x] README screenshots (gameplay screen-record still a nice-to-have)
- [x] Decide hosting: **local for now** — later self-hosted on the owner's own website

**Exit:** shippable v1 on localhost.

### Hosting decision (2026-09-30)

Local development/deployment only for v1 (`npm run dev:real`). When moving to the
owner's own website: the client is a static bundle (any web host) and the wallet
API is a small Node app with SQLite (needs Node ≥22). Keep `MINT_URL` pointed at
Minibits (or a successor) as the default — players can still switch mints per run
from the directory — and move `server/data/` (wallet seed + ledger) alongside the
deployed server, since it holds player claim codes and covers every mint used.

---

## Stretch (post-v1)

- NUT-17 websocket payment status (snappier than polling)
- Animated QR (NUT-16) for large payloads
- Third implementer bonus quest (macadamia-wallet dev cameo)
- Day/night NPC schedules
- itch.io build with remote API backend
- A `NUT-XX.md` readable in Hickory's lab (fictional RFC 2119 draft)
- Give mock mode its own database (currently shares `server/data/cashu-xx.db` with real)
