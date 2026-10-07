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
  unlockToken(sessionId: string, milestoneId: MilestoneId): Promise<{ unlockedAt: number }>; // ledger only
  getLedger(sessionId: string): Promise<LedgerRow[]>;
  payoutPreview(sessionId: string): Promise<PayoutPreviewResponse>;
  payoutToken(sessionId: string): Promise<{ token: string; amountSats: number }>; // one combined token
  meltSession(sessionId: string, request: { destination: string }): Promise<MeltResponse>;
  recoverSession(claimCode: string): Promise<{ sessionId: string; ledger: LedgerRow[]; mintUrl: string }>;
}
```

- **`MinibitsWallet`** — production. Uses `@cashu/coco-core` (proof management,
  quote lifecycle, typed event bus) with `@cashu/coco-sqlite` storage. One coco
  manager serves every mint: each session is locked to a mint URL (default
  Minibits), and the mint's keysets are added lazily (`manager.mint.addMint`) on
  first use. `createSession` vets the chosen mint through the server's cached
  `MintDirectory` (NUT-06 + NUT-02, refreshed every 60 s) and rejects only
  unreachable mints. Mint quotes are **NUT-20 locked** when the mint supports it,
  which both secures the quote and avoids a coco bug where a mint returning
  `pubkey: ""` is rejected as an ownership conflict (Coinos). **Ledger model:**
  the entry sats are minted into one pooled wallet and the server records which
  milestones each session earned; nothing is pre-split. The payout is one send of
  exactly the earned amount (§7).
- **`MockWallet`** — dev/test. Instantly marks deposits paid and fabricates a
  plausible `cashuB` payout string. Selected with `WALLET=mock`. Same interface,
  so all client code is wallet-agnostic.
- Payout serialization (one token or melt in flight per session, double-clicks
  share the result) lives in `BaseWallet`.

### Milestone IDs (stable keys, one ledger row each)

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
  melt_amount_sats INTEGER, melt_fee_sats INTEGER, melt_preimage TEXT,
  claim_op_id TEXT,               -- coco send backing the payout token (written before execute)
  claim_token TEXT,               -- the issued combined token (V4 cashuB, no DLEQ)
  claim_amount_sats INTEGER
);

CREATE TABLE bundles (            -- the per-session milestone ledger
  session_id TEXT NOT NULL,
  milestone_id TEXT NOT NULL,     -- one of the 10 stable keys
  token TEXT,                     -- NULL; only set on pre-ledger rows (old live sends)
  state TEXT NOT NULL,            -- locked | unlocked | claimed | melted | reclaimed
  unlocked_at INTEGER, issued_at INTEGER,
  PRIMARY KEY (session_id, milestone_id)
);
```

- **Earn → pay once:** `unlocked` = earned; the payout moves every unlocked row
  to `claimed` (inside the combined token) or `melted` (paid to Lightning).
  Repeating the payout returns the same stored token.
- **Crash safety:** `claim_op_id` is stored before the send executes, so a crash
  after the swap recovers that op's token instead of paying twice; `melt_op_id`
  does the same for melts.
- **Pre-ledger sessions** (rows with a stored `token`) are refused at payout and
  swept by the operator `cleanup`; `reclaimed` rows are dead.
- Tokens and claim codes are **never logged** (redact in Fastify pino config).

## 5. HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/session` | `{ mintUrl? }` → `{ sessionId, claimCode, mintUrl }` (defaults to Minibits) |
| `GET` | `/api/mints` | Curated mint directory, each verified live → `{ defaultUrl, mints[] }` |
| `GET` | `/api/mint?url=` | Verify one mint (NUT-06/NUT-02) → `{ url, online, name, feePpk, compatible }` |
| `GET` | `/api/session/:id/deposit` | Mint quote for 100 sats → `{ invoice, quoteId, expiresAt }` |
| `GET` | `/api/session/:id/deposit/status` | `{ state: awaiting_payment\|paid\|minted, bundlesReady }` |
| `POST` | `/api/session/:id/unlock` | `{ milestoneId }` → `{ unlockedAt }` (idempotent ledger write) |
| `GET` | `/api/session/:id/payout` | `{ state: open\|token\|melt_pending\|melted\|legacy, earnedCount, earnedSats, token? }` |
| `POST` | `/api/session/:id/payout/token` | One combined `{ token, amountSats, milestoneCount }` (idempotent) |
| `POST` | `/api/session/:id/melt` | `{ destination }` → NUT-05 melt of the earned sats (takes back an unredeemed token first) |
| `GET` | `/api/session/:id/ledger` | Milestone states for the journal/token UI |
| `POST` | `/api/session/claim` | `{ claimCode }` → `{ sessionId, ledger, mintUrl }` (recovery) |

All bodies zod-validated. `unlock` accepts a short-lived session token issued
with the session (not the claim code) to keep gameplay calls lightweight.

## 6. Entry flow (NUT-04)

1. Client `POST /api/session` (optionally with the mint chosen in the directory)
   → shows the **claim code ("Trainer ID")** + starts the payment scene. The
   server vets the mint from its cached directory and locks the session to it.
2. Server requests a **bolt11 mint quote for 100 sats** on the session's mint and
   returns the invoice: **one mint request** (keysets and NUT-20 support are
   loaded at boot and cached). Client renders the invoice upper-cased (denser
   alphanumeric QR) with whole-pixel modules, plus a countdown.
3. Client polls `deposit/status` every 1.5 s. That reads local state — coco's
   NUT-17 websocket watcher marks the quote paid — and only falls back to an
   explicit `checkPayment` mint call every 6 s per session.
4. When the quote is `PAID`, coco mints 100 sats into the pooled wallet; the
   server opens the session's 10-row ledger and returns `minted` — no swaps.
