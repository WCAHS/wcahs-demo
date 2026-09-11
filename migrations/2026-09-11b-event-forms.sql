-- Move clinic form settings off site_settings and onto the event they belong
-- to, so a future clinic is a new event rather than a code change and each
-- event keeps its own applications, capacity and open/closed state.
--
-- Apply with:
--   npx wrangler d1 execute wcahs-db --remote --file=migrations/2026-09-11b-event-forms.sql

ALTER TABLE events ADD COLUMN form_key TEXT;
ALTER TABLE events ADD COLUMN form_open INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN form_closed_message TEXT;
ALTER TABLE events ADD COLUMN cap_cats INTEGER NOT NULL DEFAULT 25;
ALTER TABLE events ADD COLUMN cap_dogs INTEGER NOT NULL DEFAULT 25;

-- Attach the clinic form to the MNSNAP event and carry over the settings that
-- were living in site_settings.
UPDATE events
SET form_key = 'clinic',
    cap_cats = COALESCE((SELECT CAST(value AS INTEGER) FROM site_settings WHERE key = 'clinic_cap_cats'), 25),
    cap_dogs = COALESCE((SELECT CAST(value AS INTEGER) FROM site_settings WHERE key = 'clinic_cap_dogs'), 25),
    form_open = COALESCE((SELECT CAST(value AS INTEGER) FROM site_settings WHERE key = 'clinic_applications_open'), 0),
    form_closed_message = (SELECT value FROM site_settings WHERE key = 'clinic_closed_message')
WHERE cta_url = '/snap';

-- Any applications taken before this point belong to that event.
UPDATE clinic_registrations
SET event_id = (SELECT id FROM events WHERE form_key = 'clinic' ORDER BY date DESC LIMIT 1)
WHERE event_id IS NULL;

DELETE FROM site_settings
WHERE key IN ('clinic_cap_cats','clinic_cap_dogs','clinic_applications_open','clinic_closed_message');
