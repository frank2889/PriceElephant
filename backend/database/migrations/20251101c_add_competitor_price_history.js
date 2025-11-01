/**
 * Migration: Add Competitor Price History Tracking
 * Stores historical price changes for competitors to enable:
 * - Year-over-year comparisons
 * - Black Friday / seasonal pricing analysis
 * - Price trend detection
 */

exports.up = async function(knex) {
  // Check if table already exists
  const tableExists = await knex.schema.hasTable('competitor_price_history');
  
  if (tableExists) {
    console.log('ℹ️  competitor_price_history table already exists - skipping');
    return;
  }

  // Create price history table
  await knex.schema.createTable('competitor_price_history', function(table) {
    table.bigIncrements('id').primary();
    table.bigInteger('product_id').notNullable();
    table.string('retailer', 100).notNullable();
    table.string('competitor_url', 500);
    
    // Price data
    table.decimal('price', 10, 2).notNullable();
    table.decimal('original_price', 10, 2).nullable(); // Compare-at price
    table.decimal('price_change', 10, 2).nullable(); // Change from previous
    table.decimal('price_change_percent', 5, 2).nullable(); // % change
    
    // Context
    table.boolean('in_stock').defaultTo(true);
    table.string('price_event', 50).nullable(); // 'black_friday', 'cyber_monday', 'sale', etc.
    table.text('notes').nullable();
    
    // Timestamps
    table.timestamp('recorded_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes for fast queries
    table.index(['product_id', 'recorded_at'], 'idx_price_history_product_date');
    table.index(['retailer', 'recorded_at'], 'idx_price_history_retailer_date');
    table.index('price_event', 'idx_price_history_event');
    
    // Foreign key (if products table exists)
    table.foreign('product_id').references('products.id').onDelete('CASCADE');
  });

  console.log('✅ Created competitor_price_history table');

  // Create price change events reference table
  await knex.schema.createTable('price_events', function(table) {
    table.increments('id').primary();
    table.string('event_name', 100).notNullable().unique();
    table.string('event_type', 50); // 'sale', 'seasonal', 'holiday', 'custom'
    table.date('event_date').notNullable();
    table.integer('event_year').notNullable();
    table.text('description');
    table.boolean('active').defaultTo(true);
    table.timestamps(true, true);
    
    table.index(['event_date', 'active'], 'idx_price_events_date');
  });

  console.log('✅ Created price_events table');

  // Seed common price events
  await knex('price_events').insert([
    {
      event_name: 'Black Friday 2024',
      event_type: 'sale',
      event_date: '2024-11-29',
      event_year: 2024,
      description: 'Black Friday - largest shopping event of the year'
    },
    {
      event_name: 'Cyber Monday 2024',
      event_type: 'sale',
      event_date: '2024-12-02',
      event_year: 2024,
      description: 'Cyber Monday - online shopping deals'
    },
    {
      event_name: 'Black Friday 2025',
      event_type: 'sale',
      event_date: '2025-11-28',
      event_year: 2025,
      description: 'Black Friday 2025'
    },
    {
      event_name: 'Cyber Monday 2025',
      event_type: 'sale',
      event_date: '2025-12-01',
      event_year: 2025,
      description: 'Cyber Monday 2025'
    },
    {
      event_name: 'Summer Sale 2025',
      event_type: 'seasonal',
      event_date: '2025-07-01',
      event_year: 2025,
      description: 'Summer sales period'
    },
    {
      event_name: 'Holiday Season 2025',
      event_type: 'seasonal',
      event_date: '2025-12-15',
      event_year: 2025,
      description: 'December holiday shopping season'
    }
  ]);

  console.log('✅ Seeded price events');
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('competitor_price_history');
  await knex.schema.dropTableIfExists('price_events');
};
