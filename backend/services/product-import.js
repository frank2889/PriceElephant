/**
 * Product Import Service
 * Handles importing products from Channable into our database
 */

require('dotenv').config();
const db = require('../config/database');
const ChannableIntegration = require('../integrations/channable');
const ShopifyIntegration = require('../integrations/shopify');

class ProductImportService {
  constructor(customerId) {
    this.customerId = customerId;
    this.shopify = new ShopifyIntegration();
  }

  /**
   * Import products from Channable for a customer
   */
  async importFromChannable(channableConfig) {
    const channable = new ChannableIntegration(channableConfig);
    
    console.log(`\n🔄 Starting Channable import for customer ${this.customerId}...`);
    
    try {
      // Fetch products from Channable
      let products;
      if (channableConfig.feedUrl) {
        console.log('📥 Fetching from feed URL...');
        products = await channable.importFromFeed();
      } else {
        console.log('📥 Fetching from Channable API...');
        products = await channable.importFromAPI();
      }

      console.log(`✅ Found ${products.length} products in Channable`);

      // Import to database
      const results = await this.importProducts(products);

      console.log(`\n📊 IMPORT RESULTS:`);
      console.log(`   Created: ${results.created}`);
      console.log(`   Updated: ${results.updated}`);
      console.log(`   Skipped: ${results.skipped}`);
      console.log(`   Errors: ${results.errors}`);

      return results;

    } catch (error) {
      console.error('❌ Channable import failed:', error.message);
      throw error;
    }
  }

  /**
   * Import products into database
   */
  async importProducts(products) {
    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errorDetails: []
    };

