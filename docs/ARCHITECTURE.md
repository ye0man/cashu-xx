# Cashu-XX — Technical Architecture v0.1

> Wallet, payment, and client/server design. Companion to [GDD.md](GDD.md).

---

## 1. System overview

```
┌────────────────────┐   HTTP/JSON    ┌──────────────────────────┐   HTTPS    ┌─────────────────────┐
│  Phaser 4 client   │ ─────────────▶ │  Game server (Node 22+,  │ ─────────▶ │  Minibits mint      │
│  Vite + TypeScript │ ◀───────────── │  Fastify + SQLite)       │ ◀───────── │  mint.minibits.cash │
│  localhost:5173    │                │  WalletService           │   NUT-04   │  /Bitcoin           │
└────────────────────┘                │  @cashu/coco-core        │   NUT-03   │  cdk-mintd 0.17.7   │
        │                              │  @cashu/coco-sqlite      │   NUT-07   └─────────────────────┘
        │ localStorage                 └──────────────────────────┘
        ▼                                        │
   save data                                     ▼
   (position, flags, journal)             cashu-xx.db (SQLite)
                                          sessions · ledger · bundles
```

Deployment target for v1: **local-only** (`npm run dev` runs client + server on the
player's machine against a real public mint, default Minibits, selectable from the
mint directory). Hosting is a later decision; nothing in the design precludes a
remote host later.

### Verified facts (Minibits mint, checked live)

- Base URL: `https://mint.minibits.cash/Bitcoin`, `cdk-mintd/0.17.7`.
- NUT-04 bolt11 mint quotes, `sat` unit, min 1 sat, description supported.
- NUT-03 swap available (cached endpoint), NUT-07 token state check supported.
- NUT-17 websocket subscriptions supported (`bolt11_mint_quote`, `proof_state`).
- Keyset `input_fee_ppk: 0` → 100 sats round-trips **exactly**; 10 × 10-sat
  bundles need no fee reserve. Re-verify at boot and fail soft if this changes.

## 2. Repo layout

```
cashu-xx/
  docs/            GDD.md · ARCHITECTURE.md · ROADMAP.md
  client/          Phaser 4.2 · TypeScript · Vite · Vitest · Biome
    src/scenes/    Boot · Title (payment QR) · Overworld · Interior(base) ·
                   ClaimScreen · Ceremony · Ending
    src/systems/   movement(grid) · dialogue · quests · journal · tokens · save · qr
    src/data/      config.ts · npcs.ts · signs.ts · challenges.ts
    src/ui/        DialogManager · HUD · MenuManager · QRPanel
  server/          Fastify · better-sqlite3 · zod · @cashu/coco-core · @cashu/coco-sqlite
    src/wallet/    WalletService.ts · MinibitsWallet.ts · MockWallet.ts
    src/routes/    session.ts · deposit.ts · unlock.ts · ledger.ts
    src/db/        schema.sql · repo.ts
  shared/          session.ts · ledger.ts · milestones.ts (zod types)
  assets/          tiles/ sprites/ audio/  (+ manifest.json with palette/loop metadata)
  tools/           palette-qa.ts (sprite frame checker) · sheet-assemble.ts
```

Conventions mirrored from `cypherpunk-rpg`: ESM everywhere, `npm run typecheck`
(`tsc --noEmit`), `npm run lint` (Biome), Vitest for systems tests.

## 3. WalletService (server core)

One interface, two implementations:

```ts
interface WalletService {
  createSession(mintUrl?: string): Promise<{ sessionId: string; claimCode: string; mintUrl: string }>;
  getDepositQuote(sessionId: string): Promise<{ invoice: string; quoteId: string; expiresAt: number }>;
  getDepositStatus(sessionId: string): Promise<{ paid: boolean; minted: boolean }>;
  unlockToken(sessionId: string, milestoneId: MilestoneId): Promise<{ token: string; issuedAt: number }>;
  getLedger(sessionId: string): Promise<LedgerRow[]>;
  recoverSession(claimCode: string): Promise<{ sessionId: string; ledger: LedgerRow[]; mintUrl: string }>;
}
```

