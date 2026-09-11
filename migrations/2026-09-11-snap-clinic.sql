-- MNSNAP spay/neuter clinic: registrations table + event call-to-action link.
-- Apply with:
--   npx wrangler d1 execute wcahs-db --remote --file=migrations/2026-09-11-snap-clinic.sql

CREATE TABLE IF NOT EXISTS clinic_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  owner_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  city TEXT,
  zip TEXT,
  pets TEXT NOT NULL,
  pet_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  staff_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Events gain an optional call-to-action button (used by every future event too).
ALTER TABLE events ADD COLUMN cta_url TEXT;
ALTER TABLE events ADD COLUMN cta_label TEXT;
