# Persistence, Crown Towers, and Shop/UI Plan

Status: implemented and verified

## 1. Root Cause of Resets

Player accounts, wallets, owned cards, tower levels, and decks currently live only
in Node `Map` objects (`players.ts`, `accounts.ts`). `tsx watch` / a server restart
creates a new process, so all in-memory state is lost. MySQL already stores game
content, but not player state.

## 2. Persistence Design

Add MySQL tables:

- `player_accounts`: username, playerId, salt, password hash, created time.
- `player_profiles`: playerId, name, trophies, coins, gems, W/L/D, cards JSON,
  tower_levels JSON, king_level, active_deck_id, created time.
- `player_decks`: deck id, playerId, name, cards JSON, levels JSON,
  tower_troop_id, created time.

Startup order:

1. `ensureMysqlDatabase()` creates/upgrades tables.
2. `loadPlayerState()` reads accounts, profiles, and decks.
3. `hydrateAccounts()` / `hydratePlayers()` populate the in-memory caches.
4. Mechanics/level data hydrates as today.
5. HTTP/socket listener starts.

Writes are write-through with short coalescing: every mutation marks the player
dirty; a 200 ms flush upserts the profile and replaces that player's deck rows.
Account registration writes immediately. If MySQL is unavailable the memory
store still works, but persistence is disabled (dev fallback).

## 3. Crown Towers

### Model

- `kingLevel` is the account's King Tower level (1..16).
- `towerLevels[towerTroopId]` is the Princess/side tower level for each selected
  tower troop.
- Side tower upgrades are capped at `kingLevel`: upgrading the King is required
  before side towers can exceed it.
- The King Tower itself always uses the standard King profile; only the side
  (Princess) towers use the selected tower troop.

### API

- Existing card upgrades unchanged.
- Tower upgrade endpoint:
  - `king` -> raises `kingLevel`.
  - tower troop -> allowed only while `level < kingLevel`.
- `/profile/:id` returns `kingLevel` and `towerLevels`.

### UI

Towers tab inside `/decks`:

- King Tower row with level, cost, and Upgrade.
- Side tower rows with Select + Upgrade.
- Upgrade disabled when side level has reached the King level, with copy:
  “Upgrade King Tower first”.

## 4. Towers in Battle

- Princess towers render the selected tower troop art instead of a generic
  castle glyph, for both sides where available.
- King tower keeps the crown/standard icon.
- Falls back to the existing emoji when art is missing.

## 5. Header and Shop Cleanup

- Coin and gem pills in the top bar link to `/shop`.
- Owned-card pill links to `/collection`.
- Remove the duplicate Decks/Cards buttons inside the shop header.
- Align Daily Deal and Crown Tower card icons using the same tile sizing,
  centering, and text slots.

## 6. Verification

- Backend unit tests: persistence helpers, king/side tower rules, shop unchanged.
- Frontend production build.
- Manual API checks: register, buy/upgrade, restart backend, confirm values are
  still present.
- Playwright screenshots for `/`, `/decks` (all three tabs), `/collection`,
  `/shop`, `/battle`, `/leaderboard`, `/social`, `/lobby`, `/login`.
- Only commit when tests, build, live persistence restart, and screenshots pass.

## 7. Verification Results

- Live persistence restart: registered player, upgraded King to 2, side tower to 2,
  coins 100; backend restart restored King 2, side 2, coins 100.
- Backend: 124 unit tests passing.
- Frontend: production build passing.
- Playwright: 89/89 passing (1 worker, shared backend queue).
- Screenshots captured to `docs/screenshots/card-mechanics/`:
  home, decks (my deck/collection/towers), collection, shop, leaderboard,
  social, lobby, battle idle/live, login.
- Battle screenshot confirms AI deploys units and tower troop art renders.
- Shop screenshot confirms unowned-only deals, rarity prices, packs, and
  aligned crown-tower icons.
