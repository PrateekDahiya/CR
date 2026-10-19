# Database Bootstrap

The backend now treats MySQL as the complete game-content store. When
`DB_HOST` is configured, backend startup automatically:

1. Creates or upgrades every table from `infra/mysql/schema.sql`.
2. Upserts all 108 cards and numeric battle stats.
3. Upserts all 108 `card_mechanics` rows from `infra/mysql/card_mechanics.json`.
4. Upserts all child-unit templates from `infra/mysql/spawn_templates.json`.
5. Upserts all menu rows and sprite metadata for the full catalog.
6. Loads the resulting mechanic/template rows into the authoritative engine.

The operation is idempotent and safe for an existing database. A configured
database that cannot be bootstrapped prevents the backend from starting
matchmaking instead of silently running with partial game data.

## Fresh Database

Set these variables in the environment or `infra/.env`:

```text
DB_HOST=...
DB_USER=...
DB_PASS=...
DB_NAME=cr
DB_PORT=27884
DB_SSL=true
```

Start the backend with `npm run dev` or `npm start`. The bootstrap runs before
the HTTP/socket listener begins.

The standalone seed scripts remain available for operational use:

- `python infra/mysql/seed_catalog.py`
- `python infra/mysql/seed_card_mechanics.py`
- `python infra/mysql/seed_spawn_templates.py`

Do not use the old partial Phase 10 seed as the application data source. The
backend bootstrap is the single full-database path.
