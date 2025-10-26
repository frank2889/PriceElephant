/**
 * Shopify Admin API Integration
 * Handles product creation, metafields, and customer management
 */

require('dotenv').config();
const crypto = require('crypto'); // Add crypto polyfill
const { shopifyApi } = require('@shopify/shopify-api');
const { restResources } = require('@shopify/shopify-api/rest/admin/2024-10');
require('@shopify/shopify-api/adapters/node');

// Make crypto globally available for Shopify API
if (typeof global.crypto === 'undefined') {
  global.crypto = crypto;
}

class ShopifyIntegration {
  constructor(config = {}) {
    this.shopDomain = config.shopDomain || process.env.SHOPIFY_SHOP_DOMAIN;
    this.accessToken = config.accessToken || process.env.SHOPIFY_ACCESS_TOKEN;
    
    // Initialize Shopify API client
    this.shopify = shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY,
      apiSecretKey: process.env.SHOPIFY_API_SECRET,
      scopes: ['read_products', 'write_products', 'read_customers', 'write_customers'],
      hostName: process.env.HOST || 'localhost',
      apiVersion: '2024-10',
      isEmbeddedApp: false,
      restResources,
    });

    this.session = {
      shop: this.shopDomain,
      accessToken: this.accessToken,
    };
  }

  getHeader(headers, key) {
    if (!headers) {
      return null;
    }

    if (typeof headers.get === 'function') {
      return headers.get(key);
    }

    return headers[key] || headers[key?.toLowerCase?.()] || headers[key?.toUpperCase?.()];
  }

  async applyRateLimitDelay(headers) {
    const limitHeader = this.getHeader(headers, 'x-shopify-shop-api-call-limit');
    if (!limitHeader) {
      return;
    }

    const [used, maximum] = limitHeader.split('/').map(Number);
    if (!Number.isFinite(used) || !Number.isFinite(maximum)) {
      return;
    }

    // When the call bucket is over 80% full, pause briefly to avoid 429 errors.
    if (used >= maximum * 0.8) {
      const delayMs = used >= maximum - 2 ? 2000 : 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  wrapShopifyError(context, error) {
    const status = error?.response?.status || error?.response?.code;
    if (status === 429) {
      const retryAfter = Number(this.getHeader(error.response?.headers, 'retry-after')) || 2;
      return new Error(
        `Shopify rate limit bereikt tijdens ${context}. Probeer het opnieuw over ${retryAfter} seconden.`
      );
    }

    if (error?.response?.errors) {
      const details = Array.isArray(error.response.errors)
        ? error.response.errors.join(', ')
        : JSON.stringify(error.response.errors);
      return new Error(`Shopify fout tijdens ${context}: ${details}`);
    }

    return new Error(`Shopify fout tijdens ${context}: ${error.message}`);
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
              },
              {
                namespace: 'priceelephant',
                key: 'competitor_prices',
                value: JSON.stringify(productData.competitorPrices || []),
                type: 'json'
              },
              {
                namespace: 'priceelephant',
                key: 'price_history',
                value: JSON.stringify(productData.priceHistory || []),
                type: 'json'
              },
              {
                namespace: 'priceelephant',
                key: 'last_scraped',
                value: productData.lastScraped || new Date().toISOString(),
                type: 'date_time'
              }
            ]
          }
        }
      });

      console.log(`✅ Created Shopify product: ${productData.title}`);
      await this.applyRateLimitDelay(response.headers);
      return response.body.product;

    } catch (error) {
      console.error('❌ Shopify product creation failed:', error.message);
      throw this.wrapShopifyError('product aanmaken', error);
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
      await this.applyRateLimitDelay(response.headers);
      return response.body.product;

    } catch (error) {
      console.error('❌ Shopify product update failed:', error.message);
      throw this.wrapShopifyError('product bijwerken', error);
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

      await this.applyRateLimitDelay(response.headers);
      return response.body.product;

    } catch (error) {
      console.error('❌ Failed to fetch product:', error.message);
      throw this.wrapShopifyError('product ophalen', error);
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

      await this.applyRateLimitDelay(response.headers);
      return response.body.metafield;

    } catch (error) {
      console.error('❌ Failed to add metafield:', error.message);
      throw this.wrapShopifyError('metafield toevoegen', error);
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
      await this.applyRateLimitDelay(existingMetafields.headers);

      const competitorMetafield = existingMetafields.body.metafields.find(
        m => m.key === 'competitor_prices'
      );

      const competitorPricesJson = JSON.stringify(competitorData);

      if (competitorMetafield) {
        // Update existing metafield
        const updateResponse = await client.put({
          path: `products/${shopifyProductId}/metafields/${competitorMetafield.id}`,
          data: {
            metafield: {
              id: competitorMetafield.id,
              value: competitorPricesJson,
              type: 'json'
            }
          }
        });
        await this.applyRateLimitDelay(updateResponse.headers);
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
      throw this.wrapShopifyError('competitorprijzen bijwerken', error);
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

      await this.applyRateLimitDelay(response.headers);
      return response.body.customers[0] || null;

    } catch (error) {
      console.error('❌ Failed to fetch customer:', error.message);
      throw this.wrapShopifyError('klant zoeken', error);
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

      await this.applyRateLimitDelay(response.headers);
      return response.body.metafield;

    } catch (error) {
      console.error('❌ Failed to add customer metafield:', error.message);
      throw this.wrapShopifyError('klant-metafield toevoegen', error);
    }
  }

  /**
   * Get or create customer collection
   * Returns collection ID for the customer
   */
  async getOrCreateCustomerCollection(customerId, customerName) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      const collectionTitle = `PriceElephant - Customer ${customerId}`;

      // Check if collection already exists
      const searchResponse = await client.get({
        path: 'custom_collections',
        query: { title: collectionTitle }
      });

      if (searchResponse.body.custom_collections && searchResponse.body.custom_collections.length > 0) {
        const collection = searchResponse.body.custom_collections[0];
        console.log(`✅ Found existing collection: ${collection.title} (ID: ${collection.id})`);
        await this.applyRateLimitDelay(searchResponse.headers);
        return collection.id;
      }

      // Create new collection
      const createResponse = await client.post({
        path: 'custom_collections',
        data: {
          custom_collection: {
            title: collectionTitle,
            body_html: `Price monitoring products for customer ${customerId}${customerName ? ` (${customerName})` : ''}`,
            published: false, // Keep private
            metafields: [
              {
                namespace: 'priceelephant',
                key: 'customer_id',
                value: String(customerId),
                type: 'single_line_text_field'
              }
            ]
          }
        }
      });

      const collection = createResponse.body.custom_collection;
      console.log(`✨ Created new collection: ${collection.title} (ID: ${collection.id})`);
      await this.applyRateLimitDelay(createResponse.headers);
      return collection.id;

    } catch (error) {
      console.error('❌ Collection creation/retrieval failed:', error.message);
      throw this.wrapShopifyError('collection aanmaken', error);
    }
  }

  /**
   * Add product to collection
   */
  async addProductToCollection(productId, collectionId) {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });

      const response = await client.post({
        path: 'collects',
        data: {
          collect: {
            product_id: productId,
            collection_id: collectionId
          }
        }
      });

      console.log(`✅ Added product ${productId} to collection ${collectionId}`);
      await this.applyRateLimitDelay(response.headers);
      return response.body.collect;

    } catch (error) {
      // Ignore duplicate errors (product already in collection)
      if (error.message && error.message.includes('already exists')) {
        console.log(`ℹ️  Product ${productId} already in collection ${collectionId}`);
        return null;
      }
      console.error('❌ Add to collection failed:', error.message);
      throw this.wrapShopifyError('product toevoegen aan collection', error);
    }
  }

  /**
   * Bulk create products with collection assignment
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

      await this.applyRateLimitDelay(response.headers);
      return {
        success: true,
        shop: response.body.shop.name,
        domain: response.body.shop.domain,
        email: response.body.shop.email
      };

    } catch (error) {
      return {
        success: false,
        error: this.wrapShopifyError('verbindingstest', error).message
      };
    }
  }
}

module.exports = ShopifyIntegration;
