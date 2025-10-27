/**
 * Migration: Add sitemap_configs table
 */

exports.up = function(knex) {
  return knex.schema.createTable('sitemap_configs', (table) => {
    table.bigIncrements('id').primary();
    table.string('customer_id', 50).notNullable();
    table.text('sitemap_url').notNullable();
    table.string('product_url_pattern', 500); // Regex pattern to filter product URLs
    table.jsonb('selectors'); // Custom CSS selectors
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index('customer_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('sitemap_configs');
};
