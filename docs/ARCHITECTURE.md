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
  rejects only unreachable mints. Fee-bearing mints are supported: the split
  measures the per-send input fee and shaves it off each bundle, so the player
  redeems the entry amount **net of fees** (e.g. a 1-sat fee yields ten 9-sat
  tokens) instead of the last send failing.
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
  created_at INTEGER NOT NULL
);

CREATE TABLE bundles (
  session_id TEXT NOT NULL,
  milestone_id TEXT NOT NULL,     -- one of the 10 stable keys
  token TEXT,                     -- serialized cashuA payload (issued once)
  state TEXT NOT NULL,            -- locked | unlocked | issued | combining | reclaimed | combined
  unlocked_at INTEGER, issued_at INTEGER,
  PRIMARY KEY (session_id, milestone_id)
);
```

- **Issue-once semantics:** `token` is generated at unlock time and never
  regenerated; re-requesting an issued bundle returns the same payload.
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

## 7. Unlock & redemption flow

1. Milestone event in the client (challenge passed, item found, ceremony) →
   `POST /unlock { milestoneId }`.
2. Server marks the bundle `unlocked`, serializes its two proofs into a `cashuA`
   token string, stores it, marks `issued`, and returns it.
3. Client shows the **ClaimScreen**: full-screen high-contrast QR of the token
   string + **Copy token** button + "Save for later" (bundle stays listed until
   the player confirms receipt; bearer semantics mean confirmation is cosmetic —
   the payload is never re-issued).
4. The player scans with Minibits / Cashu.me / eNuts / any wallet that accepts
   token QRs, or pastes the string.

**In-world token bank:** the Minibits HQ receptionist lists unclaimed bundles and
re-displays QRs on demand — redemption UI as game content.

**Combine (receptionist):** `POST /api/session/:id/combine` folds the requested
tokens into one. Because the sats backing each bundle are locked in its own
in-flight send, combining must first *reclaim* those sends — which spends the
individual tokens at the mint — and then re-send the total once. Reclaiming is
irreversible, so the flow is written to be recoverable:

1. Mark every target bundle `combining` (intent, persisted before anything is
   spent).
2. Reclaim each backing send (or fold in a bundle already reclaimed by a prior
   attempt).
3. Send the aggregate token, then mark the bundles `combined`.

If step 3 fails (mint down / rate-limited) the bundles stay `combining`: the
reclaimed sats are sitting in the server wallet as spendable balance, and the
next combine — from any milestone, since `combining` bundles are always pulled
into the target set — finishes issuing the combined token instead of reporting
"no combinable tokens". `unlock` returns HTTP 409 while a bundle is `combining`.
The operator sweep treats `combining` as dead and marks it `reclaimed`, so a
later combine can never reissue sats the sweep already took.

**QR format notes:**

- Entry: raw `lnbc…` invoice QR (Lightning wallets accept it universally).
- Exit: raw `cashuA…` token QR. 2-proof tokens are small enough for a static QR;
  NUT-16 animated QR is not needed (revisit if bundle sizes grow).
- Copy fallback is always on screen — token QR scanning is not universally
  supported across cashu wallets, and that's fine.

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
  the entry invoice, no withdrawals through the game.

## 9. Client architecture

- **Scenes:** `Boot` (asset load) → `Title` (payment, claim-code entry, and the
  `MintScene` directory) → `Overworld` ↔ `Interior` (one scene class,
  data-driven maps) → `ClaimScreen` (overlay) → `Ceremony` → `Ending`.
- **Mint picker:** `MintScene` lists `GET /api/mints` (label, host, live status,
  fee), verifies pasted URLs via `GET /api/mint?url=`, and stores the choice for
  the next run in memory (`systems/mint.ts`) before the session is created.
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

`server/src/admin/wallet-cli.ts` (`npm run wallet -w server -- <balance|withdraw>`)
sweeps every unredeemed token back into the operator wallet and re-issues the
balance as one token **per mint** (sessions may use different mints; each
bundle is decoded against its own session's mint). It shares coco setup with the
server via `server/src/wallet/coco.ts`; it refuses to run while the server is up
(single-writer SQLite), backs up both databases first, and is idempotent. Matching is done in
`server/src/admin/withdraw.ts` by comparing the in-flight send's proof secrets to each
game bundle's decoded token, so already-redeemed tokens are skipped and a previous
withdrawal token is picked up as an orphan send. Reclaimed bundles are marked
`reclaimed`; the unlock endpoint returns HTTP 410 for them. Bundles left
`combining` by an interrupted combine are marked `reclaimed` too (their sends are
swept as orphans, and the sweep owns the wallet), so recovery cannot reissue them.

Note: mock and real modes currently share `server/data/cashu-xx.db`, so mock rows live
beside real ones (they are ignored, being undecodable for our mint). Giving mock its own
database is a known follow-up.

## 12. Deferred / non-goals (v1)

- No accounts, no multiplayer, no server-side game state beyond the token ledger.
- No NUT-17 websockets in v1 (polling suffices) — flagged as an easy upgrade.
- No animated QR (NUT-16).
- No melting/swap-back through the game: once issued, tokens are the player's.
- Hosting (Hostinger / itch.io + API) explicitly deferred.
