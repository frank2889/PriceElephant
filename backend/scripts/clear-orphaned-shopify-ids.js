/**
 * Clear orphaned Shopify IDs from database
 * Sets shopify_product_id to NULL for products where Shopify product was deleted
 */

require('dotenv').config();
const db = require('../config/database');

async function clearOrphanedShopifyIds() {
  try {
    const customerId = '8557353828568';
    
    console.log('🧹 Clearing orphaned Shopify product IDs...');
    console.log(`   Customer: ${customerId}\n`);
    
    // Clear all shopify_product_id values for this customer
    // This will allow products to be re-synced to Shopify on next import
    const updated = await db('products')
      .where({ shopify_customer_id: customerId })
      .whereNotNull('shopify_product_id')
      .update({
        shopify_product_id: null,
        updated_at: new Date()
      });
    
    console.log(`✅ Cleared ${updated} orphaned Shopify product IDs`);
    console.log('\n💡 Next step: Run a sitemap import to re-sync products to Shopify');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

clearOrphanedShopifyIds();
