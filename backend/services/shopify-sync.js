/**
 * Shopify Sync Service
 * Syncs products from our database to Shopify
 */

require('dotenv').config();
const db = require('../config/database');
const ShopifyIntegration = require('../integrations/shopify');

class ShopifySyncService {
  constructor() {
    this.shopify = new ShopifyIntegration();
  }

  /**
   * Sync products from database to Shopify
   */
  async syncProductsToShopify(customerId, limit = 10) {
    console.log(`\n🔄 Starting Shopify sync for customer ${customerId}...\n`);

    try {
      // Get products that haven't been synced yet
      const products = await db('products')
        .where({
          shopify_customer_id: customerId,
          shopify_product_id: null,
          active: true
        })
        .limit(limit);

      if (products.length === 0) {
        console.log('✅ No products to sync');
        return { synced: 0, failed: 0 };
      }

      console.log(`📦 Found ${products.length} products to sync\n`);

      const results = {
        synced: 0,
        failed: 0,
        errors: []
      };

      for (const product of products) {
        try {
          // Create product in Shopify
          const shopifyProduct = await this.shopify.createProduct({
            title: product.product_name,
            description: `${product.brand} - ${product.category}`,
            brand: product.brand,
            category: product.category,
            price: product.own_price,
            sku: product.product_sku,
            ean: product.product_ean,
            imageUrl: product.image_url,
            channableId: product.channable_product_id,
            tags: ['PriceElephant', product.brand, product.category].filter(Boolean)
          });

          // Update database with Shopify product ID
          await db('products')
            .where({ id: product.id })
            .update({
              shopify_product_id: shopifyProduct.id,
              updated_at: db.fn.now()
            });

          results.synced++;
          console.log(`✨ Synced: ${product.product_name} (Shopify ID: ${shopifyProduct.id})`);

          // Rate limiting: 2 requests per second
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
          results.failed++;
          results.errors.push({
            product: product.product_name,
            error: error.message
          });
          console.error(`❌ Failed: ${product.product_name} - ${error.message}`);
        }
      }

      console.log(`\n📊 SYNC RESULTS:`);
      console.log(`   Synced: ${results.synced}`);
      console.log(`   Failed: ${results.failed}`);

      return results;

    } catch (error) {
      console.error('❌ Sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Update competitor prices in Shopify metafields
   */
  async syncCompetitorPrices(productId) {
    try {
      // Get product from database
      const product = await db('products')
        .where({ id: productId })
        .first();

      if (!product || !product.shopify_product_id) {
        throw new Error('Product not found or not synced to Shopify');
      }

      // Get latest competitor prices
      const competitorPrices = await db('price_snapshots')
        .where({ shopify_product_id: product.shopify_product_id })
        .whereNotNull('retailer')
        .orderBy('scraped_at', 'desc')
        .limit(10);

      // Group by retailer (get latest price per retailer)
      const pricesByRetailer = {};
      competitorPrices.forEach(snap => {
        if (!pricesByRetailer[snap.retailer]) {
          pricesByRetailer[snap.retailer] = {
            price: snap.price,
            inStock: snap.in_stock,
            scrapedAt: snap.scraped_at
          };
        }
      });

      // Update Shopify metafield
      await this.shopify.updateCompetitorPrices(
        product.shopify_product_id,
        pricesByRetailer
      );

      console.log(`💰 Updated competitor prices for: ${product.product_name}`);

    } catch (error) {
      console.error('❌ Failed to sync competitor prices:', error.message);
      throw error;
    }
  }

  /**
   * Bulk sync all products for a customer
   */
  async syncAllProducts(customerId) {
    let offset = 0;
    const batchSize = 10;
    let totalSynced = 0;
    let totalFailed = 0;

    while (true) {
      const results = await this.syncProductsToShopify(customerId, batchSize);
      
      totalSynced += results.synced;
      totalFailed += results.failed;

      if (results.synced === 0) {
        break; // No more products to sync
      }

      offset += batchSize;
      
      // Delay between batches
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return {
      totalSynced,
      totalFailed
    };
  }

  /**
   * Test Shopify connection
   */
  static async testConnection() {
    console.log('\n🧪 Testing Shopify connection...\n');

    const shopify = new ShopifyIntegration();
    const result = await shopify.testConnection();

    if (result.success) {
      console.log('✅ Connected to Shopify!');
      console.log(`   Shop: ${result.shop}`);
      console.log(`   Domain: ${result.domain}`);
      console.log(`   Email: ${result.email}`);
    } else {
      console.log('❌ Connection failed:', result.error);
      console.log('\n💡 Make sure you have:');
      console.log('   1. Created a Custom App in Shopify Admin');
      console.log('   2. Added SHOPIFY_ACCESS_TOKEN to .env');
      console.log('   3. Granted correct API scopes');
    }

    return result;
  }
}

module.exports = ShopifySyncService;

// Run test if executed directly
if (require.main === module) {
  ShopifySyncService.testConnection()
    .then(() => {
      console.log('\n✅ Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}
