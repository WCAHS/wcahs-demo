-- Trackable short links. wcahs.org/snap -> /events/snap, counting each hit, so a
-- printed poster or a QR code gives some idea of whether anyone used it.
--
-- Apply with:
--   npx wrangler d1 execute wcahs-db --remote --file=migrations/2026-09-11e-short-links.sql

CREATE TABLE IF NOT EXISTS short_links (
  slug TEXT PRIMARY KEY,          -- lowercase, no slashes: "snap"
  destination TEXT NOT NULL,      -- "/events/snap" or a full external URL
  label TEXT,                     -- what it's for, e.g. "Clinic poster"
  clicks INTEGER NOT NULL DEFAULT 0,
  last_clicked_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-day counts, so staff can see when a poster went up rather than just a
-- running total.
CREATE TABLE IF NOT EXISTS short_link_hits (
  slug TEXT NOT NULL,
  day TEXT NOT NULL,              -- YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (slug, day)
);

INSERT INTO short_links (slug, destination, label) VALUES
  ('snap', '/events/snap', 'Spay/neuter clinic poster')
  ON CONFLICT(slug) DO NOTHING;
