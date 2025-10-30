/**
 * Migration: Add metadata column to price_snapshots
 * 
 * Stores additional scraping metadata like:
 * - extractedBy: 'http', 'browser', 'ai-vision'
 * - responseTime: milliseconds
 * - tier: scraping tier used
 */

exports.up = function(knex) {
  return knex.schema.table('price_snapshots', function(table) {
    table.jsonb('metadata').nullable().comment('Additional scraping metadata (extractedBy, responseTime, tier)');
  });
};

exports.down = function(knex) {
  return knex.schema.table('price_snapshots', function(table) {
    table.dropColumn('metadata');
  });
};
