-- Add UpPromote API key to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS uppromote_api_key text;

-- Affiliate members synced from UpPromote
CREATE TABLE IF NOT EXISTS affiliate_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  uppromote_id integer NOT NULL,
  email text NOT NULL,
  first_name text,
  last_name text,
  status text NOT NULL DEFAULT 'pending',
  company text,
  phone text,
  country text,
  website text,
  affiliate_link text,
  program_id integer,
  program_name text,
  coupons text[],
  paid_amount numeric DEFAULT 0,
  approved_amount numeric DEFAULT 0,
  pending_amount numeric DEFAULT 0,
  created_at_upstream timestamptz,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, uppromote_id)
);

-- Affiliate referrals synced from UpPromote
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  uppromote_id integer NOT NULL,
  order_id integer,
  order_number integer,
  affiliate_uppromote_id integer NOT NULL,
  affiliate_email text,
  affiliate_name text,
  total_sales numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  tracking_type text,
  coupon_applied text,
  customer_email text,
  created_at_upstream timestamptz,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, uppromote_id)
);

-- Hourly affiliate snapshots for KPI trends
CREATE TABLE IF NOT EXISTS affiliate_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  total_affiliates integer DEFAULT 0,
  active_affiliates integer DEFAULT 0,
  total_referrals integer DEFAULT 0,
  total_clicks integer DEFAULT 0,
  total_revenue numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, snapshot_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_affiliate_members_client ON affiliate_members(client_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_client ON affiliate_referrals(client_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_created ON affiliate_referrals(client_id, created_at_upstream);
CREATE INDEX IF NOT EXISTS idx_affiliate_snapshots_client_date ON affiliate_snapshots(client_id, snapshot_date);
