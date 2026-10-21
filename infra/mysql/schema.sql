-- CR Clone MySQL schema (Aiven MySQL 8.4, db `cr`) - Phase 10.
-- Educational clone: SAME card roster/naming/stats/menus as Clash Royale structure,
-- ORIGINAL art only (emoji/CSS placeholders, no ripped Supercell binaries).
-- Apply: mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p $DB_NAME < infra/mysql/schema.sql
-- Engine: MySQL 8.4 (Aiven). All reads O(1) by PK / O(c) full roster (c=108).

CREATE TABLE IF NOT EXISTS cards (
  name VARCHAR(32) PRIMARY KEY,
  card_type ENUM('troop','spell','building','tower') NOT NULL,
  elixir TINYINT NOT NULL,
  hp INT NOT NULL DEFAULT 0,
  dmg_per_hit INT NOT NULL DEFAULT 0,
  hit_speed_ms INT NOT NULL DEFAULT 0,
  dps INT NOT NULL DEFAULT 0,
  speed_ms_per_tile INT NOT NULL DEFAULT 0 COMMENT 'x1000 tiles/sec, 0 = static',
  speed_label VARCHAR(16) NOT NULL DEFAULT '',
  range_tiles DECIMAL(4,1) NOT NULL DEFAULT 0,
  range_kind VARCHAR(16) NOT NULL DEFAULT '',
  targets VARCHAR(16) NOT NULL DEFAULT '',
  unit_count TINYINT NOT NULL DEFAULT 1,
  rarity ENUM('common','rare','epic','legendary','champion') NOT NULL,
  damage_vs_troops INT NOT NULL DEFAULT 0,
  damage_vs_towers INT NOT NULL DEFAULT 0,
  radius_tiles DECIMAL(3,1) NOT NULL DEFAULT 0,
  stun_ms INT NOT NULL DEFAULT 0,
  lifetime_ms INT NOT NULL DEFAULT 0,
  deploy_delay_ms INT NOT NULL DEFAULT 1000,
  death_burst INT NOT NULL DEFAULT 0,
  notes TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sprites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  card_name VARCHAR(32) NOT NULL,
  kind ENUM('troop','spell','building','tower','ui') NOT NULL,
  atlas_x INT NOT NULL DEFAULT 0,
  atlas_y INT NOT NULL DEFAULT 0,
  w INT NOT NULL DEFAULT 64,
  h INT NOT NULL DEFAULT 64,
  placeholder_emoji VARCHAR(16) NOT NULL DEFAULT '',
  art_path VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'original placeholder path only, never ripped binaries',
  art_note VARCHAR(255) NOT NULL DEFAULT 'original placeholder - inspired by, not copied',
  FOREIGN KEY (card_name) REFERENCES cards(name) ON DELETE CASCADE,
  INDEX idx_sprites_card (card_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus (
  label VARCHAR(32) PRIMARY KEY,
  route VARCHAR(64) NOT NULL,
  icon VARCHAR(16) NOT NULL DEFAULT '',
  sort_order TINYINT NOT NULL DEFAULT 0,
  parent VARCHAR(32) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  player_id VARCHAR(64) NOT NULL UNIQUE,
  trophies INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_trophies (trophies DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS decks (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL DEFAULT 'Battle Deck',
  cards JSON NOT NULL,
  levels JSON NOT NULL,
  tower_troop_id VARCHAR(40) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_decks_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS matches (
  id VARCHAR(64) PRIMARY KEY,
  blue_id VARCHAR(64) NULL,
  red_id VARCHAR(64) NULL,
  blue_crowns TINYINT NOT NULL DEFAULT 0,
  red_crowns TINYINT NOT NULL DEFAULT 0,
  winner VARCHAR(8) NOT NULL DEFAULT 'draw',
  duration_ms INT NOT NULL DEFAULT 0,
  season VARCHAR(8) NOT NULL DEFAULT 's1',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_matches_season (season, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS card_catalog (
  name VARCHAR(40) PRIMARY KEY,
  card_type ENUM('troop','spell','building','tower') NOT NULL,
  elixir TINYINT NOT NULL,
  rarity ENUM('common','rare','epic','legendary','champion') NOT NULL,
  playable TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = full GAME_DESIGN stats + engine support',
  note VARCHAR(255) NOT NULL DEFAULT '',
  hp INT NOT NULL DEFAULT 0,
  damage INT NOT NULL DEFAULT 0,
  hit_speed_ms INT NOT NULL DEFAULT 0,
  dps DECIMAL(10,2) NOT NULL DEFAULT 0,
  speed DECIMAL(8,3) NOT NULL DEFAULT 0,
  range_tiles DECIMAL(6,2) NOT NULL DEFAULT 0,
  sight_range DECIMAL(6,2) NOT NULL DEFAULT 0,
  targets VARCHAR(16) NOT NULL DEFAULT '',
  unit_count TINYINT NOT NULL DEFAULT 0,
  radius_tiles DECIMAL(6,2) NOT NULL DEFAULT 0,
  flying TINYINT(1) NOT NULL DEFAULT 0,
  tower_damage DECIMAL(10,2) NULL,
  INDEX idx_catalog_rarity (rarity),
  INDEX idx_catalog_elixir (elixir)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Authoritative, versioned behavior data. The TypeScript engine owns only the
-- EffectSpec schema and generic interpreters; card-specific effects live here.
CREATE TABLE IF NOT EXISTS card_mechanics (
  card_id VARCHAR(40) PRIMARY KEY,
  version INT NOT NULL DEFAULT 1,
  attack_pattern VARCHAR(16) NULL,
  targeting VARCHAR(16) NOT NULL,
  movement VARCHAR(16) NULL,
  tower_troop TINYINT(1) NOT NULL DEFAULT 0,
  on_deploy JSON NOT NULL,
  on_attack JSON NOT NULL,
  on_hit JSON NOT NULL,
  on_death JSON NOT NULL,
  periodic JSON NOT NULL,
  ability JSON NOT NULL,
  FOREIGN KEY (card_id) REFERENCES card_catalog(name) ON DELETE CASCADE,
  INDEX idx_mechanics_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Runtime-only units produced by card mechanics (Skeleton, Golemite, Egg,
-- Guardienne, etc.). They are not deck cards but are still database data.
CREATE TABLE IF NOT EXISTS card_spawn_templates (
  template_id VARCHAR(40) PRIMARY KEY,
  version INT NOT NULL DEFAULT 1,
  hp INT NOT NULL,
  damage INT NOT NULL,
  hit_speed_ms INT NOT NULL,
  speed DECIMAL(6,3) NOT NULL DEFAULT 0,
  range_tiles DECIMAL(5,2) NOT NULL DEFAULT 0,
  sight_range DECIMAL(5,2) NOT NULL DEFAULT 5.5,
  targets VARCHAR(16) NOT NULL,
  unit_count TINYINT NOT NULL DEFAULT 1,
  flying TINYINT(1) NOT NULL DEFAULT 0,
  attack_pattern VARCHAR(16) NOT NULL DEFAULT 'single',
  duration_ms INT NOT NULL DEFAULT 0,
  on_deploy JSON NOT NULL,
  on_attack JSON NOT NULL,
  on_hit JSON NOT NULL,
  on_death JSON NOT NULL,
  periodic JSON NOT NULL,
  INDEX idx_spawn_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Complete effective stat block for every catalog card at every supported level.
-- Runtime combat resolves one immutable row per card at match creation.
CREATE TABLE IF NOT EXISTS card_level_stats (
  card_id VARCHAR(40) NOT NULL,
  level TINYINT NOT NULL,
  mode VARCHAR(32) NOT NULL DEFAULT 'ladder',
  stat_version INT NOT NULL DEFAULT 1,
  hit_points INT NOT NULL DEFAULT 0,
  damage INT NOT NULL DEFAULT 0,
  hit_speed_ms INT NOT NULL DEFAULT 0,
  dps DECIMAL(10,2) NOT NULL DEFAULT 0,
  move_speed DECIMAL(8,3) NOT NULL DEFAULT 0,
  range_tiles DECIMAL(6,2) NOT NULL DEFAULT 0,
  sight_range DECIMAL(6,2) NOT NULL DEFAULT 0,
  radius_tiles DECIMAL(6,2) NOT NULL DEFAULT 0,
  unit_count TINYINT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  deploy_delay_ms INT NOT NULL DEFAULT 0,
  tower_damage DECIMAL(10,2) NULL,
  death_burst INT NOT NULL DEFAULT 0,
  death_burst_radius DECIMAL(6,2) NOT NULL DEFAULT 0,
  flying TINYINT(1) NOT NULL DEFAULT 0,
  targets VARCHAR(16) NOT NULL DEFAULT '',
  attack_pattern VARCHAR(16) NOT NULL DEFAULT 'single',
  source VARCHAR(255) NOT NULL DEFAULT '',
  is_approximation TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (card_id, level, mode, stat_version),
  FOREIGN KEY (card_id) REFERENCES card_catalog(name) ON DELETE CASCADE,
  INDEX idx_card_level_lookup (card_id, level, mode, stat_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Same normalized stat block for non-deck child units produced by mechanics.
CREATE TABLE IF NOT EXISTS spawn_template_level_stats (
  template_id VARCHAR(40) NOT NULL,
  level TINYINT NOT NULL,
  mode VARCHAR(32) NOT NULL DEFAULT 'ladder',
  stat_version INT NOT NULL DEFAULT 1,
  hit_points INT NOT NULL DEFAULT 0,
  damage INT NOT NULL DEFAULT 0,
  hit_speed_ms INT NOT NULL DEFAULT 0,
  dps DECIMAL(10,2) NOT NULL DEFAULT 0,
  move_speed DECIMAL(8,3) NOT NULL DEFAULT 0,
  range_tiles DECIMAL(6,2) NOT NULL DEFAULT 0,
  sight_range DECIMAL(6,2) NOT NULL DEFAULT 0,
  radius_tiles DECIMAL(6,2) NOT NULL DEFAULT 0,
  unit_count TINYINT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  deploy_delay_ms INT NOT NULL DEFAULT 0,
  tower_damage DECIMAL(10,2) NULL,
  death_burst INT NOT NULL DEFAULT 0,
  death_burst_radius DECIMAL(6,2) NOT NULL DEFAULT 0,
  flying TINYINT(1) NOT NULL DEFAULT 0,
  targets VARCHAR(16) NOT NULL DEFAULT '',
  attack_pattern VARCHAR(16) NOT NULL DEFAULT 'single',
  source VARCHAR(255) NOT NULL DEFAULT '',
  is_approximation TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (template_id, level, mode, stat_version),
  FOREIGN KEY (template_id) REFERENCES card_spawn_templates(template_id) ON DELETE CASCADE,
  INDEX idx_spawn_level_lookup (template_id, level, mode, stat_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Persistent player state (accounts are normally managed by the Node backend,
-- but this keeps credentials and progress in the same store as content).
CREATE TABLE IF NOT EXISTS player_accounts (
  username VARCHAR(32) PRIMARY KEY,
  player_id VARCHAR(64) NOT NULL UNIQUE,
  salt VARCHAR(64) NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  created_at_ms BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS player_profiles (
  player_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64) NOT NULL DEFAULT 'Player',
  trophies INT NOT NULL DEFAULT 0,
  coins BIGINT NOT NULL DEFAULT 500,
  gems INT NOT NULL DEFAULT 20,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  cards JSON NOT NULL,
  tower_levels JSON NOT NULL,
  king_level TINYINT NOT NULL DEFAULT 1,
  active_deck_id VARCHAR(64) NULL,
  created_at_ms BIGINT NOT NULL DEFAULT 0,
  last_seen_ms BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS player_decks (
  id VARCHAR(64) PRIMARY KEY,
  player_id VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL DEFAULT 'Battle Deck',
  cards JSON NOT NULL,
  levels JSON NOT NULL,
  tower_troop_id VARCHAR(40) NULL,
  created_at_ms BIGINT NOT NULL DEFAULT 0,
  FOREIGN KEY (player_id) REFERENCES player_profiles(player_id) ON DELETE CASCADE,
  INDEX idx_player_decks (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS battle_log (
  player_id VARCHAR(64) PRIMARY KEY,
  entries JSON NOT NULL,
  updated_at_ms BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tournament (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64) NOT NULL DEFAULT 'Tournament',
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at_ms BIGINT NOT NULL DEFAULT 0,
  payload JSON NOT NULL,
  updated_at_ms BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
