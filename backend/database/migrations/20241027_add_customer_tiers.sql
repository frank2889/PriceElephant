-- Customer Tier System
-- Stores tier information for PriceElephant customers

CREATE TABLE IF NOT EXISTS customer_tiers (
  id SERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL UNIQUE, -- Shopify customer ID
  tier VARCHAR(20) NOT NULL DEFAULT 'trial', -- trial, starter, professional, enterprise
  product_limit INTEGER NOT NULL DEFAULT 50, -- 0 = unlimited
  competitor_limit INTEGER NOT NULL DEFAULT 5, -- 0 = unlimited
  api_access BOOLEAN NOT NULL DEFAULT false,
  monthly_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hobo as Enterprise customer
INSERT INTO customer_tiers (customer_id, tier, product_limit, competitor_limit, api_access, monthly_price)
VALUES (8557353828568, 'enterprise', 0, 0, true, 249.00)
ON CONFLICT (customer_id) DO UPDATE SET
  tier = EXCLUDED.tier,
  product_limit = EXCLUDED.product_limit,
  competitor_limit = EXCLUDED.competitor_limit,
  api_access = EXCLUDED.api_access,
  monthly_price = EXCLUDED.monthly_price,
  updated_at = CURRENT_TIMESTAMP;

-- Index for fast customer lookups
CREATE INDEX IF NOT EXISTS idx_customer_tiers_customer_id ON customer_tiers(customer_id);
