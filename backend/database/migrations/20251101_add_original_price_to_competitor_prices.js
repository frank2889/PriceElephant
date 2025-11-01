/**
 * Migration: Add original_price to competitor_prices
 * Stores "compare at" price (strikethrough/was price) for competitors
 */

exports.up = async function(knex) {
  const tableExists = await knex.schema.hasTable('competitor_prices');
  
  if (!tableExists) {
    console.log('⚠️  competitor_prices table does not exist - skipping migration');
    return;
  }

  const hasColumn = await knex.schema.hasColumn('competitor_prices', 'original_price');
  
  if (hasColumn) {
    console.log('ℹ️  original_price column already exists - skipping');
    return;
  }

  await knex.schema.table('competitor_prices', function(table) {
    table.decimal('original_price', 10, 2).nullable().comment('Compare at / was price');
  });

  console.log('✅ Added original_price column to competitor_prices');
};

exports.down = async function(knex) {
  const tableExists = await knex.schema.hasTable('competitor_prices');
  
  if (!tableExists) {
    return;
  }

  await knex.schema.table('competitor_prices', function(table) {
    table.dropColumn('original_price');
  });
};
