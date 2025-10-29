/**
 * Migration: Add enhanced product fields for Sprint 2.9
 * 
 * Adds support for:
 * - Brand/manufacturer
 * - Product ratings & reviews
 * - Stock level indicators
 * - Delivery time estimates
 * - Bundle/combo deal info
 */

exports.up = async function(knex) {
  const hasColumns = await knex.schema.hasColumn('products', 'brand');
  
  if (hasColumns) {
    console.log('⏭️  Enhanced product fields already exist, skipping migration');
    return;
  }
  
  return knex.schema.table('products', (table) => {
    table.string('brand', 100).nullable();
    table.decimal('rating', 3, 2).nullable(); // 0.00 - 5.00 stars
    table.integer('review_count').nullable();
    table.integer('stock_level').nullable(); // Numeric quantity if available
    table.string('delivery_time', 255).nullable();
    table.text('bundle_info').nullable(); // Info about bundle/combo deals
  });
};

exports.down = function(knex) {
  return knex.schema.table('products', (table) => {
    table.dropColumn('brand');
    table.dropColumn('rating');
    table.dropColumn('review_count');
    table.dropColumn('stock_level');
    table.dropColumn('delivery_time');
    table.dropColumn('bundle_info');
  });
};
