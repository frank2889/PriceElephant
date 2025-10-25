-- PriceElephant Database Schema voor Hobo.nl
-- PostgreSQL schema voor price intelligence

-- Klanten tabel (Hobo.nl is eerste klant)
CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    shopify_domain VARCHAR(255) UNIQUE NOT NULL,
    shopify_access_token TEXT,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Producten van Hobo.nl
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    shopify_product_id BIGINT,
    title VARCHAR(500) NOT NULL,
    sku VARCHAR(100),
    ean VARCHAR(20),
    current_price DECIMAL(10,2),
    compare_at_price DECIMAL(10,2),
    product_url TEXT,
    image_url TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(client_id, shopify_product_id)
);

-- Concurrent prijzen (real-time scraping results)
CREATE TABLE competitor_prices (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    retailer VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    url TEXT,
    in_stock BOOLEAN DEFAULT true,
    scraped_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index voor snelle queries
CREATE INDEX idx_competitor_prices_product ON competitor_prices(product_id, scraped_at DESC);
CREATE INDEX idx_competitor_prices_retailer ON competitor_prices(retailer, scraped_at DESC);

-- Prijshistorie (voor charts)
CREATE TABLE price_history (
    id BIGSERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    price DECIMAL(10,2) NOT NULL,
    source VARCHAR(50) DEFAULT 'shopify', -- 'shopify' of 'manual'
    recorded_at TIMESTAMP DEFAULT NOW()
) PARTITION BY RANGE (recorded_at);

-- Partities per maand voor performance
CREATE TABLE price_history_2025_10 PARTITION OF price_history
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

CREATE TABLE price_history_2025_11 PARTITION OF price_history
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE INDEX idx_price_history_product ON price_history(product_id, recorded_at DESC);

-- Price alerts voor Hobo.nl klanten
CREATE TABLE price_alerts (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    target_price DECIMAL(10,2),
    alert_type VARCHAR(50) DEFAULT 'price_drop', -- 'price_drop', 'back_in_stock', 'competitor_lower'
    active BOOLEAN DEFAULT true,
    last_triggered TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_price_alerts_active ON price_alerts(product_id, active);

-- Scraping jobs (tracking welke producten wanneer gescraped moeten worden)
CREATE TABLE scraping_jobs (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    last_run TIMESTAMP,
    next_run TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scraping_jobs_next_run ON scraping_jobs(next_run) WHERE status = 'pending';

-- Analytics events
CREATE TABLE analytics_events (
    id BIGSERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL, -- 'price_check', 'alert_sent', 'scrape_completed'
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_analytics_events_client ON analytics_events(client_id, created_at DESC);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type, created_at DESC);

-- Insert Hobo.nl als eerste klant
INSERT INTO clients (name, shopify_domain, api_key) 
VALUES (
    'Hobo.nl', 
    'hobo-nl.myshopify.com', 
    'hobo_' || md5(random()::text)
) ON CONFLICT DO NOTHING;

-- Views voor quick analytics
CREATE VIEW client_dashboard AS
SELECT 
    c.name as client_name,
    COUNT(DISTINCT p.id) as total_products,
    COUNT(DISTINCT cp.retailer) as competitors_tracked,
    AVG(p.current_price) as avg_product_price,
    COUNT(DISTINCT pa.id) as active_alerts
FROM clients c
LEFT JOIN products p ON p.client_id = c.id AND p.active = true
LEFT JOIN competitor_prices cp ON cp.product_id = p.id 
    AND cp.scraped_at > NOW() - INTERVAL '24 hours'
LEFT JOIN price_alerts pa ON pa.product_id = p.id AND pa.active = true
WHERE c.active = true
GROUP BY c.id, c.name;
