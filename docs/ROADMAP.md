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
- [x] Nussstadt overworld + 8 interiors (grey-box with doors in the right places)
- [x] ~30 signs written (`data/signs.ts`), Numo POS terminal verbatim line
- [x] Menu shell: DRAFT / TOKENS / SIGNS / SAVE

**Exit:** a 5-minute walk around Nussstadt with readable signs, no quests yet.

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

**Exit:** pay 100 sats → play → claim 100 sats back, all real, on localhost.

## P4 — Art & audio

- [ ] Style bible locked (16-color palette from the Cashu logo)
- [ ] AI pipeline: generate → downscale → palette-snap → sheet assemble → QA script
- [ ] Character sheets (XX, Hickory, Rusty, Coco, Pip, DJ Mac, Kimi, receptionist)
- [ ] Tileset + interiors dressed
- [ ] 8 chiptune tracks + SFX (text, menu, door, item jingle, token sting)
- [ ] Night palette swap

**Exit:** it looks and sounds like Pokémon Crystal's weird Cashu cousin.

## P5 — Polish & release

- [ ] Ending sequence + 100% completion tracking (all 10 tokens)
- [ ] Accessibility pass (text speed, QR contrast, copy fallbacks)
- [ ] Playtest: timing, hint quality, QR scanability on real wallets
- [ ] README screenshots + a demo video
- [ ] Decide hosting (currently: local-only)

---

## Stretch (post-v1)

- NUT-17 websocket payment status (snappier than polling)
- Animated QR (NUT-16) for large payloads
- Third implementer bonus quest (macadamia-wallet dev cameo)
- Day/night NPC schedules
- itch.io build with remote API backend
- A `NUT-XX.md` readable in Hickory's lab (fictional RFC 2119 draft)
