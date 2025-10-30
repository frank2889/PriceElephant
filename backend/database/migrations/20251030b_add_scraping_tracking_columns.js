/**
 * Migration: Add scraping tracking columns to price_snapshots
 * 
 * Adds columns to track:
 * - scraping_method: Which tier was used (http, direct, proxy, webshare, ai-vision)
 * - scraping_cost: Cost in EUR for this scrape
 * - product_id: Reference to products table (was missing)
 */

exports.up = function(knex) {
  return knex.schema.raw(`
    -- Add columns to the parent table
    ALTER TABLE price_snapshots 
    ADD COLUMN IF NOT EXISTS product_id INTEGER,
    ADD COLUMN IF NOT EXISTS scraping_method VARCHAR(50),
    ADD COLUMN IF NOT EXISTS scraping_cost DECIMAL(10,6) DEFAULT 0
  `);
};

exports.down = function(knex) {
  return knex.schema.raw(`
    ALTER TABLE price_snapshots 
    DROP COLUMN IF EXISTS product_id,
    DROP COLUMN IF EXISTS scraping_method,
    DROP COLUMN IF EXISTS scraping_cost
  `);
};
