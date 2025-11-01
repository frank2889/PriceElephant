/**
 * Manually update Shopify credentials
 */

require('dotenv').config();
const db = require('../config/database');

async function updateShopifyCredentials() {
  try {
    const customerId = '8557353828568';
    const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    
    console.log('Updating Shopify credentials for customer:', customerId);
    console.log('Domain:', shopifyDomain);
    console.log('Access Token:', shopifyAccessToken ? 'EXISTS' : 'MISSING');
    
    if (!shopifyDomain || !shopifyAccessToken) {
      console.error('❌ Missing environment variables!');
      process.exit(1);
    }
    
    const updated = await db('customer_configs')
      .where({ customer_id: customerId })
      .update({
        shopify_domain: shopifyDomain,
        shopify_access_token: shopifyAccessToken,
        updated_at: new Date()
      });
    
    console.log(`✅ Updated ${updated} customer config(s)`);
    
    // Verify
    const config = await db('customer_configs')
      .where({ customer_id: customerId })
      .first();
    
    console.log('\n📋 Verified config:');
    console.log('   Domain:', config.shopify_domain);
    console.log('   Has Token:', !!config.shopify_access_token);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

updateShopifyCredentials();
