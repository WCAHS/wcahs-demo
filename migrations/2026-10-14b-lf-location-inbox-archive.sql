-- Lost & Found gets a real date and a real place; the inbox gets an archive.
--
-- Reports used to carry one free-text "Date & Location" box ("September 29th
-- near Gooselake park"), which can't be sorted by date or put on a map. Now:
--   seen_date  YYYY-MM-DD the pet was last seen / found (a date picker)
--   address    what the person picked or typed for the place
--   lat, lng   the exact pin. Staff see it; the public API rounds it.
-- location_details stays for landmarks and directions ("behind the Walmart").
--
-- form_submissions.archived_at: archived messages leave the Inbox tabs but are
-- kept. Read messages are archived automatically after 30 days.
--
-- addresses: open address points (MnGeo loc_addresses_open) for Waseca, Steele,
-- Le Sueur and Rice counties, loaded from ~/wcahs-devtools/addresses/addresses.sql.
-- Blue Earth and Freeborn don't publish to that dataset.
--
-- Apply BEFORE deploying:
--   npx wrangler d1 execute wcahs-db --remote --file=migrations/2026-10-14b-lf-location-inbox-archive.sql

ALTER TABLE lost_found_reports ADD COLUMN seen_date TEXT;
ALTER TABLE lost_found_reports ADD COLUMN address TEXT;
ALTER TABLE lost_found_reports ADD COLUMN lat REAL;
ALTER TABLE lost_found_reports ADD COLUMN lng REAL;

ALTER TABLE form_submissions ADD COLUMN archived_at TEXT;

CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  num TEXT NOT NULL,
  street TEXT NOT NULL,
  city TEXT,
  zip TEXT,
  county TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  search TEXT NOT NULL            -- lower-case "num street city" for LIKE matching
);
CREATE INDEX IF NOT EXISTS idx_addresses_search ON addresses(search);