- **`MinibitsWallet`** — production. Uses `@cashu/coco-core` (proof management,
  quote lifecycle, typed event bus) with `@cashu/coco-sqlite` storage. One coco
  manager serves every mint: each session is locked to a mint URL (default
  Minibits), and the mint's keysets are added lazily (`manager.mint.addMint`) on
  first use. `createSession` verifies the chosen mint (NUT-06 + NUT-02) and
  rejects only unreachable mints. Mint quotes are **NUT-20 locked** when the mint
  supports it, which both secures the quote and avoids a coco bug where a mint
  returning `pubkey: ""` is rejected as an ownership conflict (Coinos). Fee-bearing
  mints are supported: the split measures the per-send input fee and shaves it off
  each bundle, so the player redeems the entry amount **net of fees**. Payout is a
  real NUT-05 **melt** to a Lightning address or bolt11 invoice (see §7).
  **Fallback library:** `@cashu/cashu-ts` if coco hits rough edges (same interface).
- **`MockWallet`** — dev/test. Instantly marks deposits paid and fabricates
  plausible `cashuA` strings. Selected with `WALLET=mock`. Same interface, so all
  client code is wallet-agnostic.

### Milestone IDs (stable keys, one bundle each)

```
impl-rusty · impl-coco · impl-pip · djmac-record · kimi-test · ceremony
hidden-pos · hidden-library · hidden-tower · hidden-booth
```

## 4. SQLite schema (draft)

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,            -- uuid
  claim_code TEXT UNIQUE NOT NULL,-- "Trainer ID", e.g. NUT-7K3M-QX2F
  auth_token TEXT NOT NULL,       -- short-lived bearer token for gameplay calls
  mint_url TEXT,                  -- normalized mint this session is locked to
  quote_id TEXT, invoice TEXT, quote_expires_at INTEGER,
  state TEXT NOT NULL,            -- created | awaiting_payment | paid | minted
  created_at INTEGER NOT NULL,
  melt_destination TEXT,          -- Lightning address / bolt11 invoice
  melt_op_id TEXT,                -- in-flight melt op (idempotent resume)
  melt_state TEXT,                -- pending | melted | failed
  melt_amount_sats INTEGER, melt_fee_sats INTEGER, melt_preimage TEXT
);

CREATE TABLE bundles (
  session_id TEXT NOT NULL,
  milestone_id TEXT NOT NULL,     -- one of the 10 stable keys
  token TEXT,                     -- serialized cashuA payload (issued once)
  state TEXT NOT NULL,            -- locked | unlocked | issued | combining | combined | melting | melted
  unlocked_at INTEGER, issued_at INTEGER,
  PRIMARY KEY (session_id, milestone_id)
);
```

- **Issue-once semantics:** `token` is generated at unlock time and never
  regenerated; re-requesting an issued bundle returns the same payload.
- **Terminal bundle states:** `reclaimed` (operator swept), `combined`, and
  `melted` (paid to the player's Lightning wallet) can never be claimed again.
  `combining`/`melting` are in-progress and recoverable.
- Tokens and claim codes are **never logged** (redact in Fastify pino config).

## 5. HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/session` | `{ mintUrl? }` → `{ sessionId, claimCode, mintUrl }` (defaults to Minibits) |
| `GET` | `/api/mints` | Curated mint directory, each verified live → `{ defaultUrl, mints[] }` |
| `GET` | `/api/mint?url=` | Verify one mint (NUT-06/NUT-02) → `{ url, online, name, feePpk, compatible }` |
| `GET` | `/api/session/:id/deposit` | Mint quote for 100 sats → `{ invoice, quoteId, expiresAt }` |
| `GET` | `/api/session/:id/deposit/status` | `{ state: awaiting_payment\|paid\|minted, bundlesReady }` |
| `POST` | `/api/session/:id/unlock` | `{ milestoneId }` → `{ token }` (idempotent) |
| `GET` | `/api/session/:id/melt` | `{ availableSats, bundleCount, meltedSats }` preview |
| `POST` | `/api/session/:id/melt` | `{ destination, milestoneIds? }` → NUT-05 melt to a Lightning address / invoice |
| `POST` | `/api/session/:id/combine` | `{ milestoneIds }` → one combined `{ token }` (recoverable) |
| `GET` | `/api/session/:id/ledger` | Bundle states for the journal/token UI |
| `POST` | `/api/session/claim` | `{ claimCode }` → `{ sessionId, ledger, mintUrl }` (recovery) |

