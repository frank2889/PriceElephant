/**
 * Customer Tiers Table
 * Stores tier information for PriceElephant customers
 */

exports.up = function(knex) {
  return knex.schema.createTable('customer_tiers', function(table) {
    table.increments('id').primary();
    table.bigInteger('customer_id').notNullable().unique().comment('Shopify customer ID');
    table.string('tier', 20).notNullable().defaultTo('trial').comment('trial, starter, professional, enterprise');
    table.integer('product_limit').notNullable().defaultTo(50).comment('0 = unlimited');
    table.integer('competitor_limit').notNullable().defaultTo(5).comment('0 = unlimited');
    table.boolean('api_access').notNullable().defaultTo(false);
    table.decimal('monthly_price', 10, 2).notNullable().defaultTo(0.00);
    table.timestamps(true, true);
    
    // Index for fast customer lookups
    table.index('customer_id', 'idx_customer_tiers_customer_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('customer_tiers');
};
