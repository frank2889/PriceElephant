/**
 * Simple Shopify Admin API Integration
 * Uses Basic Auth with API Key + Secret for Custom Apps
 */

require('dotenv').config();
const fetch = require('node-fetch');

class ShopifyIntegration {
  constructor(config = {}) {
    this.shopDomain = config.shopDomain || process.env.SHOPIFY_SHOP_DOMAIN;
    this.apiKey = config.apiKey || process.env.SHOPIFY_API_KEY;
    this.apiSecret = config.apiSecret || process.env.SHOPIFY_API_SECRET;
    this.apiVersion = '2024-10';
    
    // Basic Auth credentials
    this.authHeader = 'Basic ' + Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');
    this.baseUrl = `https://${this.shopDomain}/admin/api/${this.apiVersion}`;
  }

  /**
   * Make API request
   */
  async request(method, path, data = null) {
    const url = `${this.baseUrl}/${path}`;
    
    const options = {
      method,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API Error (${response.status}): ${error}`);
    }

    return await response.json();
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      const response = await this.request('GET', 'shop.json');
      return response.shop;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create product
   */
  async createProduct(productData) {
    const product = {
      title: productData.title,
      body_html: productData.description || '',
      vendor: productData.brand || '',
      product_type: productData.category || '',
      status: 'active',
      variants: [{
        price: productData.price,
        sku: productData.sku,
        barcode: productData.ean,
        inventory_management: 'shopify',
        inventory_quantity: productData.inStock ? 100 : 0,
      }],
      images: productData.imageUrl ? [{ src: productData.imageUrl }] : [],
    };

    const response = await this.request('POST', 'products.json', { product });
    
    // Add metafields after product creation
    if (response.product && response.product.id) {
      await this.addMetafields(response.product.id, productData);
    }
    
    return response.product;
  }

  /**
   * Add metafields to product
   */
  async addMetafields(productId, productData) {
    const metafields = [];
    
    if (productData.channableId) {
      metafields.push({
        namespace: 'priceelephant',
        key: 'channable_id',
        value: productData.channableId,
        type: 'single_line_text_field'
      });
    }
    
    if (productData.ean) {
      metafields.push({
        namespace: 'priceelephant',
        key: 'ean',
        value: productData.ean,
        type: 'single_line_text_field'
      });
    }

    for (const metafield of metafields) {
      await this.request('POST', `products/${productId}/metafields.json`, { metafield });
    }
  }

  /**
   * Update competitor prices metafield
   */
  async updateCompetitorPrices(productId, competitorData) {
    const metafield = {
      namespace: 'priceelephant',
      key: 'competitor_prices',
      value: JSON.stringify(competitorData),
      type: 'json'
    };

    return await this.request('POST', `products/${productId}/metafields.json`, { metafield });
  }
}

module.exports = ShopifyIntegration;

// Test if run directly
if (require.main === module) {
  (async () => {
    console.log('🧪 Testing Shopify connection...\n');
    
    try {
      const shopify = new ShopifyIntegration();
      const shop = await shopify.testConnection();
      
      console.log('✅ Connected to Shopify!');
      console.log(`   Shop: ${shop.name}`);
      console.log(`   Domain: ${shop.domain}`);
      console.log(`   Email: ${shop.email}`);
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
    }
  })();
}
