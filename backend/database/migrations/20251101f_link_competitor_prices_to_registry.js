/**
 * Link competitor_prices to competitor_registry
 * Enables multi-tenant scraping and EAN deduplication
 */

exports.up = async function(knex) {
  console.log('📦 Adding competitor_registry_id to competitor_prices...');
  
  const hasColumn = await knex.schema.hasColumn('competitor_prices', 'competitor_registry_id');
  
  if (!hasColumn) {
    await knex.schema.table('competitor_prices', (table) => {
      table.integer('competitor_registry_id')
        .unsigned()
        .references('id')
        .inTable('competitor_registry')
        .onDelete('SET NULL');
      
      table.string('ean', 13).nullable();  // For EAN-based deduplication
      table.boolean('shared_scrape').defaultTo(false);  // Multi-tenant flag
      
      // Indexes
      table.index(['ean', 'competitor_registry_id'], 'idx_competitor_prices_ean_registry');
    });
    
    console.log('✅ Added competitor_registry_id to competitor_prices');
  } else {
    console.log('⏭️  Column competitor_registry_id already exists');
  }
};

exports.down = async function(knex) {
  await knex.schema.table('competitor_prices', (table) => {
    table.dropColumn('competitor_registry_id');
    table.dropColumn('ean');
    table.dropColumn('shared_scrape');
  });
};
