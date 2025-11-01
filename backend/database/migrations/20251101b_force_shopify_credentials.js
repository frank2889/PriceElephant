/**
 * Force update Shopify credentials from environment
 * This ensures credentials are set even if previous migration failed
 */

exports.up = async function(knex) {
  const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
  
  console.log('🔧 Force updating Shopify credentials...');
  console.log('   Domain from env:', shopifyDomain || 'NOT SET');
  console.log('   Token from env:', shopifyToken ? 'SET' : 'NOT SET');
  
  if (!shopifyDomain || !shopifyToken) {
    console.log('❌ SHOPIFY_SHOP_DOMAIN or SHOPIFY_ACCESS_TOKEN not set in environment!');
    console.log('💡 Please set these variables on Railway and redeploy');
    return;
  }
  
  // Update customer config
  const updated = await knex('customer_configs')
    .where({ customer_id: '8557353828568' })
    .update({
      shopify_domain: shopifyDomain,
      shopify_access_token: shopifyToken,
      updated_at: knex.fn.now()
    });
  
  if (updated > 0) {
    console.log(`✅ Updated customer 8557353828568 with Shopify credentials`);
    console.log(`   Domain: ${shopifyDomain}`);
    console.log(`   Token: SET (length ${shopifyToken.length})`);
  } else {
    console.log('❌ Customer 8557353828568 not found in customer_configs table');
  }
  
  // Verify the update
  const config = await knex('customer_configs')
    .where({ customer_id: '8557353828568' })
    .first();
  
  if (config) {
    console.log('📋 Verified:');
    console.log('   shopify_domain:', config.shopify_domain || 'NULL');
    console.log('   shopify_access_token:', config.shopify_access_token ? 'SET' : 'NULL');
  }
};

exports.down = async function(knex) {
  // No rollback needed - this is a fix
};
