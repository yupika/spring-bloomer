-- Spring Bloomer game log schema (D1 / SQLite)

CREATE TABLE IF NOT EXISTS games (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  uid           TEXT    NOT NULL,
  app_version   TEXT,
  num_players   INTEGER,
  num_battles   INTEGER,
  started_at    INTEGER,           -- epoch ms (client clock)
  ended_at      INTEGER,           -- epoch ms (client clock)
  winner_seat   INTEGER,           -- 0-based seat index, NULL if no winner
  win_reason    TEXT,              -- 'instant' | 'points'
  winner_score  INTEGER,
  log_json      TEXT,              -- full event log
  ua            TEXT,              -- user agent (truncated)
  received_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)  -- server clock
);

CREATE INDEX IF NOT EXISTS idx_games_uid         ON games(uid);
CREATE INDEX IF NOT EXISTS idx_games_received_at ON games(received_at);
