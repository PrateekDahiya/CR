# Admin Panel, AI Update, and Clan Cleanup Plan

Status: implemented (verified 2026-10-20)

## 1. AI Bot Update

The server now sends level-matched bot decks, all 108 cards, tower profiles, and
new mechanics. The AI service still has a static 12-card table and drops unknown
hand cards, so new cards are ignored when choosing a move.

Plan:

- Generate `ai-service/cards_data.json` from the canonical 108-card table.
- Load it in `bot.py`, keeping the hand-tuned 12-card baseline as overrides so
  existing behavior/tests stay stable.
- Keep unknown-card fallback (cost from the hand entry, generic troop profile).
- Load costs/stub pool in `main.py` from the same JSON.
- Verify via pytest, bot self-check, and a live practice match.

## 2. Clan/Social Cleanup

The dedicated `/leaderboard` tab already exists.

- Clan tab shows only Clan content.
- Remove the in-tab Leaderboard section, tab button, API fetch, and
  “Open full leaderboard” link.
- Update Playwright expectations.

## 3. Admin Panel

### Admin identity

- Allowlist from `ADMIN_USERNAMES` (default `dahiya27`).
- On startup, create missing allowlisted accounts and sync an existing
  allowlisted account's password to `ADMIN_PASSWORD` (default for this dev
  build: `admin12345`; override in env). This keeps a fresh clone usable; a
  deployment should set a strong `ADMIN_PASSWORD`.
- Admin login uses the normal username/password verification plus the allowlist.
- Admin routes require an opaque 12-hour session token (random, in-memory) in
  `Authorization: Bearer <token>`; guest player tokens are rejected.
- Admin sessions are cleared on backend restart (the UI returns to login).

### Dashboard

- Total users
- Daily active users (last seen today)
- New users today
- Total coins / gems in circulation
- Total owned-card copies
- Total decks
- Recorded games
- Top players by trophies
- Player table with coins, gems, trophies, cards owned, decks, last seen

### Editing

- Set coins, gems, and trophies for a player.
- Values are validated server-side and persisted through the existing player
  write-through store.

### UI

- `/admin`: login screen, then dashboard.
- `AuthGuard` allows `/admin` so the admin login can render.
- Top bar shows an Admin link only for allowlisted accounts.
- Screenshots for admin login and dashboard.

## 4. Persistence Additions

- Add `last_seen_ms` to `player_profiles`.
- Update last-seen on player access, persisting at most once per minute.

## 5. Client Caching

- Add a shared cached fetch layer in `frontend/lib/api.ts`:
  - In-memory TTL cache + in-flight request dedupe.
  - `sessionStorage` persistence for catalog/cards/menus/levels so a reload or
    tab change renders immediately.
  - Short TTLs for wallet/shop/profile data; stale-while-revalidate for profile.
- Player context hydrates the cached profile immediately, then refreshes in the
  background.
- Page navigation must not block on repeated catalog/level API calls.
- Mutations invalidate both memory and `sessionStorage` entries by prefix.
- Playwright test asserts a reload does not refetch content endpoints.

## 6. Verification

- Backend tests for admin authorization/stats/wallet updates and AI card data.
- Frontend build.
- AI pytest + self-check.
- Admin live flow: admin login, stats, wallet edit, persisted after restart.
- Playwright suite (90 passing, including Clan cleanup and cache reload).
- Backend 128 tests passing; AI 13 tests passing; frontend production build.
- Screenshots for all pages plus admin (`13-admin-login`, `14-admin-dashboard`).
