-- "Overflow" was never a different kind of application — it's an applied one
-- that arrived after the spots filled. It becomes a flag on applied rather than
-- a status of its own, so staff work one queue instead of two.
--
-- Apply with:
--   npx wrangler d1 execute wcahs-db --remote --file=migrations/2026-09-11d-waitlist-flag.sql

ALTER TABLE clinic_registrations ADD COLUMN waitlisted INTEGER NOT NULL DEFAULT 0;

UPDATE clinic_registrations SET waitlisted = 1 WHERE status = 'overflow';
UPDATE clinic_registrations SET status = 'applied' WHERE status = 'overflow';