All bodies zod-validated. `unlock` accepts a short-lived session token issued
with the session (not the claim code) to keep gameplay calls lightweight.

## 6. Entry flow (NUT-04)

1. Client `POST /api/session` (optionally with the mint chosen in the directory)
   → shows the **claim code ("Trainer ID")** + starts the payment scene. The
   server verifies the mint and locks the session to it.
2. Server requests a **bolt11 mint quote for 100 sats** on the session's mint and
   returns the invoice. Client renders a **BOLT11 QR** (raw invoice + copy
   button) with a countdown to `quote_expiresAt`.
3. Client polls `deposit/status` every 2 s (or subscribes via NUT-17 websocket).
4. When the quote is `PAID`, server **mints** 100 sats of proofs (64 + 32 + 4),
   then returns `paid`/`bundlesReady` **immediately** and **swaps (NUT-03)** the
   proofs into 10 bundles **in the background**, writing all bundle rows
   (`state=locked`) when done. Bundle size is `10 − perSendFee`: on a fee-free
   mint that is ten `(8 + 2)` tokens (100 sats out); on a fee-bearing mint the
   fee is shaved off each token (e.g. ten `(8 + 1)` tokens), so the player
   redeems the entry amount net of fees.
5. `bundlesReady: true` → game starts. A token claimed before the background
   swap finishes makes `/unlock` await the in-flight split (it is idempotent and
   serialized per session). The ten sequential swaps never gate the payment.

The coco manager is warmed in the background at server start (`wallet.warmup()`),
so the first player's invoice is not gated on coco's cold start (repos init +
`addMint` keyset fetch).

Quote expiry handling: on expiry the server requests a fresh quote idempotently
(old invoice abandoned); the client swaps the QR in place. A player who paid a
dead invoice can recover via claim code (server checks any pending quotes on
recovery).

## 7. Unlock & payout flow

1. Milestone event in the client (challenge passed, item found, ceremony) →
   `POST /unlock { milestoneId }`.
2. Server marks the bundle `unlocked`, serializes its proofs into a `cashuA`
   token string, stores it, marks `issued`, and returns it. The client treats
   this as a **secured** token (a toast + "cash out with Prof. Hickory"); the
   token string is no longer shown as a QR.
3. **Melt (the payout):** Prof. Hickory's `POST /api/session/:id/melt` is a real
   NUT-05 melt to a Lightning address (LNURL-pay) or bolt11 invoice. The player
   can cash out early (earned tokens only) or at the ending (everything left):
   1. Resolve the destination (LN address → request an invoice for the affordable
      amount; bolt11 passthrough) and create a melt quote; read `fee_reserve` and
      re-invoice once if the fee makes it unaffordable.
   2. Mark target bundles `melting` (intent), reclaim their in-flight sends, then
      `ops.melt.prepare`/`execute`.
   3. On finalize, mark the bundles `melted` and persist amount/fee/preimage on the
      session; the preimage is the proof the player was paid.
   An in-flight melt is resumed (never paid twice) via the stored `melt_op_id`; a
   failed attempt leaves the bundles `melting` and the reclaimed sats spendable,
   so a retry finishes the job. The `MeltScene`/Hickory flow then runs
   `EndingScene` with the amount received.

**In-world token bank (status only):** the Minibits HQ receptionist lists which
tokens are secured and points the player to Hickory for the melt. There is no
per-token QR claim any more — melts made the manual flow unnecessary.

