/**
 * Migration: Add enhanced metadata fields
 * Adds brand, rating, review count, stock level, delivery time, and bundle info
 */

exports.up = async function(knex) {
  const hasColumns = await knex.schema.hasColumn('products', 'brand');
  
  if (hasColumns) {
    console.log('⏭️  Metadata columns already exist, skipping migration');
    return;
  }
  
  return knex.schema.table('products', (table) => {
    table.string('brand', 255);
    table.decimal('rating', 3, 2); // e.g., 4.75
    table.integer('review_count');
    table.integer('stock_level');
    table.string('delivery_time', 255);
    table.text('bundle_info');
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
