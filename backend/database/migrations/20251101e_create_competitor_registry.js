/**
 * Create competitor_registry table
 * Multi-tenant architecture: Competitors are future customers
 * When customer adds "bol.com" as competitor → Auto-register as prospect
 */

exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('competitor_registry');
  
  if (hasTable) {
    console.log('⏭️  Table competitor_registry already exists');
    return;
  }

  console.log('📦 Creating competitor_registry table...');
  
  await knex.schema.createTable('competitor_registry', (table) => {
    table.increments('id').primary();
    
    // Core identity
    table.string('domain', 255).unique().notNullable();  // 'bol.com', 'coolblue.nl'
    table.string('retailer_name', 255);                   // Display name: 'bol.', 'Coolblue'
    
    // Customer status
    table.boolean('is_paying_customer').defaultTo(false);
    table.bigInteger('shopify_customer_id').nullable();   // NULL until they become customer
    table.string('shopify_domain', 255).nullable();       // 'bol.myshopify.com' when customer
    
    // Shopify integration
    table.bigInteger('shopify_collection_id').nullable(); // Collection for their products
    
    // Tracking statistics
    table.integer('total_products_tracked').defaultTo(0);
    table.integer('tracked_by_customers').defaultTo(0);  // How many customers track them
    
    // Timestamps
    table.timestamp('first_tracked_at').defaultTo(knex.fn.now());
    table.timestamp('became_customer_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('domain', 'idx_competitor_registry_domain');
    table.index(['is_paying_customer', 'shopify_customer_id'], 'idx_competitor_registry_customer');
  });

  console.log('✅ Table competitor_registry created successfully');
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('competitor_registry');
};
