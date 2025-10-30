/**
 * Add Shopify access token to customer_configs
 * Enables multi-customer Shopify support
 */

exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('customer_configs', 'shopify_access_token');
  
  if (hasColumn) {
    console.log('ℹ️  shopify_access_token column already exists - skipping');
    return;
  }
  
  await knex.schema.table('customer_configs', function(table) {
    table.string('shopify_access_token', 255).comment('Customer-specific Shopify access token');
  });
  
  console.log('✅ Added shopify_access_token column to customer_configs');
};

exports.down = function(knex) {
  return knex.schema.table('customer_configs', function(table) {
    table.dropColumn('shopify_access_token');
  });
};
