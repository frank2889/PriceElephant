/**
 * Migration: Add shopify_variant_id column
 * Stores the Shopify variant ID for products that are part of a multi-variant product
 */

exports.up = function(knex) {
  return knex.schema.table('products', function(table) {
    // Add shopify_variant_id for variant products
    table.bigInteger('shopify_variant_id').nullable()
      .comment('Shopify variant ID (for products that are variants)');
    
    // Add index for faster lookups
    table.index('shopify_variant_id', 'idx_products_shopify_variant_id');
    
    console.log('✅ Added shopify_variant_id column to products table');
  });
};

exports.down = function(knex) {
  return knex.schema.table('products', function(table) {
    table.dropIndex('shopify_variant_id', 'idx_products_shopify_variant_id');
    table.dropColumn('shopify_variant_id');
    
    console.log('✅ Removed shopify_variant_id column from products table');
  });
};
