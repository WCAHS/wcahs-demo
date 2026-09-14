-- A record of who tried to log in and which check turned them away.
--
-- Written because an admin was locked out for weeks and there was no way to
-- tell a mistyped username from a wrong password from a failed CAPTCHA: every
-- one of them shows the same "Invalid credentials" on screen, and Pages
-- Functions keep no logs you can read after the fact. The only trail was the
-- sessions table, which records successes and nothing else.
--
-- Never stores a password or any part of one.
--
-- Apply with:
--   npx wrangler d1 execute wcahs-db --remote --file=migrations/2026-09-14-login-attempts.sql

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  username TEXT,                  -- exactly as typed, so capitalisation is visible
  outcome TEXT NOT NULL,          -- ok | no_such_user | bad_password | captcha_missing | captcha_failed | malformed
  ip TEXT,
  user_agent TEXT                 -- truncated; enough to tell a phone from a desktop
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_at ON login_attempts(at DESC);
