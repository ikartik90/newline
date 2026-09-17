CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  google_sub   TEXT NOT NULL UNIQUE,
  email        TEXT NOT NULL,
  name         TEXT,
  picture      TEXT,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE media_objects (
  user_id      TEXT NOT NULL REFERENCES users(id),
  key          TEXT NOT NULL,
  size         INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  filename     TEXT NOT NULL,
  alt          TEXT,
  width        INTEGER,
  height       INTEGER,
  poster       TEXT,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