    for (const product of products) {
      try {
        // Check if product already exists (by EAN or external ID)
        const existing = await this.findExistingProduct(product);

        if (existing) {
          // Update existing product
          await this.updateProduct(existing.id, product);
          results.updated++;
          console.log(`♻️  Updated: ${product.title}`);
        } else {
          // Create new product
          await this.createProduct(product);
          results.created++;
          console.log(`✨ Created: ${product.title}`);
        }

      } catch (error) {
        results.errors++;
        results.errorDetails.push({
          product: product.title,
          error: error.message
        });
        console.error(`❌ Error importing ${product.title}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Find existing product by EAN or external ID
   */
  async findExistingProduct(product) {
    // Try EAN first (most reliable)
    if (product.ean) {
      const byEan = await db('products')
        .where({
          shopify_customer_id: this.customerId,
          product_ean: product.ean
        })
        .first();
      
      if (byEan) return byEan;
    }

    // Fallback to external ID
    if (product.externalId) {
      const byExternalId = await db('products')
        .where({
          shopify_customer_id: this.customerId,
          channable_product_id: product.externalId
        })
        .first();
      
      if (byExternalId) return byExternalId;
    }

    return null;
  }

  /**
   * Create new product
   */
  async createProduct(product) {
    const [newProduct] = await db('products').insert({
      shopify_customer_id: this.customerId,
      shopify_product_id: null, // Will be set when synced to Shopify
      product_name: product.title,
      product_ean: product.ean,
      product_sku: product.sku,
      brand: product.brand,
      category: product.category,
      own_price: product.price,
      product_url: product.url,
      image_url: product.imageUrl,
      channable_product_id: product.externalId,
      active: true
    }).returning('*');

    console.log(`   → Database ID: ${newProduct.id}`);
    
    // Auto-sync to Shopify
    try {
      const shopifyProduct = await this.shopify.createProduct({
        title: product.title,
        description: `${product.brand || 'Product'} - ${product.category || ''}`,
        brand: product.brand,
        category: product.category,
        price: product.price,
        sku: product.sku,
        ean: product.ean,
        imageUrl: product.imageUrl,
        channableId: product.externalId,
        tags: ['PriceElephant', `customer-${this.customerId}`, product.brand, product.category].filter(Boolean)
      });
      
      // Update with Shopify product ID
      await db('products')
        .where({ id: newProduct.id })
        .update({ 
          shopify_product_id: shopifyProduct.id,
          updated_at: db.fn.now()
        });
      
      console.log(`   → Shopify ID: ${shopifyProduct.id}`);
    } catch (shopifyError) {
      console.error(`   ⚠️ Shopify sync failed: ${shopifyError.message}`);
      // Continue even if Shopify sync fails - product is still in DB
    }
    
    return newProduct.id;
  }

  /**
   * Update existing product
   */
  async updateProduct(productId, product) {
    await db('products')
      .where({ id: productId })
      .update({
        product_name: product.title,
        product_sku: product.sku,
        brand: product.brand,
        category: product.category,
        own_price: product.price,
        product_url: product.url,
        image_url: product.imageUrl,
        updated_at: db.fn.now()
      });

    return productId;
  }

  /**
   * Get customer's current product count
   */
  async getProductCount() {
    const result = await db('products')
      .where({ shopify_customer_id: this.customerId })
      .count('* as count')
      .first();

    return parseInt(result.count);
  }

  /**
   * Get customer's subscription limits
   */
  async checkSubscriptionLimits(newProductCount) {
    const subscription = await db('subscriptions')
      .join('subscription_plans', 'subscriptions.plan_id', 'subscription_plans.id')
      .where('subscriptions.shopify_customer_id', this.customerId)
      .select('subscription_plans.*')
      .first();

    if (!subscription) {
      throw new Error('Customer subscription not found');
    }

    const currentCount = await this.getProductCount();
    const totalCount = currentCount + newProductCount;

    // Check if plan has product limit (null = unlimited)
    if (subscription.max_products && totalCount > subscription.max_products) {
      throw new Error(
        `Product limit exceeded. Plan allows ${subscription.max_products} products, ` +
        `you currently have ${currentCount} and are trying to add ${newProductCount} more.`
      );
    }

    return {
      allowed: true,
      currentCount,
      maxProducts: subscription.max_products || 'unlimited',
      remainingSlots: subscription.max_products ? subscription.max_products - totalCount : 'unlimited'
    };
  }

  /**
   * Test import with sample data
   */
  static async test() {
    console.log('\n🧪 Testing Product Import Service\n');

    const service = new ProductImportService(1); // Customer ID 1

    // Mock Channable products
    const mockProducts = [
      {
        externalId: 'prod-001',
        ean: '197530828089',
        sku: '21HM002RMH',
        title: 'Lenovo ThinkPad X1 Carbon Gen 11',
        brand: 'Lenovo',
        price: 1899.00,
        url: 'https://example.com/lenovo-thinkpad-x1',
        imageUrl: 'https://example.com/image1.jpg',
        category: 'Laptops',
        description: 'Premium business laptop',
        inStock: true
      },
      {
        externalId: 'prod-002',
        ean: '8806092613577',
        sku: 'LC49G95TSSUXEN',
        title: 'Samsung Odyssey G9',
        brand: 'Samsung',
        price: 1399.00,
        url: 'https://example.com/samsung-odyssey-g9',
        imageUrl: 'https://example.com/image2.jpg',
        category: 'Monitors',
        description: '49" Curved Gaming Monitor',
        inStock: true
      },
      {
        externalId: 'prod-003',
        ean: '5099206098596',
        sku: '910-006559',
        title: 'Logitech MX Master 3S',
        brand: 'Logitech',
        price: 99.99,
        url: 'https://example.com/logitech-mx-master',
        imageUrl: 'https://example.com/image3.jpg',
        category: 'Accessories',
        description: 'Wireless ergonomic mouse',
        inStock: true
      }
    ];

    try {
      // Check subscription limits
      const limits = await service.checkSubscriptionLimits(mockProducts.length);
      console.log('📊 Subscription Check:');
      console.log(`   Current products: ${limits.currentCount}`);
      console.log(`   Max products: ${limits.maxProducts}`);
      console.log(`   Remaining slots: ${limits.remainingSlots}`);
      console.log(`   ✅ Import allowed\n`);

      // Import products
      const results = await service.importProducts(mockProducts);

      // Show final count
      const finalCount = await service.getProductCount();
      console.log(`\n📦 Total products in database: ${finalCount}`);

      return results;

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      throw error;
    }
  }
}

module.exports = ProductImportService;

// Run test if executed directly
if (require.main === module) {
  ProductImportService.test()
    .then(() => {
      console.log('\n✅ Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}
