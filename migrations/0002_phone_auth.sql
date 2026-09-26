ALTER TABLE users DROP COLUMN password_hash;
ALTER TABLE users RENAME COLUMN name TO first_name;
ALTER TABLE users ADD COLUMN last_name TEXT;

CREATE TABLE otp_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_otp_challenges_phone_created_at
  ON otp_challenges(phone, created_at);

CREATE TABLE otp_request_limits (
  phone_hash TEXT PRIMARY KEY NOT NULL,
  window_started_at INTEGER NOT NULL,
  last_requested_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL
);
