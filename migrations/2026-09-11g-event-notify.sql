-- Notification recipients belong to the form, not to the site. An event form
-- already carries its own capacity and open/closed state; who hears about a
-- submission is the same kind of setting.
--
-- Apply with:
--   npx wrangler d1 execute wcahs-db --remote --file=migrations/2026-09-11g-event-notify.sql

ALTER TABLE events ADD COLUMN notify_emails TEXT;

-- Carry over whatever the site-level clinic setting was, if anything.
UPDATE events
SET notify_emails = (
  SELECT json_extract(value, '$.clinic') FROM site_settings WHERE key = 'notify_recipients'
)
WHERE form_key IS NOT NULL AND form_key != '';