**Combine (legacy, unused by the UI):** `POST /api/session/:id/combine` still
exists and folds requested tokens into one. It first *reclaims* the backing
sends (irreversible), so it is written to be recoverable: mark `combining`,
reclaim each send, send the aggregate, mark `combined`. A failure leaves bundles
`combining` with their sats spendable; a later combine sweeps them in. `unlock`
returns HTTP 409 while a bundle is `combining`/`melting`. The operator sweep
treats both as dead and marks them `reclaimed`.

**QR format notes:**

- Entry: raw `lnbc…` invoice QR (Lightning wallets accept it universally).
- Exit: no token QR — sats leave via the melt. The operator CLI still writes a
  `cashuA` token per mint to `server/data/withdrawals/` for manual sweeping.

## 8. Trust & safety model

- v1 is **local-only**: the server runs on the player's own machine; the only
  counterparty is the public mint. Custodial risk ≈ zero, but the design still
  behaves as if remote:
  - Claim codes recover all unclaimed bundles after a browser crash.
  - `unlock` is idempotent per `(sessionId, milestoneId)` — double-click safe.
  - No token/claim-code logging.
  - Per-session exposure is capped at 100 sats by construction.
- The mint is a BETA best-effort service (per its own `/v1/info` MOTD). The game
  shows this on the payment screen ("mint is best-effort — use small amounts").
- Amounts are deliberately trivial (100 sats). No balances, no deposits beyond
  the entry invoice. The only payout is the end-of-run melt to the player's own
  Lightning wallet (or the operator sweep of untouched tokens).

## 9. Client architecture

- **Scenes:** `Boot` (asset load) → `Title` (payment, claim-code entry, and the
  `MintScene` directory) → `Overworld` ↔ `Interior` (one scene class,
  data-driven maps) → `ClaimScreen` (overlay) → `Ceremony` → `Ending`.
- **Mint picker:** `MintScene` lists `GET /api/mints` (label, host, live status,
  fee), verifies pasted URLs via `GET /api/mint?url=`, and stores the choice for
  the next run in memory (`systems/mint.ts`) before the session is created.
- **Payout:** `systems/melt.ts` drives the cash-out (`GET`/`POST …/melt`), prompts
  for a Lightning address / invoice (remembered in localStorage), and runs from
  Hickory. The token bank is a read-only status board; the old per-token QR panel
  and combine option are gone from the client.
- **Movement system:** tile-locked stepping, 8 px/tile substeps for smoothness,
  collision from Tiled object layers, door warps as tile objects with target map +
  spawn coordinates.
- **Dialogue system:** script format `{ id, speaker, lines[], choices? }`, stored
  in `data/npcs.ts` and `data/signs.ts`; typewriter + confirm.
- **Quest system:** flag machine (`flags: Set<string>`) + rule table mapping
  flag transitions → journal entries → unlock calls. Journal UI reads directly
  from CONTRIBUTING.md-ordered stages.
- **Save:** localStorage `{ position, mapId, flags, journal, claimCode }`,
  auto-saved on every milestone. The claim code is the cross-device source of
  truth for tokens.
- **Maps:** code-defined data (`client/src/data/maps.ts` — walls, water, doors, sign spots, decor). Wall rects carry a render `kind` (`trees`, `building`, `furniture`, `wall`, `post`) plus roof/facade/furniture styles; `decor` rects add walkable grass, flowers and the bridge. Kinds only affect drawing — every wall rect still blocks movement, so `isWalkable`/`doorAt` consumers are unchanged.

## 10. Art & audio pipeline

**Visual art is hand-authored pixel data**, not generated images (v2 face-lift, inspired
by classic GBC-era town RPGs). It lives in `client/src/art/` and has no DOM
dependency:

- `bitmap.ts` — tiny RGBA `Bitmap` + `ascii(rows, legend)`: art is drawn as rows of
  characters; ragged rows or unknown characters throw (and fail `test/art.test.ts`).
- `palette.ts` — the soft GBC world palette (pale ground, fresh greens, lavender water)
  with Cashu purple as the accent; six roof colourways.
- `tiles.ts` — 16×16 tiles: calm dotted ground, grass, flowers, trees, water with banks,
  bridge, striped roofs, facades with windows, doors, floors, back walls, furniture.
  Texture is always regular, never random, so big areas stay clean.
