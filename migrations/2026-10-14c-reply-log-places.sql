-- Reply tracking + shelter landmarks.
--
-- email_replies: every staff reply to a notification email. The notification's
-- Reply-To names the person who wrote in AND log+<kind>-<id>-<sig>@reply.wcahs.org;
-- Zoho sends the reply to both, Cloudflare Email Routing hands the copy to the
-- wcahs-reply-log Worker, and it lands here. Nothing is relayed — the person
-- gets the reply straight from Zoho whether or not this works.
--   kind: sub (contact/foster) | lf (lost & found) | clinic
--
-- places: landmarks staff add by hand (Goose Lake Park, the high school…) that
-- OpenStreetMap doesn't know. They come first in the Lost & Found "Where" box.
--
-- Apply BEFORE deploying:
--   npx wrangler d1 execute wcahs-db --remote --file=migrations/2026-10-14c-reply-log-places.sql

CREATE TABLE IF NOT EXISTS email_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  ref_id INTEGER NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  from_email TEXT,
  from_name TEXT,
  subject TEXT,
  snippet TEXT,                    -- first ~300 chars of the reply, quoted text removed
  message_id TEXT UNIQUE           -- the same reply arriving twice is stored once
);
CREATE INDEX IF NOT EXISTS idx_email_replies_ref ON email_replies(kind, ref_id);

CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
