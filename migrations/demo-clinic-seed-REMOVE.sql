-- Removes the demo applications added by demo-clinic-seed.sql.
-- Every seeded row has the last name "Testdata", so this cannot touch a real one.
--
--   npx wrangler d1 execute wcahs-db --remote --file=migrations/demo-clinic-seed-REMOVE.sql

DELETE FROM clinic_registrations WHERE owner_last = 'Testdata';
