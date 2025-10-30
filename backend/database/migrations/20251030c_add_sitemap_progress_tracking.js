/**
 * Migration: Add sitemap progress tracking and orphan cleanup
 * 
 * Adds:
 * - last_scraped_page: Track which sitemap page was last processed
 * - last_import_at: When the last import ran
 * - total_pages_scraped: Counter for monitoring
 */

exports.up = function(knex) {
  return knex.schema.table('sitemap_configs', function(table) {
    table.integer('last_scraped_page').defaultTo(0).comment('Last sitemap page number scraped (0 = start from beginning)');
    table.timestamp('last_import_at').nullable().comment('Timestamp of last successful import');
    table.integer('total_pages_scraped').defaultTo(0).comment('Total pages scraped in this config');
  });
};

exports.down = function(knex) {
  return knex.schema.table('sitemap_configs', function(table) {
    table.dropColumn('last_scraped_page');
    table.dropColumn('last_import_at');
    table.dropColumn('total_pages_scraped');
  });
};