- `sprites.ts` — XX (drawn from the Cashu logo: cashew crescent, left-edge shading, knob
  highlight, pixel shades), 3 facings × 3 walk poses; 9 NPCs; sign/poster/note/pickup
  props. All transparent with dark outlines.
- `compose.ts` — `renderMap(map)` bakes a whole map into one bitmap (buildings split into
  roof + facade rows, water banks from neighbours, signs as posts/posters/notes).
- `textures.ts` — uploads bitmaps to Phaser as canvas textures at boot; maps are baked
  once per session. NPCs, pickups and the player stay separate sprites.
- `client/scripts/preview-art.ts` — `npx tsx client/scripts/preview-art.ts <outDir>`
  writes 8× sprite sheets and full map renders for review without running the game.
- The canvas scales by whole numbers only (`main.ts`), with `roundPixels`, so every art
  pixel stays square and crisp.

The earlier AI-image pipeline (`tools/src/image.ts`, `sheet-assemble.ts`, `palette-qa.ts`;
raw generations in `assets/gen/`, provenance in `assets/manifest.json`) is kept for
key art only.

- Audio: Stable Audio 2.5 chiptune prompts (30s loops) + 2 generated jingles → ffmpeg
  transcode to mp3; Freesound CC0 for menu/door SFX. All in `client/public/assets/audio/`.
- Night mode is a multiply-blend overlay (`systems/lighting.ts`) rather than second
  tileset variants; `N` toggles it on outdoor maps, hideout is always night.

## 11. Dev workflow

```bash
npm install            # workspaces: client, server, shared
npm run dev            # client :5173 + server :8787 (WALLET=mock by default in dev)
npm run dev:real       # same, but WALLET=minibits (real sats!)
npm run typecheck      # all workspaces
npm run lint           # Biome
npm test               # Vitest (server wallet tests run against MockWallet)
```

`dev` uses the mock wallet so ordinary gameplay iteration costs nothing;
`dev:real` exercises the real mint end-to-end (a full test costs 100 sats + routing).

Env: `MINT_URL` sets the default mint (else Minibits). Players can pick a
different mint per run from the directory; fee-bearing mints are allowed and the
fee comes out of the player's payout.

### Operator withdrawal (unclaimed ecash)

`server/src/admin/wallet-cli.ts` (`npm run wallet -w server -- <balance|withdraw|recycle>`)
sweeps every unredeemed token back into the operator wallet and re-issues the
balance as one token **per mint** (sessions may use different mints; each
bundle is decoded against its own session's mint). It shares coco setup with the
server via `server/src/wallet/coco.ts`; it refuses to run while the server is up
(single-writer SQLite), backs up both databases first, and is idempotent. Matching is done in
`server/src/admin/withdraw.ts` by comparing the in-flight send's proof secrets to each
game bundle's decoded token, so already-redeemed tokens are skipped and a previous
withdrawal token is picked up as an orphan send. Reclaimed/melted bundles are marked
`reclaimed`; the unlock endpoint returns HTTP 410 for them. Bundles left
`combining`/`melting` are marked `reclaimed` too (their sends are swept as
orphans, and the sweep owns the wallet), so recovery cannot reissue them.

`recycle` handles the other failure mode: a quote the mint marked PAID but never
issued (e.g. an empty-`pubkey` ownership conflict). It drops the terminal failed
op and re-prepares/finalizes the quote, minting the stranded sats so `withdraw`
can sweep them.

Note: mock and real modes currently share `server/data/cashu-xx.db`, so mock rows live
beside real ones (they are ignored, being undecodable for our mint). Giving mock its own
database is a known follow-up.

## 12. Deferred / non-goals (v1)

- No accounts, no multiplayer, no server-side game state beyond the token ledger.
- No NUT-17 websockets in v1 (polling suffices) — flagged as an easy upgrade.
- No animated QR (NUT-16) — the melt replaced token QRs entirely.
- Melting pays only to bolt11/LNURL-pay; no onchain or bolt12 payout.
- Hosting (Hostinger / itch.io + API) explicitly deferred.
