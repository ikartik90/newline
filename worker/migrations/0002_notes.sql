CREATE TABLE notes (
  user_id    TEXT NOT NULL REFERENCES users(id),
  id         TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX notes_user_updated ON notes(user_id, updated_at, id);
