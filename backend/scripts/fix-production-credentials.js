/**
 * Fix Shopify credentials in production
 * Reads from environment and updates database
 */

require('dotenv').config();
const db = require('../config/database');

async function fixCredentials() {
  try {
    const customerId = '8557353828568';
    const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    
    console.log('🔧 Fixing Shopify credentials for customer:', customerId);
    console.log('📍 Domain from env:', shopifyDomain || 'NOT SET');
    console.log('🔑 Token from env:', shopifyAccessToken ? 'SET (length: ' + shopifyAccessToken.length + ')' : 'NOT SET');
    
    if (!shopifyDomain) {
      console.error('❌ SHOPIFY_SHOP_DOMAIN not set in environment!');
      console.log('💡 Set it on Railway: railway variables --set SHOPIFY_SHOP_DOMAIN=priceelephant.myshopify.com');
    }
    
    if (!shopifyAccessToken) {
      console.error('❌ SHOPIFY_ACCESS_TOKEN not set in environment!');
      console.log('💡 Set it on Railway with your Shopify Admin API token');
    }
    
    if (!shopifyDomain || !shopifyAccessToken) {
      console.log('\n⚠️  Skipping update - environment variables missing');
      process.exit(1);
    }
    
    // Update customer config
    const updated = await db('customer_configs')
      .where({ customer_id: customerId })
      .update({
        shopify_domain: shopifyDomain,
        shopify_access_token: shopifyAccessToken,
        updated_at: new Date()
      });
    
    console.log(`\n✅ Updated ${updated} customer config record(s)`);
    
    // Verify
    const config = await db('customer_configs')
      .where({ customer_id: customerId })
      .first();
    
    console.log('\n📋 Verified configuration:');
    console.log('   Customer ID:', config.customer_id);
    console.log('   Company:', config.company_name);
    console.log('   Domain:', config.shopify_domain);
    console.log('   Has Token:', !!config.shopify_access_token);
    console.log('   Sitemap URL:', config.sitemap_url);
    
    console.log('\n🎉 Shopify credentials updated successfully!');
    console.log('💡 Next: Run a sitemap import to create products');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixCredentials();
