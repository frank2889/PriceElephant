/**
 * Check if products have Shopify IDs
 */

const db = require('../config/database');

async function checkShopifySync() {
  try {
    const customerId = '8557353828568';
    
    console.log('Checking Shopify sync status for customer:', customerId);
    
    const products = await db('products')
      .where({ shopify_customer_id: customerId })
      .select('id', 'product_name', 'shopify_product_id', 'own_price', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(20);
    
    console.log(`\nFound ${products.length} products:\n`);
    
    let synced = 0;
    let notSynced = 0;
    
    products.forEach(p => {
      const status = p.shopify_product_id ? '✅ SYNCED' : '❌ NOT SYNCED';
      console.log(`${status} | ${p.product_name.substring(0, 50)} | Shopify ID: ${p.shopify_product_id || 'NONE'}`);
      
      if (p.shopify_product_id) {
        synced++;
      } else {
        notSynced++;
      }
    });
    
    console.log(`\n📊 Summary:`);
    console.log(`   Synced to Shopify: ${synced}`);
    console.log(`   NOT synced: ${notSynced}`);
    
    // Check customer config
    const config = await db('customer_configs')
      .where({ customer_id: customerId })
      .first();
    
    console.log(`\n🔧 Customer Config:`);
    console.log(`   Shopify Domain: ${config?.shopify_domain || 'NOT SET'}`);
    console.log(`   Has Access Token: ${config?.shopify_access_token ? 'YES' : 'NO'}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkShopifySync();
