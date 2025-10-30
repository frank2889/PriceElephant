/**
 * Cleanup Orphaned Products
 * 
 * Removes products from our database that no longer exist in Shopify
 * Run this before sitemap imports to ensure clean data
 */

require('dotenv').config();
const db = require('../config/database');
const ShopifyIntegration = require('../integrations/shopify');

async function cleanupOrphanedProducts(customerId) {
  console.log(`\n🧹 Cleaning up orphaned products for customer ${customerId}...`);
  
  try {
    // Get customer config for Shopify credentials
    const customerConfig = await db('customer_configs')
      .where({ customer_id: customerId })
      .first();

    if (!customerConfig) {
      console.error(`❌ Customer ${customerId} not found in customer_configs`);
      return { deleted: 0, checked: 0 };
    }

    // Get all products for this customer from our database
    const ourProducts = await db('products')
      .where({ shopify_customer_id: customerId })
      .whereNotNull('shopify_product_id')
      .select('id', 'shopify_product_id', 'product_name');
    
    console.log(`📊 Found ${ourProducts.length} products in our database`);
    
    if (ourProducts.length === 0) {
      console.log('✅ No products to check');
      return { deleted: 0, checked: 0 };
    }
    
    // Initialize Shopify with customer-specific credentials
    const shopify = new ShopifyIntegration({
      shopDomain: customerConfig.shopify_domain,
      accessToken: customerConfig.shopify_access_token
    });
    
    console.log(`🏪 Checking Shopify: ${customerConfig.shopify_domain}`);
    
    const shopifyProducts = await shopify.getAllProducts(customerId);
    const shopifyProductIds = new Set(shopifyProducts.map(p => String(p.id)));
    
    console.log(`📊 Found ${shopifyProductIds.size} products in Shopify`);
    
    // Find orphaned products (in our DB but not in Shopify)
    const orphanedProducts = ourProducts.filter(p => 
      !shopifyProductIds.has(String(p.shopify_product_id))
    );
    
    console.log(`🗑️  Found ${orphanedProducts.length} orphaned products`);
    
    if (orphanedProducts.length === 0) {
      console.log('✅ No orphaned products to delete');
      return { deleted: 0, checked: ourProducts.length };
    }
    
    // Delete orphaned products
    for (const product of orphanedProducts) {
      console.log(`   Deleting: ${product.product_name} (Shopify ID: ${product.shopify_product_id})`);
      
      // Delete from products table (CASCADE will handle related records)
      await db('products')
        .where({ id: product.id })
        .delete();
    }
    
    console.log(`\n✅ Cleanup complete:`);
    console.log(`   Checked: ${ourProducts.length} products`);
    console.log(`   Deleted: ${orphanedProducts.length} orphaned products`);
    console.log(`   Remaining: ${ourProducts.length - orphanedProducts.length} products`);
    
    return {
      deleted: orphanedProducts.length,
      checked: ourProducts.length,
      remaining: ourProducts.length - orphanedProducts.length
    };
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const customerId = process.argv[2];
  
  if (!customerId) {
    console.error('❌ Usage: node cleanup-orphaned-products.js <customerId>');
    process.exit(1);
  }
  
  cleanupOrphanedProducts(customerId)
    .then(() => {
      console.log('\n✅ Done');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}

module.exports = cleanupOrphanedProducts;
