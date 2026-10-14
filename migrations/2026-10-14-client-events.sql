-- What happened in the admin page itself, as seen from the staff member's phone.
--
-- Written because a staff member's "it makes me log in and circles around"
-- could only be reconstructed by guesswork: every one of the bugs behind it
-- (login form flashing, an email link silently giving up, a confirmation
-- hidden under Safari's toolbar) happened in the browser after the page had
-- loaded, where login_attempts and the server never see anything.
--
-- Kept 30 days, pruned on write. Never stores a password, a report's contents,
-- or anything typed into a form — only what the page did and how long it took.
--
-- Apply with:
--   npx wrangler d1 execute wcahs-db --remote --file=migrations/2026-10-14-client-events.sql

CREATE TABLE IF NOT EXISTS client_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  username TEXT,                  -- from the session cookie; NULL before login
  visit TEXT,                     -- random per page load, ties one visit's events together
  event TEXT NOT NULL,            -- see EVENTS in functions/api/log.js
  detail TEXT,                    -- small JSON, capped at 1000 chars
  ip TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_client_events_at ON client_events(at DESC);
CREATE INDEX IF NOT EXISTS idx_client_events_user ON client_events(username, at DESC);
CREATE INDEX IF NOT EXISTS idx_client_events_ip ON client_events(ip, at DESC);
