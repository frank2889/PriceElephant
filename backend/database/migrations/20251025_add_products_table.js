/**
 * Migration: Add Products Table
 * Adds dedicated products table for centralized product data from Channable
 */

exports.up = async function(knex) {
  // Products table - stores all product data from Channable
  await knex.schema.createTable('products', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('shopify_customer_id').notNullable();
    table.bigInteger('shopify_product_id'); // NULL until synced to Shopify
    table.string('product_name', 500).notNullable();
    table.string('product_ean', 20);
    table.string('product_sku', 100);
    table.string('brand', 200);
    table.string('category', 200);
    table.decimal('own_price', 10, 2); // Customer's selling price
    table.text('product_url');
    table.text('image_url');
    table.string('channable_product_id', 100); // External ID from Channable
    table.boolean('active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index('shopify_customer_id');
    table.index('product_ean');
    table.index('shopify_product_id');
    table.index(['shopify_customer_id', 'product_ean']); // Composite for duplicate detection
    table.index(['shopify_customer_id', 'channable_product_id']);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('products');
};
