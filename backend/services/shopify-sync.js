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
   * Now supports product variants
   */
  async syncProductsToShopify(customerId, limit = 10) {
    console.log(`\n🔄 Starting Shopify sync for customer ${customerId}...\n`);

    const startedAt = Date.now();
    try {
      // Get or create customer collection
      console.log('📁 Setting up customer collection...');
      const collectionId = await this.shopify.getOrCreateCustomerCollection(customerId);
      console.log(`✅ Collection ID: ${collectionId}\n`);

      // Get parent products (with variants) and standalone products that haven't been synced yet
      const products = await db('products')
        .where({
          shopify_customer_id: customerId,
          shopify_product_id: null,
          active: true
        })
        .whereNull('parent_product_id') // Only get parents or standalone products
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
          let shopifyProduct;

          // Check if this is a parent product with variants
          if (product.is_parent_product) {
            shopifyProduct = await this.syncProductWithVariants(product, customerId);
          } else {
            // Create regular single-variant product in Shopify
            shopifyProduct = await this.shopify.createProduct({
              title: product.product_name,
              description: `${product.brand} - ${product.category}`,
              brand: product.brand,
              category: product.category,
              price: product.own_price,
              sku: product.product_sku,
              ean: product.product_ean,
              imageUrl: product.image_url,
              channableId: product.channable_product_id,
              tags: ['PriceElephant', `customer-${customerId}`, product.brand, product.category].filter(Boolean)
            });
          }

          // Add product to customer collection
          await this.shopify.addProductToCollection(shopifyProduct.id, collectionId);

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

      await this.logSyncMetrics(customerId, results, Date.now() - startedAt);

      return results;

    } catch (error) {
      console.error('❌ Sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Sync a parent product with its variants to Shopify
   */
  async syncProductWithVariants(parentProduct, customerId) {
    console.log(`   🔀 Creating product with variants: ${parentProduct.product_name}`);

    // Get all variants for this parent
    const variants = await db('products')
      .where({
        parent_product_id: parentProduct.id,
        active: true
      })
      .orderBy('variant_position', 'asc');

    if (variants.length === 0) {
      console.log(`   ⚠️  No variants found for parent product ${parentProduct.id}, creating as single product`);
      
      return await this.shopify.createProduct({
        title: parentProduct.product_name,
        description: `${parentProduct.brand} - ${parentProduct.category}`,
        brand: parentProduct.brand,
        category: parentProduct.category,
        price: parentProduct.own_price,
        sku: parentProduct.product_sku,
        ean: parentProduct.product_ean,
        imageUrl: parentProduct.image_url,
        channableId: parentProduct.channable_product_id,
        tags: ['PriceElephant', `customer-${customerId}`, parentProduct.brand, parentProduct.category].filter(Boolean)
      });
    }

    console.log(`   📊 Found ${variants.length} variants`);

    // Build Shopify options array (max 3 options)
    const options = [];
    const optionValues = {
      option1: new Set(),
      option2: new Set(),
      option3: new Set()
    };

    // Collect all unique option values from variants
    variants.forEach(variant => {
      if (variant.option1_value) optionValues.option1.add(variant.option1_value);
      if (variant.option2_value) optionValues.option2.add(variant.option2_value);
      if (variant.option3_value) optionValues.option3.add(variant.option3_value);
    });

    // Create options array for Shopify
    if (optionValues.option1.size > 0 && variants[0].option1_name) {
      options.push({
        name: variants[0].option1_name,
        values: Array.from(optionValues.option1)
      });
    }
    if (optionValues.option2.size > 0 && variants[0].option2_name) {
      options.push({
        name: variants[0].option2_name,
        values: Array.from(optionValues.option2)
      });
    }
    if (optionValues.option3.size > 0 && variants[0].option3_name) {
      options.push({
        name: variants[0].option3_name,
        values: Array.from(optionValues.option3)
      });
    }

    // Build variants array for Shopify
    const shopifyVariants = variants.map(variant => ({
      option1: variant.option1_value || null,
      option2: variant.option2_value || null,
      option3: variant.option3_value || null,
      price: variant.own_price.toString(),
      sku: variant.product_sku || null,
      barcode: variant.product_ean || null,
      inventory_management: 'shopify',
      inventory_policy: 'deny',
      fulfillment_service: 'manual'
    }));

    // Create product with variants in Shopify
    const shopifyProduct = await this.shopify.createProductWithVariants({
      title: parentProduct.product_name,
      description: `${parentProduct.brand} - ${parentProduct.category}`,
      brand: parentProduct.brand,
      category: parentProduct.category,
      imageUrl: parentProduct.image_url,
      channableId: parentProduct.channable_product_id,
      tags: ['PriceElephant', `customer-${customerId}`, 'variants', parentProduct.brand, parentProduct.category].filter(Boolean),
      options: options,
      variants: shopifyVariants
    });

    console.log(`   ✅ Created Shopify product with ${shopifyVariants.length} variants`);

    // Update variant records with their corresponding Shopify variant IDs
    if (shopifyProduct.variants && shopifyProduct.variants.length === variants.length) {
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        const shopifyVariant = shopifyProduct.variants[i];
        
        await db('products')
          .where({ id: variant.id })
          .update({
            shopify_product_id: shopifyProduct.id,
            shopify_variant_id: shopifyVariant.id,
            updated_at: db.fn.now()
          });
      }
      console.log(`   ✅ Updated ${variants.length} variant records with Shopify IDs`);
    }

    return shopifyProduct;
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

  async logSyncMetrics(customerId, results, durationMs) {
    try {
      const entries = [
        {
          metric_name: 'shopify_sync_success',
          metric_value: results.synced,
          recorded_at: db.fn.now()
        },
        {
          metric_name: 'shopify_sync_failed',
          metric_value: results.failed,
          recorded_at: db.fn.now()
        },
        {
          metric_name: 'shopify_sync_duration_ms',
          metric_value: durationMs,
          recorded_at: db.fn.now()
        }
      ];

      await db('system_metrics').insert(entries.map((entry) => ({
        metric_name: entry.metric_name,
        metric_value: entry.metric_value,
        recorded_at: entry.recorded_at
      })));
    } catch (error) {
      console.warn('⚠️  Unable to persist Shopify sync metrics:', error.message);
    }
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
