/**
 * Customer Configurations Table
 * Stores sitemap URLs, Channable settings, and other customer-specific configs
 */

exports.up = function(knex) {
  return knex.schema.createTable('customer_configs', function(table) {
    table.increments('id').primary();
    table.bigInteger('customer_id').notNullable().unique().comment('Shopify customer ID');
    
    // Sitemap configuration
    table.string('sitemap_url', 500);
    table.string('sitemap_product_url_pattern', 200);
    table.integer('sitemap_max_products').defaultTo(500).comment('Tier-specific limit');
    table.timestamp('sitemap_last_import');
    
    // Channable configuration
    table.string('channable_feed_url', 500);
    table.string('channable_feed_format', 50).defaultTo('xml');
    table.string('channable_company_id', 100);
    table.string('channable_project_id', 100);
    table.string('channable_api_token', 255);
    table.timestamp('channable_last_import');
    
    // Customer metadata
    table.string('company_name', 255);
    table.string('contact_email', 255);
    table.string('shopify_domain', 255);
    
    table.timestamps(true, true);
    
    // Index for fast customer lookups
    table.index('customer_id', 'idx_customer_configs_customer_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('customer_configs');
};
