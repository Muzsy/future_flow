-- Billing foundation (ADR-010). Provider identifiers, derived entitlement state
-- and the chapter ledger only: no card data, no billing address, no e-mail and
-- no webhook payload. Browser roles get no access; every row belongs to an
-- account root (ff_users) or to a subscription that does, so account deletion
-- cascades. Nothing here is read or written until billing is explicitly enabled.
CREATE TABLE aw_billing_subscriptions (
  subscription_id text PRIMARY KEY CHECK(length(subscription_id) BETWEEN 1 AND 255),
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  customer_id text NOT NULL CHECK(length(customer_id) BETWEEN 1 AND 255),
  status text NOT NULL CHECK(status IN ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  period_start timestamptz,
  period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  discounted boolean NOT NULL DEFAULT false,
  revoked text CHECK(revoked IN ('refund','dispute')),
  last_state_event_created bigint NOT NULL CHECK(last_state_event_created >= 0),
  paid_invoice_ids text[] NOT NULL DEFAULT '{}',
  refunded_invoice_ids text[] NOT NULL DEFAULT '{}',
  -- Set by recovery: the projection is closed until a newer provider state
  -- event (or an operator reconcile) has been applied.
  reconcile_required boolean NOT NULL DEFAULT false,
  -- A committed revocation whose provider-side cancellation is still to be
  -- (re)tried; closed access never depends on it.
  cancel_pending boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aw_billing_subscriptions_user ON aw_billing_subscriptions(user_id);
CREATE INDEX aw_billing_subscriptions_customer ON aw_billing_subscriptions(customer_id);

-- One chapter allowance per paid invoice (key = provider invoice id).
CREATE TABLE aw_billing_grants (
  key text PRIMARY KEY CHECK(length(key) BETWEEN 1 AND 255),
  subscription_id text NOT NULL REFERENCES aw_billing_subscriptions ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  cycle_index integer NOT NULL CHECK(cycle_index >= 1),
  amount integer NOT NULL CHECK(amount BETWEEN 1 AND 100),
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aw_billing_grants_user ON aw_billing_grants(user_id);
CREATE INDEX aw_billing_grants_subscription ON aw_billing_grants(subscription_id);

-- Reserve on generation start, consume on a durably saved new chapter, release
-- on failure. A key is idempotent per user; the free taster is one per user.
CREATE TABLE aw_billing_reservations (
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  key text NOT NULL CHECK(length(key) BETWEEN 1 AND 200),
  bucket text NOT NULL CHECK(bucket IN ('paid','taster')),
  grant_key text REFERENCES aw_billing_grants ON DELETE CASCADE,
  state text NOT NULL CHECK(state IN ('reserved','consumed','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, key),
  CHECK((bucket = 'paid') = (grant_key IS NOT NULL))
);
CREATE INDEX aw_billing_reservations_grant ON aw_billing_reservations(grant_key) WHERE state <> 'released';
CREATE INDEX aw_billing_reservations_open ON aw_billing_reservations(created_at) WHERE state = 'reserved';
CREATE UNIQUE INDEX aw_billing_one_taster ON aw_billing_reservations(user_id) WHERE bucket = 'taster' AND state <> 'released';

-- Processed provider events (idempotency). Events that could not be applied yet
-- are deliberately never recorded here.
CREATE TABLE aw_billing_events (
  event_id text PRIMARY KEY CHECK(length(event_id) BETWEEN 1 AND 255),
  subscription_id text REFERENCES aw_billing_subscriptions ON DELETE CASCADE,
  event_type text NOT NULL CHECK(length(event_type) BETWEEN 1 AND 80),
  outcome text NOT NULL CHECK(outcome IN ('applied','duplicate','stale','ignored','noted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aw_billing_events_subscription ON aw_billing_events(subscription_id);

DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['aw_billing_subscriptions','aw_billing_grants','aw_billing_reservations','aw_billing_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',item);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',item); END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',item); END IF;
  END LOOP;
END $$;