5. `bundlesReady: true` → game starts.

**Why the invoice used to take 10+ s:** coco rate-limits all traffic to a mint
(20 requests/min, then one every 3 s, FIFO). Abandoned unpaid quotes are never
expired by coco, so every boot re-subscribed and re-polled all of them; the
10-sends-per-payment split, 2 s `checkPayment` polls and per-request `addMint`
refreshes shared that bucket, so a new invoice queued behind them. Now
`openCocoManager` deletes expired unpaid quotes before boot, the split is gone,
and the invoice path is one request. Each quote logs `[timing] deposit quote …`.

The coco manager is warmed in the background at server start (`wallet.warmup()`),
so the first player's invoice is not gated on coco's cold start.

Quote expiry handling: on expiry the server requests a fresh quote idempotently
(old invoice abandoned); the client swaps the QR in place. A player who paid a
dead invoice can recover via claim code (server checks any pending quotes on
recovery).

## 7. Unlock & payout flow

1. Milestone event in the client (challenge passed, item found, ceremony) →
   `POST /unlock { milestoneId }` marks the ledger row `unlocked`. No ecash moves.
2. **Payout (the ending):** Prof. Hickory "bundles" the tokens and starts
   `EndingScene`, which re-sends every locally earned milestone (idempotent, covers
   finds made while offline) and calls `POST …/payout/token`:
   1. Prepare one coco send of `earned × 10` sats. If coco would hand out a long
      exact-match list of small proofs (> 5), the wallet is consolidated first
      (send the whole balance to itself and reclaim it — one swap into the
      canonical power-of-two split) and the send is prepared again.
   2. Store `claim_op_id`, execute, encode as **V4 `cashuB` with DLEQ removed**
      (`getEncodedToken(token, { removeDleq: true })`), store the token, mark the
      rows `claimed`.
   A 30-sat payout is 4 proofs (16+8+4+2), ~670 chars: QR version 18 at level L,
   drawn at 2 px per module. The old per-milestone V3+DLEQ tokens were ~610 chars
   *per proof*, and a fragmented combine reached 16 000 chars.
3. **Lightning fallback:** `L` on the ending screen → `POST …/melt`. An
   unredeemed payout token is reclaimed first (a redeemed one refuses: the player
   already has the sats); then a NUT-05 melt of the earned sats to a Lightning
   address (LNURL-pay) or bolt11 invoice, re-invoicing once if the fee reserve
   makes it unaffordable. An in-flight melt is resumed via `melt_op_id`, never
   paid twice.

**In-world token bank (status only):** the Minibits HQ receptionist lists which
tokens are found and points the player to Hickory.

**QR format notes:**

- Entry: `LNBC…` invoice QR (upper-cased: alphanumeric mode).
- Exit: one `cashuB` token QR (level L, whole-pixel modules) + copy.
- Operator withdrawals use the same compact V4 encoding.

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
- **Payout:** `systems/payout.ts` (preview, combined token, Lightning melt,
  destination prompt) drives `EndingScene`'s payout page; Hickory only confirms
  and starts the finale. The token bank is a read-only status board.
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
- `font.ts` — the 5×7 pixel font (+2-row descenders, 6×10 cells), baked into one
  atlas per text colour and registered as a Phaser RetroFont. `ui/text.ts`
  (`pixelText`, `PixelLabel`) is the only way UI draws text, always at an integer
  scale; `test/font.test.ts` fails if any string in the source uses a glyph the
  font lacks.
- The canvas scales by a whole number of **device** pixels (`main.ts`: zoom =
  ⌊fit × devicePixelRatio⌋ / devicePixelRatio, placed on a whole device pixel),
  with `roundPixels`, so every art pixel stays square and crisp under OS display
  scaling (125 %/150 %) too. QR codes are drawn with whole-pixel modules.

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
different mint per run from the directory; fee-bearing mints are allowed (swap
fees on the payout come out of the pooled wallet, melt fees out of the payout).

### Operator CLI

`server/src/admin/wallet-cli.ts` (`npm run wallet -w server -- <balance|withdraw|cleanup|recycle>`)
shares coco setup with the server via `server/src/wallet/coco.ts`; it refuses to
run while the server is up (single-writer SQLite), backs up both databases first,
and is idempotent.

- `balance` — spendable per mint, what open sessions are owed, in-flight sends.
- `withdraw` — re-issues the pool's surplus as one compact token **per mint**,
  keeping back what open sessions are owed (`--all` sweeps everything). Sends
  backing issued player payout tokens are never touched (`withdraw.ts`
  `protectedOpIds`).
- `cleanup` — one-off repair for pre-ledger wallets: reclaims the old live
  per-milestone sends and retires those rows, releases proofs left `inflight`
  with no owning operation (each checked against the mint via NUT-07: unspent →
  ready, spent → spent), closes sends stuck in `rolling_back`, then consolidates
  the fragmented proofs.
- `recycle` — a quote the mint marked PAID but never issued (e.g. an
  empty-`pubkey` ownership conflict): drops the terminal failed op and
  re-prepares/finalizes the quote, minting the stranded sats.

Note: mock and real modes currently share `server/data/cashu-xx.db`, so mock rows live
beside real ones (they are ignored, being undecodable for our mint). Giving mock its own
database is a known follow-up.

## 12. Deferred / non-goals (v1)

- No accounts, no multiplayer, no server-side game state beyond the token ledger.
- Payment detection rides coco's NUT-17 websocket watcher; the client still polls
  the server (cheap, local reads) rather than holding its own socket.
- No animated QR (NUT-16) — the compact V4 payout fits a single static QR.
- Melting pays only to bolt11/LNURL-pay; no onchain or bolt12 payout.
- Hosting (Hostinger / itch.io + API) explicitly deferred.
