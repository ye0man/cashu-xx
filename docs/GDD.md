# Cashu-XX — Game Design Document v0.1

> A 30-minute, Game Boy Color–style 8-bit RPG in the browser.
> You are **XX** — a nut with sunglasses and no NUT number, a walking placeholder.
> Pay a 100-sat invoice, walk around **Nutsterdam** (an 8-bit city),
> follow the real [CONTRIBUTING.md](https://github.com/cashubtc/nuts/blob/main/CONTRIBUTING.md)
> process, get your generic spec change reviewed, implemented, and merged — and
> claw back your 100 sats as 10 cashu tokens hidden across the city and its quests.

**Status:** design locked (v0.1). See [ROADMAP.md](ROADMAP.md) for build phases and
[ARCHITECTURE.md](ARCHITECTURE.md) for the wallet/payment system.

---

## 1. High concept

- **Genre:** top-down tile RPG, single-player, browser (desktop keyboard-first).
- **Length:** ~30 min to credits, ~45 min to 100% completion.
- **Reference feel:** classic GBC-era RPGs — grid movement, 2-frame walk bob,
  typewriter text boxes, enterable buildings, signs, item jingles, one city to
  learn by heart.
- **Integration:** entry is a real BOLT11 invoice on the Minibits mint; rewards are
  real `cashuA` tokens any cashu wallet can claim. The payout mechanic *is* the
  tech demo.

**The central joke (canon):** you are literally `NUT-XX`, the placeholder from the
PR template: *"Do not try to reserve a number; the final NUT number will be
assigned by maintainers before merge."* That is your character arc.

## 2. Design pillars

1. **The process is the plot.** Every quest maps 1:1 to CONTRIBUTING.md
   (issue → PR → reviews → implementation PRs → merge). The in-game journal reads
   like the PR checklist because it is the PR checklist.
2. **Quick, fun, engaging.** 2–4 minute challenges, classic 8-bit 2–3 line text
   boxes, no walls of text, no fail states.
3. **Real ecash or nothing.** The player's 100 sats come back as 10 real cashu
   tokens. Everything the game teaches is something the player holds in their hand
   at the end.
4. **Every sprite is a pun.** Rusty the crab = cdk, Coco the coconut =
   cashu-ts + coco, Pip the python = nutshell, DJ Mac the macadamia = macadamia
   wallet, Kimi = the red team.

## 3. Tone

Warm, silly, self-aware. Sign gags and dry one-liners (EarthBound-meets-README).
NPCs say things a README would say, but in character. No irony-poisoning, no
crypto-bro hype — the mint is best-effort, the ecash is a hat-check ticket, and
the hero is a placeholder.

## 4. Story structure (CONTRIBUTING.md → acts)

| Act | Spec process (real) | Gameplay |
| --- | --- | --- |
| 0 — *Placeholder* | — | Title screen: pay the 100-sat invoice (QR). XX wakes up in Nutsterdam with no number. Tutorial walk to the lab. |
| 1 — *Open an Issue* | "Open an issue first" | **Prof. Hickory**'s lab. He frames the quest: a generic spec change (a new kind of spending condition — kept fuzzy on purpose). Mini-challenge: pick the right RFC 2119 keyword (MUST / SHOULD / MAY) in 3 sentences. Issue opened. |
| 2 — *The PR* | PR titled `NUT-XX: …` | Hickory opens the PR with you. No token yet — drafts don't pay out. Journal flips to "PR opened". |
| 3 — *Review* | Min. 2 maintainer reviews | Find two reviewers: **DJ Mac** (lost his record — fetch quest → token) and **Kimi** (red-team disclosure test → token). Both ACK → label: **"Awaiting Implementation PRs"**. |
| 4 — *Implementation PRs* | ≥2 impl PRs "Ready to Merge" | Convince **Rusty** (cdk), **Coco** (cashu-ts + coco), **Pip** (nutshell). Each runs a test → one token each. **2 of 3 triggers the endgame gate**; the third stays available post-game. |
| 5 — *The Merge Ceremony* | Spec merges first | Return to **Hickory** ("Rook" = Hickory). Ceremony at the lab; everyone you recruited attends (dialogue adapts). You are merged. Hickory assigns your number (default **NUT-31**, configurable). **Ceremony token.** |
| 6 — *Post-game* | — | Hidden tokens, 3rd implementer, receptionist tally. 100% = all 10 tokens claimed. |

### Why the 2-of-3 gate

The real CONTRIBUTING.md requires **at least two** implementation PRs across
different projects before merge. The game honors that rule: the ceremony unlocks
after two of {Rusty, Coco, Pip} are "Ready to Merge". The third is optional
completionist content, and the fact that you *can* merge without them is itself a
teaching moment (a sign says so).

## 5. Character roster

| Character | Sprite (16×24, 4-dir, 2-frame walk) | Represents | Role |
| --- | --- | --- | --- |
| **XX** | Cashu-logo nut: cream shell, purple hoodie accent, pixel sunglasses | the `NUT-XX` placeholder / generic spec change | Hero. Punchline: never gets a number until Act 5. |
| **Prof. Hickory** | Hickory nut, lab coat, tiny glasses, wild white hair | nuts repo maintainers | Quest giver; runs the ceremony. The "Rook" you return to. |
| **Rusty** | Red crab, welding goggles, wrench | **cdk** | Dockyard impl; runs the Swap Puzzle. Gruff, mechanical. |
| **Coco** | Brown coconut, green tuft, toolbelt | **cashu-ts + coco** | Palm House impl; runs the Blind Shuffle. Breezy builder. |
| **Pip** | Green python, round glasses, book | **nutshell** | Shell Library impl; runs Trace the Proof. Precise, pedantic. |
| **DJ Mac** | Macadamia nut, headphones, shades | **macadamia** wallet | Club owner; lost his record. Reviewer #1. |
| **Kimi** | Red hood, visor, messenger bag | Cashu **red team** | U-Bahn hideout; disclosure test. Reviewer #2. Speaks in calm imperatives. |
| **Receptionist** | Minibits-branded blazer, headset | Minibits mint ops | HQ lobby: tracks hidden tokens found (4 max) and is the **in-world token bank** (shows QRs for unclaimed tokens). |
| Civilians (3–5) | Palette-swapped nuts | wallets/merchants | Flavor dialogue. One sells "Döner sats" (gag). |

### Dialogue voice samples (tone lock)

- Hickory: *"Every great NUT starts as an XX. It's not an insult. It's a draft."*
- Rusty: *"Talk is cheap. Show me you can swap without losing sats in the cracks."*
- Coco: *"The mint signs what it can't see. Weird, right? Beautiful, actually."*
- Pip: *"Order of operations. Mint, swap, melt. Skip a step and you're folklore."*
- DJ Mac: *"My record's gone, man. The B-side had a jingle on it. A JINGLE."*
- Kimi: *"Found a bug? Good. Now do the boring right thing."*

## 6. World — Nutsterdam (one district, ~100×100 tiles)

A canal runs along the north, a TV-tower analogue ("**Nusssehturm**") is the
map's visual anchor, plus a U-Bahn entrance, cobblestone streets, club
basements, a Döner stand.

### Enterable interiors (8)

1. **Hickory's Lab** — start & ceremony (plants, chalkboard with RFC 2119 keywords)
2. **Café Mint** — coffee shop; **Numo POS terminal on the counter**; hidden token in the trash can out back
3. **Minibits HQ** — skyscraper lobby + reception desk (token bank + hidden-token counter)
4. **Rusty's Dockyard Workshop** — cdk crates, river view
5. **Coco's Palm House** — greenhouse, coconuts, a terminal on a workbench
6. **The Shell Library** — Pip's domain, shelves shaped like nutshells
7. **DJ Mac's Club ("Bunker")** — turntables, record crates (hidden token near the booth)
8. **Kimi's Hideout** — disused U-Bahn platform, red emergency lighting

### Open spaces

Canal promenade · Nusssehturm plaza (hidden token behind it) · park · market street.

### Required verbatim interaction

At the Numo POS terminal in Café Mint, pressing the action button says exactly:

> It's a Numo POS terminal. You tapped and paid for your espresso with ecash!

### Signs (~30, mix of hints and facts)

- *"Reviews wanted: minimum two. Bring snacks."*
- *"A proof is a promise from the mint. Like a hat-check ticket for sats."*
- *"The mint signs what it cannot see. That's the blind part."*
- *"NUT-03: swap. Break a big nut into small ones without losing the meat."*
- *"Two implementations, then merge. Not before."*
- *"People lose seeds in the trash. Check anyway?"* (hidden-token hint)
- *"Kimi was seen near the old red line."* (routing hint)
- Remaining signs to be written in P1 (full text list lives in `client/src/data/signs.ts`).

## 7. Core mechanics & controls

- **Grid movement** (tile-by-tile), 16×16 tiles, camera follow, collision layers,
  door warps with fade transitions.
- **Controls:** Arrows/WASD move · Z/Space/Enter action · X menu · Shift (hold) run.
- **Dialogue:** typewriter text box (2–3 lines), confirm to advance, choices cursor.
- **Menu (X):** `DRAFT` (PR status checklist) · `TOKENS` (ledger n/10) · `SIGNS READ` · `SAVE`.
- **Journal / DRAFT panel** mirrors CONTRIBUTING.md exactly:
  Issue opened → PR opened → Reviews n/2 → "Awaiting Implementation PRs" →
  Impl PRs n/2 → Merged. This is the player's compass.
- **No combat, no death, no fail states** except wrong quiz answers (retryable
  with a hint).

## 8. Quest challenges (each 2–4 min)

1. **Rusty — The Swap Puzzle (NUT-03):** Break/combine power-of-two proofs to pay
   three kiosks exact amounts (e.g. turn a 64 into the right 10s without losing
   sats). Teaches denominations & swap. Cursor puzzle, no twitch skill.
2. **Coco — The Blind Shuffle (NUT-00):** Shell game under coconuts with dialogue
   about blinding — *"The mint signs what it can't see — follow the message, not
   the shell."* 3 rounds + 2 question checks. Teaches blind signatures.
3. **Pip — Trace the Proof (lifecycle):** Order 5 cards: mint quote → pay invoice
   → mint proofs → swap → melt. Then fix one line of Pip's broken verification
   script (pick the right line). Teaches the money flow.
4. **DJ Mac — The Lost Record (fetch):** His record is in Café Mint's back room
   (or the library returns cart). Return it → token + the club plays a jingle.
5. **Kimi — Responsible Disclosure (3 scenarios, all must pass, retryable with
   feedback):**
   - Bug mints unlimited ecash → tell the operator privately; don't drain funds.
   - Friend wants a mainnet demo → refuse; coordinate a testnet reproduction.
   - Operator is silent → wait, escalate to the community, give time before publishing.
6. **Act 1 mini:** RFC 2119 keyword picker (3 sentences: MUST / SHOULD / MAY).

## 9. Token economy (locked)

**10 tokens × 10 sats = 100 sats. The game returns all 100 sats.**

| # | Token | Trigger | Type |
| --- | --- | --- | --- |
| 1–3 | Rusty / Coco / Pip | pass each challenge | milestone |
| 4 | DJ Mac | return the record | milestone |
| 5 | Kimi | pass the disclosure test | milestone |
| 6 | Ceremony | get merged | milestone |
| 7–10 | hidden | found in the world | hidden (part of pool) |

- Each 10-sat token = 2 proofs (8 + 2). Minibits keysets run
  `input_fee_ppk: 0` (verified against `/v1/keys`), so 100 sats round-trips exactly.
- **Fees:** the player's Lightning wallet pays routing *on top of* the 100-sat
  invoice at entry. The game absorbs any future mint fees; the player pays only
  their own wallet's fees if they later melt to Lightning. **The game never takes
  a cut.**
- Hidden spots (4): Café Mint trash can · Shell Library returns cart · behind the
  Nusssehturm · DJ Mac's booth.
- Receptionist reports `hidden: n/4` and lists unclaimed tokens.
- Progression economics: milestone tokens are earned in quest order (but any
  order works); hidden tokens can be collected from Act 0 onward. Nothing is
  missable — every token is reachable post-game.

## 10. UX / accessibility

- Keyboard-first; optional on-screen buttons later. Text-speed setting.
- QR screens pause the game and show a full-screen, high-contrast QR **plus** a
  copy button — never QR-only.
- Payment screen states: `AWAITING PAYMENT → CONFIRMING (n/3 checks) → PAID`,
  with quote countdown and automatic re-quote on expiry.
- The claim code ("Trainer ID") is shown at payment time and recoverable from the
  title screen.

## 11. Art direction & AI pipeline

All art is AI-generated (decision locked), then mechanically normalized:

- **Locked style bible:** GBC-era pixel art, 16×16 tiles, 16×24 characters,
  2-frame walk bob (classic style), strict **16-color palette** derived from the
  Cashu logo (purple `#7B2FBE` family, cream `#E8C9A0`, ink black, plus brick
  red, water blue, moss green, warm greys).
- **Pipeline per asset:** generate at high res with pinned prompt + seed →
  nearest-neighbor downscale to native size → quantize/snap to palette →
  assemble sheets (down/up/side; side mirrored for left) → Tiled/TexturePacker.
- **QA script:** reject frames with off-palette pixels above threshold or too
  many unique colors.
- **Known risk & mitigation:** AI sheets drift across frames. After 3 failed
  attempts on a sheet, drop in a solid-color placeholder so gameplay never
  blocks; retouch later. Walk cycles are the danger zone — 2 frames only.
- Portraits: skipped (authenticity).

## 12. Audio (8-bit)

- **8 tracks** (chiptune, seamless loops): Title · Overworld · Lab · Minibits HQ ·
  Club · Hideout · Ceremony · Night overworld (palette-swap mood).
- **SFX:** text blip, menu cursor, door, item-get jingle (~2 s), token-unlock sting.
- Phaser sound manager; loop points authored in the asset manifest.

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| AI sprite incoherence (top risk) | palette-snap + frame QA + placeholder fallback; 2-frame walks |
| Mint downtime / quote expiry | countdown + auto re-quote; `WALLET=mock` dev flag |
| Wallets that can't scan token QR | copy-paste fallback + claim code, always visible |
| Bearer-token leakage | never log tokens/codes; issue-once semantics in SQLite |
| Phaser 4 tilemap quirks | pin 4.2.x (proven in cypherpunk-rpg); Phaser 3 port if blocked |
| Custodial optics | trivial amounts, local-only, claim codes, no balance > 100 sats/session |

## 14. Open items (non-blocking)

- Full sign text list (P1).
- Exact challenge wireframes (P2).
- Whether the ceremony should allow choosing XX's NUT number (currently fixed at
  `NUT-31` via `config.ts`).
- Night cycle as a palette swap only vs. separate track scheduling (currently both).
