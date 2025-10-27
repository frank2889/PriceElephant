/**
 * Migration: Add pricing metadata fields
 * 
 * Adds support for:
 * - Discount percentages
 * - Sale badges
 * - Free shipping info
 * - Enhanced pricing data
 */

exports.up = function(knex) {
  return knex.schema.table('products', (table) => {
    table.integer('discount_percentage').nullable();
    table.string('discount_badge', 100).nullable();
    table.boolean('has_free_shipping').defaultTo(false);
    table.text('shipping_info').nullable();
    table.decimal('original_price', 10, 2).nullable(); // Was/compare-at price
  });
};

exports.down = function(knex) {
  return knex.schema.table('products', (table) => {
    table.dropColumn('discount_percentage');
    table.dropColumn('discount_badge');
    table.dropColumn('has_free_shipping');
    table.dropColumn('shipping_info');
    table.dropColumn('original_price');
  });
};
