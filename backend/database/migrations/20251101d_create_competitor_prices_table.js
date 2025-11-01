/**
 * Create competitor_prices table
 * This table stores competitor URLs and prices for each product
 */

exports.up = async function(knex) {
  // Check if table already exists
  const hasTable = await knex.schema.hasTable('competitor_prices');
  
  if (hasTable) {
    console.log('⏭️  Table competitor_prices already exists');
    return;
  }

  console.log('📦 Creating competitor_prices table...');
  
  await knex.schema.createTable('competitor_prices', (table) => {
    table.increments('id').primary();
    table.integer('product_id').references('id').inTable('products').onDelete('CASCADE');
    table.string('retailer', 100).notNullable();
    table.decimal('price', 10, 2).notNullable();
    table.decimal('original_price', 10, 2).nullable();
    table.text('url');
    table.boolean('in_stock').defaultTo(true);
    table.timestamp('scraped_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['product_id', 'scraped_at'], 'idx_competitor_prices_product');
    table.index(['retailer', 'scraped_at'], 'idx_competitor_prices_retailer');
  });

  console.log('✅ Table competitor_prices created successfully');
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('competitor_prices');
};
