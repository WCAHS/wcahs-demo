-- MNSNAP spay/neuter clinic: registrations table + event call-to-action link.
-- Apply with:
--   npx wrangler d1 execute wcahs-db --remote --file=migrations/2026-09-11-snap-clinic.sql

-- Registrations for the MNSNAP spay/neuter clinic (and any future clinic).
-- Deliberately its own table, not form_submissions: this is a roster staff
-- work through and hand to MNSNAP as a list, not a pile of messages.
--
-- Field-for-field this mirrors MNSNAP's intake spreadsheet (first/last name,
-- cell/home phone, per-animal breed, two colours, age split into years and
-- months). Collecting it in the shape the clinic needs it is the whole point —
-- otherwise a volunteer retypes 50 animals by hand on surgery week.
--
-- cat_count/dog_count are stored rather than derived from the pets JSON so the
-- capacity check is a single SUM() instead of parsing every row's JSON.
CREATE TABLE IF NOT EXISTS clinic_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  owner_first TEXT NOT NULL,
  owner_last TEXT NOT NULL,
  -- Denormalised "First Last" so admin lists and emails don't rebuild it
  -- everywhere. Safe because a row is never edited after insert.
  owner_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_cell TEXT NOT NULL,
  phone_home TEXT,
  address TEXT,
  city TEXT,
  state TEXT DEFAULT 'MN',
  zip TEXT,
  -- JSON: [{name,species,sex,breed,color1,color2,age_years,age_months,
  --         weight,shots,health,services[]}]
  pets TEXT NOT NULL,
  pet_count INTEGER NOT NULL DEFAULT 0,
  cat_count INTEGER NOT NULL DEFAULT 0,
  dog_count INTEGER NOT NULL DEFAULT 0,
  hardship TEXT,               -- their case for a case-by-case exception
  notes TEXT,
  -- applied | approved | overflow | ineligible | cancelled
  status TEXT NOT NULL DEFAULT 'applied',
  auto_reason TEXT,            -- why the form auto-sorted it this way
  staff_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Events gain an optional call-to-action button (used by every future event too).
ALTER TABLE events ADD COLUMN cta_url TEXT;
ALTER TABLE events ADD COLUMN cta_label TEXT;

-- Per-animal capacity. Editable from Admin > Clinic, so staff change these
-- without a deploy.
INSERT INTO site_settings (key, value) VALUES ('clinic_cap_cats', '25')
  ON CONFLICT(key) DO NOTHING;
INSERT INTO site_settings (key, value) VALUES ('clinic_cap_dogs', '25')
  ON CONFLICT(key) DO NOTHING;
