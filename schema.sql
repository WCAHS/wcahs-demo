CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  end_date TEXT,
  time TEXT,
  location TEXT,
  description TEXT,
  badge TEXT,
  color TEXT DEFAULT 'sage',
  cta_url TEXT,
  cta_label TEXT,
  -- An event can have a registration form attached. form_key names which form
  -- ('clinic' is the spay/neuter application); NULL means the event has none.
  -- Everything about running that form lives on the event row, so a second
  -- clinic next year is a new event rather than a code change, and each
  -- event keeps its own applications, capacity and open/closed state.
  form_key TEXT,
  -- open | closed | reviewing. Wording for each state is fixed in
  -- functions/api/_helpers.js, not stored per event.
  form_state TEXT NOT NULL DEFAULT 'closed',
  cap_cats INTEGER NOT NULL DEFAULT 25,
  cap_dogs INTEGER NOT NULL DEFAULT 25,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lost_found_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reporter_name TEXT NOT NULL,
  reporter_phone TEXT,
  reporter_email TEXT,
  pet_name TEXT,
  species TEXT NOT NULL,
  breed TEXT,
  color TEXT,
  gender TEXT,
  location_details TEXT,
  description TEXT,
  photo_url TEXT,
  collar_details TEXT,
  temperament TEXT,
  current_location TEXT,
  collar_status TEXT,
  resolved_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faq (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  page TEXT NOT NULL DEFAULT 'about',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS animals (
  id TEXT PRIMARY KEY,
  shelterluv_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  breed TEXT,
  sex TEXT,
  age INTEGER DEFAULT 0,
  age_display TEXT,
  size TEXT,
  weight TEXT,
  color TEXT,
  pattern TEXT,
  altered TEXT,
  microchipped INTEGER DEFAULT 0,
  description TEXT,
  cover_photo TEXT,
  photos TEXT,
  videos TEXT,
  attributes TEXT,
  adoption_fee REAL,
  adoption_fee_name TEXT,
  in_foster INTEGER DEFAULT 0,
  foster_name TEXT,
  status TEXT,
  dob TEXT,
  campus TEXT,
  location TEXT,
  location_tier2 TEXT,
  litter_group_id TEXT,
  intake_date TEXT,
  last_sl_update TEXT,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  hidden INTEGER DEFAULT 0,
  is_manual INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS animal_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  animal_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_subtype TEXT,
  event_time TEXT,
  user TEXT,
  associated_records TEXT,
  jurisdiction TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  animal_count INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS happy_tails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_name TEXT NOT NULL,
  pet_type TEXT,
  breed TEXT,
  photo_url TEXT,
  family_photo_url TEXT,
  adoption_date TEXT,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS foster_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  animal_id TEXT NOT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, animal_id)
);

CREATE TABLE IF NOT EXISTS foster_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  animal_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  update_type TEXT DEFAULT 'note',
  content TEXT,
  photo_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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
  reason TEXT,                 -- what they need done and why
  -- yes | no | unsure. Self-attested against MNSNAP's published guidelines.
  -- No figures, no proof: this is for planning, not means-testing.
  income_eligible TEXT,
  hardship TEXT,               -- why consider them if spots run short
  notes TEXT,
  -- applied | approved | ineligible | cancelled
  status TEXT NOT NULL DEFAULT 'applied',
  -- Applied after the spots for its species were already full. Not a separate
  -- status: it's the same application, it just doesn't hold a surgery slot
  -- unless someone approves it.
  waitlisted INTEGER NOT NULL DEFAULT 0,
  auto_reason TEXT,            -- why the form auto-sorted it this way
  staff_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Trackable short links: wcahs.org/<slug> redirects and counts the hit, so a
-- printed poster or QR code can be measured.
CREATE TABLE IF NOT EXISTS short_links (
  slug TEXT PRIMARY KEY,
  destination TEXT NOT NULL,
  label TEXT,
  clicks INTEGER NOT NULL DEFAULT 0,
  last_clicked_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS short_link_hits (
  slug TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (slug, day)
);
