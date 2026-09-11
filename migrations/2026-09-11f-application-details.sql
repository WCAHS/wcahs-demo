-- Split the single free-text "situation" box into the three things staff
-- actually need to sort applications: what they need, whether they meet
-- MNSNAP's income guidelines, and why they should be considered if spots run
-- short. `hardship` keeps its meaning as the last of those.
--
-- Apply with:
--   npx wrangler d1 execute wcahs-db --remote --file=migrations/2026-09-11f-application-details.sql

ALTER TABLE clinic_registrations ADD COLUMN reason TEXT;
ALTER TABLE clinic_registrations ADD COLUMN income_eligible TEXT;
