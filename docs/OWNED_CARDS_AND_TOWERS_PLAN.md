# Owned Cards, Random Decks, AI Levels, and Crown Towers

Status: implemented

## Goals

1. Deck building may only use cards the player owns (unlocked).
2. Locked cards stay visible but cannot be added or generated.
3. Random Deck draws only from owned cards.
4. AI opponent cards are normalized to the player's average card level.
5. Crown towers are upgraded and selected separately from deck cards.

## Ownership Model

- `Player.cards` is the authoritative owned-card map (`cardId -> level`).
- "Unlocked" = `profile.cards[cardId] > 0`.
- `profile.towerLevels` is a new separate map for crown-tower progression.
- Old profiles get tower levels lazily at level 1.
- Tower troops remain non-deck cards: they are selected as a crown-tower
  profile, not placed in the 8-card hand.

## UI Model

### My Deck tab

- Existing 8 deck slots remain the active battle deck.
- Below the slots, show an **Unlocked cards** grid.
- Locked cards are not shown in this tab (they cannot be selected).
- Filters: text search, rarity, elixir cost, sort (name/elixir/rarity).
- Filtering does not hide non-matching cards: matching cards appear in a
  separate top group and the remaining cards appear below it.

### Collection tab

- Top group: unlocked cards.
- Bottom group: locked cards, greyed out with a lock indicator.
- Same filter and sort controls. Matching cards are grouped at the top of each
  ownership section; remaining cards stay visible below.
- Locked cards open the info overlay but the Use button is disabled.

### Towers tab

- New third tab inside `/decks`.
- Lists all four crown tower troops with level, upgrade cost, Select action.
- Selecting a tower stores `cr-clone-tower-v1` locally and sends the id with the
  next match request.
- Upgrading charges coins and raises that tower's level independently.

## Backend Model

- `POST /profile/:playerId/cards/:cardId/upgrade` (existing) stays card-only.
- `POST /profile/:playerId/towers/:towerId/upgrade` adds tower progression.
- `/profile/:playerId` returns `towerLevels`.
- `validateCardLevels` accepts the selected tower-troop id as an extra allowed
  level key so the match snapshot can resolve its tower stats.
- AI practice matches compute the player deck's average level and seed every bot
  deck card at that clamped level (1..16).

## Phases

1. Backend tower progression + API + validation tolerance.
2. AI average-level deck seeding.
3. Frontend ownership gating and locked/unlocked sections.
4. Filters/sorting with grouped results.
5. Owned-only Random Deck.
6. Towers tab and tower selection transport.
7. Tests/build/commit/push.

## Acceptance

- Locked cards cannot enter My Deck or a random deck.
- Collection clearly separates unlocked and locked cards.
- Filters show matches first without removing the rest.
- Bot card levels match the player's average deck level.
- Crown tower selection and upgrades work independently of deck cards.
