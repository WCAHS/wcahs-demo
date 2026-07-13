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
