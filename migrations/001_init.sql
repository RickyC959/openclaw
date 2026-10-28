-- 001: initial schema
-- Canonical schema for Atlas. Additive changes go in new migrations.

CREATE TABLE IF NOT EXISTS institution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  sso_issuer TEXT NOT NULL,
  sso_client_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institution(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'officer', 'admin')),
  oidc_sub TEXT NOT NULL,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, oidc_sub),
  UNIQUE (institution_id, email)
);

CREATE TABLE IF NOT EXISTS club (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institution(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, slug)
);

CREATE TABLE IF NOT EXISTS membership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES club(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'officer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, club_id)
);

CREATE TABLE IF NOT EXISTS event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES club(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  capacity INT CHECK (capacity IS NULL OR capacity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS rsvp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, account_id)
);

-- Opaque session tokens are stored only as hashes.
CREATE TABLE IF NOT EXISTS session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_institution_idx ON club (institution_id);
CREATE INDEX IF NOT EXISTS membership_club_idx ON membership (club_id);
CREATE INDEX IF NOT EXISTS membership_account_idx ON membership (account_id);
CREATE INDEX IF NOT EXISTS event_club_idx ON event (club_id);
CREATE INDEX IF NOT EXISTS event_starts_at_idx ON event (starts_at);
CREATE INDEX IF NOT EXISTS rsvp_account_idx ON rsvp (account_id);
CREATE INDEX IF NOT EXISTS session_account_idx ON session (account_id);
CREATE INDEX IF NOT EXISTS session_expires_idx ON session (expires_at);
