-- ═══════════════════════════════════════════════════════════════
--  Lead Engine SaaS — D1 Schema (v2 — adds OTP + rate limiting)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS orgs (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  plan         TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free','starter','pro','business')),
  credits      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','member')),
  google_id     TEXT UNIQUE,
  email_verified INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login    TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  user_agent   TEXT,
  ip           TEXT
);

-- ── OTP codes (email verification + login 2FA) ────────────────
-- type: 'verify_email' | 'login_otp' | 'password_reset'
CREATE TABLE IF NOT EXISTS otps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  code       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK(type IN ('verify_email','login_otp','password_reset')),
  expires_at TEXT NOT NULL,
  used       INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Rate limiting (auth endpoints) ────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT PRIMARY KEY,    -- e.g. "login:1.2.3.4" or "otp:user@email.com"
  attempts   INTEGER DEFAULT 0,
  window_end TEXT NOT NULL,       -- ISO timestamp: reset after this
  locked_until TEXT               -- ISO timestamp: hard block until this
);

CREATE TABLE IF NOT EXISTS credit_packages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  credits      INTEGER NOT NULL,
  price_usd    INTEGER NOT NULL,
  stripe_price_id TEXT
);
INSERT OR IGNORE INTO credit_packages (id,name,credits,price_usd) VALUES
  (1,'Starter',500,70000),(2,'Growth',2500,220000),(3,'Scale',8000,550000),(4,'Enterprise',25000,1500000);

CREATE TABLE IF NOT EXISTS credit_txns (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id     TEXT NOT NULL REFERENCES orgs(id),
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  ref_id     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT,
  email_status TEXT DEFAULT 'unknown' CHECK(email_status IN ('verified','invalid','unknown','catch_all')),
  phone        TEXT,
  website      TEXT,
  address      TEXT,
  city         TEXT,
  country      TEXT DEFAULT 'Kenya',
  industry     TEXT,
  rating       REAL,
  reviews      INTEGER DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'new'
                 CHECK(status IN ('new','contacted','replied','meeting','closed','unsubscribed','bounced')),
  source       TEXT NOT NULL DEFAULT 'Google Maps'
                 CHECK(source IN ('Google Maps','Directory','LinkedIn','Manual')),
  place_id     TEXT,
  enriched_at  TEXT,
  notes        TEXT,
  assigned_to  TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, place_id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','completed')),
  template_id   INTEGER,
  keyword       TEXT,
  location      TEXT,
  leads_count   INTEGER DEFAULT 0,
  sent_count    INTEGER DEFAULT 0,
  opened_count  INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  bounced_count INTEGER DEFAULT 0,
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  category   TEXT DEFAULT 'Cold Outreach',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outreach (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  lead_id     INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES campaigns(id),
  template_id INTEGER REFERENCES templates(id),
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  sent_at     TEXT NOT NULL DEFAULT (datetime('now')),
  opened_at   TEXT,
  replied_at  TEXT,
  bounced     INTEGER DEFAULT 0,
  message_id  TEXT
);

CREATE TABLE IF NOT EXISTS suppressed (
  org_id   TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email    TEXT NOT NULL,
  reason   TEXT DEFAULT 'unsubscribe' CHECK(reason IN ('unsubscribe','bounce','complaint','manual')),
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, email)
);

CREATE TABLE IF NOT EXISTS automation_config (
  org_id              TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  scraping_enabled    INTEGER DEFAULT 0,
  email_enabled       INTEGER DEFAULT 0,
  schedule_enabled    INTEGER DEFAULT 0,
  keywords            TEXT DEFAULT 'restaurants,hotels',
  location            TEXT DEFAULT 'Nairobi, Kenya',
  max_leads_per_run   INTEGER DEFAULT 20,
  daily_email_limit   INTEGER DEFAULT 30,
  email_delay_min     INTEGER DEFAULT 5,
  sender_email        TEXT,
  sender_name         TEXT,
  ai_tone             TEXT DEFAULT 'professional',
  use_ai              INTEGER DEFAULT 1,
  updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scrape_jobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  keyword     TEXT NOT NULL,
  location    TEXT NOT NULL,
  status      TEXT DEFAULT 'running' CHECK(status IN ('running','done','failed')),
  leads_found INTEGER DEFAULT 0,
  leads_new   INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google   ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_otps_email     ON otps(email, type);
CREATE INDEX IF NOT EXISTS idx_leads_org      ON leads(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status   ON leads(org_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_place    ON leads(org_id, place_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_org  ON campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_outreach_org   ON outreach(org_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_txns_org       ON credit_txns(org_id, created_at DESC);

-- System org for seed templates
INSERT OR IGNORE INTO orgs (id,name,slug,plan,credits) VALUES ('system','System','system','business',999999);

INSERT OR IGNORE INTO templates (org_id,name,subject,body,category) VALUES
('system','Cold Outreach — Digital Presence','Quick idea for {{business}} 💡',
'Hi {{name}},

I came across {{business}} on Google and noticed you have a solid presence in {{city}}.

I help local businesses like yours turn online visibility into real customers — through SEO, modern websites, and targeted campaigns.

Would you be open to a 15-minute call this week? I had a few specific ideas for {{business}}.

Best,
{{sender_name}}','Cold Outreach'),
('system','Follow-Up — No Reply','Re: Quick idea for {{business}}',
'Hi {{name}},

Just following up on my earlier note about {{business}}.

I know you''re busy — I''ll keep this short: we''ve helped similar businesses in {{city}} grow their leads by 40–120% in 90 days.

Worth a quick call?

{{sender_name}}','Follow Up'),
('system','Meeting Request','15 minutes for {{business}}?',
'Hi {{name}},

I''ve been researching {{industry}} businesses in {{city}} and {{business}} stood out.

I have a specific idea that could help you get more customers online. It''s worked well for others in {{city}}.

Could we find 15 minutes this week?

{{sender_name}}','Meeting');
