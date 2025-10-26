/**
 * Cleanup orphaned Shopify products
 * Removes products that are NOT in our database or not in collections
 */

require('dotenv').config();
const db = require('../config/database');
const ShopifyIntegration = require('../integrations/shopify');

async function cleanupOrphans(customerId) {
  console.log('\n🧹 Cleaning up orphaned Shopify products...\n');

  try {
    const shopify = new ShopifyIntegration();

    // Get all product IDs from our database
    const dbProducts = await db('products')
      .select('shopify_product_id')
      .where({ shopify_customer_id: customerId })
      .whereNotNull('shopify_product_id');

    const validProductIds = new Set(
      dbProducts.map(p => String(p.shopify_product_id))
    );

    console.log(`✅ Found ${validProductIds.size} valid products in database\n`);

    // Get all products from Shopify
    const client = new shopify.shopify.clients.Rest({ session: shopify.session });
    
    let allShopifyProducts = [];
    let hasNextPage = true;
    let pageInfo = null;

    while (hasNextPage) {
      const params = { limit: 250 };
      if (pageInfo) {
        params.page_info = pageInfo;
      }

      const response = await client.get({
        path: 'products',
        query: params
      });

      allShopifyProducts = allShopifyProducts.concat(response.body.products);
      
      // Check for next page
      const linkHeader = response.headers?.get?.('link') || response.headers?.link;
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/page_info=([^&>]+)/);
        pageInfo = match ? match[1] : null;
        hasNextPage = !!pageInfo;
      } else {
        hasNextPage = false;
      }

      await shopify.applyRateLimitDelay(response.headers);
    }

    console.log(`📦 Found ${allShopifyProducts.length} products in Shopify\n`);

    // Find orphans
    const orphans = allShopifyProducts.filter(product => 
      !validProductIds.has(String(product.id))
    );

    if (orphans.length === 0) {
      console.log('✅ No orphaned products found!');
      return { deleted: 0 };
    }

    console.log(`❌ Found ${orphans.length} orphaned products:\n`);
    orphans.forEach(p => {
      console.log(`   - ID ${p.id}: ${p.title}`);
    });

    console.log('\n⚠️  Deleting orphaned products...\n');

    let deleted = 0;
    for (const product of orphans) {
      try {
        await client.delete({
          path: `products/${product.id}`
        });
        
        deleted++;
        console.log(`✅ Deleted: ${product.title} (ID: ${product.id})`);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Failed to delete ${product.title}:`, error.message);
      }
    }

    console.log(`\n📊 CLEANUP RESULTS:`);
    console.log(`   Orphans found: ${orphans.length}`);
    console.log(`   Successfully deleted: ${deleted}`);
    console.log(`   Failed: ${orphans.length - deleted}`);

    return { deleted };

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    throw error;
  } finally {
    await db.destroy();
  }
}

// Run cleanup
const customerId = process.argv[2] || '8557353828568';
console.log(`🔍 Checking Shopify for orphaned products (customer ${customerId})...`);

cleanupOrphans(customerId)
  .then(result => {
    console.log('\n✅ Cleanup complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  });
