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
player's machine against the real public Minibits mint). Hosting is a later
decision; nothing in the design precludes a remote host later.

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
  createSession(): Promise<{ sessionId: string; claimCode: string }>;
  getDepositQuote(sessionId: string): Promise<{ invoice: string; quoteId: string; expiresAt: number }>;
  getDepositStatus(sessionId: string): Promise<{ paid: boolean; minted: boolean }>;
  unlockToken(sessionId: string, milestoneId: MilestoneId): Promise<{ token: string; issuedAt: number }>;
  getLedger(sessionId: string): Promise<LedgerRow[]>;
  recoverSession(claimCode: string): Promise<{ sessionId: string; ledger: LedgerRow[] }>;
}
```

- **`MinibitsWallet`** — production. Uses `@cashu/coco-core` (proof management,
  quote lifecycle, typed event bus) with `@cashu/coco-sqlite` storage.
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
  quote_id TEXT, invoice TEXT, quote_expires_at INTEGER,
  state TEXT NOT NULL,            -- created | awaiting_payment | paid | minted
  created_at INTEGER NOT NULL
);

CREATE TABLE bundles (
  session_id TEXT NOT NULL,
  milestone_id TEXT NOT NULL,     -- one of the 10 stable keys
  token TEXT,                     -- serialized cashuA payload (issued once)
  state TEXT NOT NULL,            -- locked | unlocked | issued
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
| `POST` | `/api/session` | Create session → `{ sessionId, claimCode }` |
| `GET` | `/api/session/:id/deposit` | Mint quote for 100 sats → `{ invoice, quoteId, expiresAt }` |
| `GET` | `/api/session/:id/deposit/status` | `{ state: awaiting_payment\|paid\|minted, bundlesReady }` |
| `POST` | `/api/session/:id/unlock` | `{ milestoneId }` → `{ token }` (idempotent) |
| `GET` | `/api/session/:id/ledger` | Bundle states for the journal/token UI |
| `POST` | `/api/session/claim` | `{ claimCode }` → `{ sessionId, ledger }` (recovery) |

All bodies zod-validated. `unlock` accepts a short-lived session token issued
with the session (not the claim code) to keep gameplay calls lightweight.

## 6. Entry flow (NUT-04)

1. Client `POST /api/session` → shows the **claim code ("Trainer ID")** + starts
   the payment scene.
2. Server requests a **bolt11 mint quote for 100 sats** on the Minibits mint and
   returns the invoice. Client renders a **BOLT11 QR** (raw invoice + copy
   button) with a countdown to `quote_expiresAt`.
3. Client polls `deposit/status` every 2 s (or subscribes via NUT-17 websocket).
4. When the quote is `PAID`, server **mints** 100 sats of proofs (64 + 32 + 4),
   then **swaps (NUT-03)** into 10 pre-split bundles of (8 + 2) proofs each,
   writing all bundle rows (`state=locked`).
5. `bundlesReady: true` → game starts.

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

- **Scenes:** `Boot` (asset load) → `Title` (payment + claim-code entry) →
  `Overworld` ↔ `Interior` (one scene class, data-driven maps) → `ClaimScreen`
  (overlay) → `Ceremony` → `Ending`.
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
by Pokémon Crystal's New Bark Town). It lives in `client/src/art/` and has no DOM
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
promo/key art only.

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

### Operator withdrawal (unclaimed ecash)

`server/src/admin/wallet-cli.ts` (`npm run wallet -w server -- <balance|withdraw>`)
sweeps every unredeemed token back into the operator wallet and re-issues the whole
balance as one token. It shares coco setup with the server via
`server/src/wallet/coco.ts`; it refuses to run while the server is up (single-writer
SQLite), backs up both databases first, and is idempotent. Matching is done in
`server/src/admin/withdraw.ts` by comparing the in-flight send's proof secrets to each
game bundle's decoded token, so already-redeemed tokens are skipped and a previous
withdrawal token is picked up as an orphan send. Reclaimed bundles are marked
`reclaimed`; the unlock endpoint returns HTTP 410 for them.

Note: mock and real modes currently share `server/data/cashu-xx.db`, so mock rows live
beside real ones (they are ignored, being undecodable for our mint). Giving mock its own
database is a known follow-up.

## 12. Deferred / non-goals (v1)

- No accounts, no multiplayer, no server-side game state beyond the token ledger.
- No NUT-17 websockets in v1 (polling suffices) — flagged as an easy upgrade.
- No animated QR (NUT-16).
- No melting/swap-back through the game: once issued, tokens are the player's.
- Hosting (Hostinger / itch.io + API) explicitly deferred.
