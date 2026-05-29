-- Plot Holders Club Database Schema

-- Customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  birthday DATE,
  tier VARCHAR(20) NOT NULL DEFAULT 'seedling',
  lifetime_acres INT NOT NULL DEFAULT 0,
  shopify_customer_id BIGINT,
  qashier_customer_id VARCHAR(100),
  referral_code VARCHAR(20) UNIQUE,
  referred_by UUID REFERENCES customers(id),
  migration_source VARCHAR(20),
  is_merged BOOLEAN DEFAULT false,
  merged_into UUID REFERENCES customers(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_winback_sent TIMESTAMPTZ
);

-- Acres ledger (immutable records of acre awards)
CREATE TABLE acres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  channel VARCHAR(20) NOT NULL,
  source_id VARCHAR(100),
  amount INT NOT NULL DEFAULT 1,
  reason VARCHAR(50),
  order_total DECIMAL(10,2),
  outlet VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel, source_id)
);

-- Rewards redemption history
CREATE TABLE rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  tier VARCHAR(20) NOT NULL,
  reward_type VARCHAR(50) NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT now(),
  channel VARCHAR(20),
  staff_id VARCHAR(100),
  notes TEXT
);

-- Referral tracking
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES customers(id),
  referred_id UUID NOT NULL REFERENCES customers(id),
  bonus_awarded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(referrer_id, referred_id)
);

-- Shopify sync tracking (prevents duplicate webhook processing)
CREATE TABLE shopify_sync (
  order_id BIGINT PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  acres_awarded INT,
  synced_at TIMESTAMPTZ DEFAULT now()
);

-- Qashier CSV import audit log
CREATE TABLE qashier_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255),
  rows_processed INT,
  rows_matched INT,
  rows_new INT,
  imported_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_tier ON customers(tier);
CREATE INDEX idx_acres_customer_id ON acres(customer_id);
CREATE INDEX idx_acres_channel_source ON acres(channel, source_id);
CREATE INDEX idx_rewards_customer_id ON rewards(customer_id);
CREATE INDEX idx_customers_shopify_id ON customers(shopify_customer_id);
CREATE INDEX idx_customers_referral_code ON customers(referral_code);
