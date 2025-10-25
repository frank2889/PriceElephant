/**
 * Shopify Admin API Integration
 * Handles product creation, metafields, and customer management
 */

require('dotenv').config();
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

class ShopifyIntegration {
  constructor(config = {}) {
    this.shopDomain = config.shopDomain || process.env.SHOPIFY_SHOP_DOMAIN;
    this.accessToken = config.accessToken || process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = LATEST_API_VERSION;
    
    // Initialize Shopify API client
    this.shopify = shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY,
      apiSecretKey: process.env.SHOPIFY_API_SECRET,
      scopes: ['read_products', 'write_products', 'read_customers', 'write_customers'],
      hostName: process.env.HOST || 'localhost',
      apiVersion: this.apiVersion,
      isEmbeddedApp: false,
    });

    this.session = {
      shop: this.shopDomain,
      accessToken: this.accessToken,
    };
  }

  /**
   * Create a new product in Shopify
   */
  async createProduct(productData) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      const response = await client.post({
        path: 'products',
        data: {
          product: {
            title: productData.title,
            body_html: productData.description || '',
            vendor: productData.brand || '',
            product_type: productData.category || '',
            tags: productData.tags || [],
            status: 'active',
            variants: [
              {
                price: productData.price,
                sku: productData.sku,
                barcode: productData.ean,
                inventory_management: 'shopify',
                inventory_quantity: productData.inStock ? 100 : 0,
              }
            ],
            images: productData.imageUrl ? [{ src: productData.imageUrl }] : [],
            metafields: [
              {
                namespace: 'priceelephant',
                key: 'channable_id',
                value: productData.channableId || '',
                type: 'single_line_text_field'
              },
              {
                namespace: 'priceelephant',
                key: 'ean',
                value: productData.ean || '',
                type: 'single_line_text_field'
              }
            ]
          }
        }
      });

      console.log(`✅ Created Shopify product: ${productData.title}`);
      return response.body.product;

    } catch (error) {
      console.error('❌ Shopify product creation failed:', error.message);
      throw error;
    }
  }

  /**
   * Update existing product
   */
  async updateProduct(shopifyProductId, updateData) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      const response = await client.put({
        path: `products/${shopifyProductId}`,
        data: {
          product: {
            id: shopifyProductId,
            title: updateData.title,
            body_html: updateData.description,
            vendor: updateData.brand,
            variants: [
              {
                price: updateData.price,
                sku: updateData.sku,
              }
            ]
          }
        }
      });

      console.log(`♻️  Updated Shopify product: ${updateData.title}`);
      return response.body.product;

    } catch (error) {
      console.error('❌ Shopify product update failed:', error.message);
      throw error;
    }
  }

  /**
   * Get product by ID
   */
  async getProduct(shopifyProductId) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      const response = await client.get({
        path: `products/${shopifyProductId}`
      });

      return response.body.product;

    } catch (error) {
      console.error('❌ Failed to fetch product:', error.message);
      throw error;
    }
  }

  /**
   * Add metafield to product (for competitor prices)
   */
  async addProductMetafield(shopifyProductId, namespace, key, value, type = 'json') {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      const response = await client.post({
        path: `products/${shopifyProductId}/metafields`,
        data: {
          metafield: {
            namespace: namespace,
            key: key,
            value: value,
            type: type
          }
        }
      });

      return response.body.metafield;

    } catch (error) {
      console.error('❌ Failed to add metafield:', error.message);
      throw error;
    }
  }

  /**
   * Update competitor prices metafield
   */
  async updateCompetitorPrices(shopifyProductId, competitorData) {
    try {
      // Get existing metafields
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      const existingMetafields = await client.get({
        path: `products/${shopifyProductId}/metafields`,
        query: { namespace: 'priceelephant' }
      });

      const competitorMetafield = existingMetafields.body.metafields.find(
        m => m.key === 'competitor_prices'
      );

      const competitorPricesJson = JSON.stringify(competitorData);

      if (competitorMetafield) {
        // Update existing metafield
        await client.put({
          path: `products/${shopifyProductId}/metafields/${competitorMetafield.id}`,
          data: {
            metafield: {
              id: competitorMetafield.id,
              value: competitorPricesJson,
              type: 'json'
            }
          }
        });
      } else {
        // Create new metafield
        await this.addProductMetafield(
          shopifyProductId,
          'priceelephant',
          'competitor_prices',
          competitorPricesJson,
          'json'
        );
      }

      console.log(`💰 Updated competitor prices for product ${shopifyProductId}`);

    } catch (error) {
      console.error('❌ Failed to update competitor prices:', error.message);
      throw error;
    }
  }

  /**
   * Get customer by email
   */
  async getCustomerByEmail(email) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      const response = await client.get({
        path: 'customers/search',
        query: { query: `email:${email}` }
      });

      return response.body.customers[0] || null;

    } catch (error) {
      console.error('❌ Failed to fetch customer:', error.message);
      throw error;
    }
  }

  /**
   * Add customer metafield (for subscription settings)
   */
  async addCustomerMetafield(customerId, namespace, key, value, type = 'json') {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      const response = await client.post({
        path: `customers/${customerId}/metafields`,
        data: {
          metafield: {
            namespace: namespace,
            key: key,
            value: value,
            type: type
          }
        }
      });

      return response.body.metafield;

    } catch (error) {
      console.error('❌ Failed to add customer metafield:', error.message);
      throw error;
    }
  }

  /**
   * Bulk create products (for Channable import)
   */
  async bulkCreateProducts(productsArray) {
    const results = {
      created: 0,
      failed: 0,
      errors: []
    };

    for (const product of productsArray) {
      try {
        await this.createProduct(product);
        results.created++;
        
        // Rate limiting: max 2 requests per second
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        results.failed++;
        results.errors.push({
          product: product.title,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Test connection to Shopify
   */
  async testConnection() {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      const response = await client.get({
        path: 'shop'
      });

      return {
        success: true,
        shop: response.body.shop.name,
        domain: response.body.shop.domain,
        email: response.body.shop.email
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ShopifyIntegration;
