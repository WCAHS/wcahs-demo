-- One form_state column replaces the form_open flag and the editable
-- form_closed_message. Wording per state is fixed in code (_helpers.js) rather
-- than stored, so it can't drift between the public page and the admin preview
-- and nobody has to maintain it.
--
-- Apply with:
--   npx wrangler d1 execute wcahs-db --remote --file=migrations/2026-09-11c-form-state.sql

ALTER TABLE events ADD COLUMN form_state TEXT NOT NULL DEFAULT 'closed';

UPDATE events SET form_state = CASE WHEN form_open = 1 THEN 'open' ELSE 'closed' END;

ALTER TABLE events DROP COLUMN form_open;
ALTER TABLE events DROP COLUMN form_closed_message;
