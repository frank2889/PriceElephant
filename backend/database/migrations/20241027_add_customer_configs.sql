-- Customer Configurations
-- Stores sitemap URLs, Channable settings, and other customer-specific configs

CREATE TABLE IF NOT EXISTS customer_configs (
  id SERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL UNIQUE, -- Shopify customer ID
  
  -- Sitemap configuration
  sitemap_url VARCHAR(500),
  sitemap_product_url_pattern VARCHAR(200),
  sitemap_max_products INTEGER DEFAULT 500,
  sitemap_last_import TIMESTAMP,
  
  -- Channable configuration  
  channable_feed_url VARCHAR(500),
  channable_feed_format VARCHAR(50) DEFAULT 'xml',
  channable_company_id VARCHAR(100),
  channable_project_id VARCHAR(100),
  channable_api_token VARCHAR(255),
  channable_last_import TIMESTAMP,
  
  -- Customer metadata
  company_name VARCHAR(255),
  contact_email VARCHAR(255),
  shopify_domain VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hobo configuration
INSERT INTO customer_configs (
  customer_id, 
  sitemap_url, 
  company_name,
  sitemap_max_products
) VALUES (
  8557353828568, 
  'https://www.hobo.nl/sitemap/sitemap.xml',
  'Hobo.nl',
  10000
) ON CONFLICT (customer_id) DO UPDATE SET
  sitemap_url = EXCLUDED.sitemap_url,
  company_name = EXCLUDED.company_name,
  sitemap_max_products = EXCLUDED.sitemap_max_products,
  updated_at = CURRENT_TIMESTAMP;

-- Index for fast customer lookups
CREATE INDEX IF NOT EXISTS idx_customer_configs_customer_id ON customer_configs(customer_id);
