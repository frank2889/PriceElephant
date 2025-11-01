const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Clear orphaned Shopify product IDs for a customer
router.post('/clear-orphaned-shopify-ids/:customerId', async (req, res) => {
  const { customerId } = req.params;
  
  try {
    console.log(`🧹 Clearing orphaned Shopify IDs for customer ${customerId}...`);
    
    const result = await db('products')
      .where('client_id', customerId)
      .whereNotNull('shopify_product_id')
      .update({
        shopify_product_id: null,
        updated_at: new Date()
      });
    
    console.log(`✅ Cleared ${result} orphaned Shopify product IDs`);
    
    res.json({
      success: true,
      clearedCount: result,
      message: `Cleared ${result} orphaned Shopify product IDs for customer ${customerId}`
    });
  } catch (error) {
    console.error('❌ Error clearing orphaned IDs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Bulk sync all products from a Shopify collection
router.post('/sync-collection/:customerId', async (req, res) => {
  const { customerId } = req.params;
  
  try {
    console.log(`🔄 Syncing collection for customer ${customerId}...`);
    
    // Get customer config with Shopify credentials
    const config = await db('customer_configs')
      .where('customer_id', customerId)
      .first();

    if (!config || !config.shopify_domain || !config.shopify_access_token) {
      return res.status(400).json({
        success: false,
        error: 'Shopify credentials not configured for this customer'
      });
    }

    // Find the customer's collection
    const ShopifyIntegration = require('../integrations/shopify');
    const shopify = new ShopifyIntegration({
      shopDomain: config.shopify_domain,
      accessToken: config.shopify_access_token
    });

    // Get all collections and find the customer's collection
    const collections = await shopify.getCollections();
    const customerCollection = collections.find(c => 
      c.title.includes(`Customer ${customerId}`)
    );

    if (!customerCollection) {
      return res.status(404).json({
        success: false,
        error: `Collection not found for customer ${customerId}`
      });
    }

    // Get all products in the collection
    const products = await shopify.getCollectionProducts(customerId, customerCollection.id);

    console.log(`📦 Found ${products.length} products in collection`);

    let created = 0;
    let updated = 0;

    // Sync each product
    for (const product of products) {
      const existing = await db('products')
        .where({ shopify_product_id: String(product.id) })
        .first();

      if (existing) {
        // Update existing product
        await db('products')
          .where({ id: existing.id })
          .update({
            product_name: product.title,
            own_price: product.variants?.[0]?.price || null,
            image_url: product.image?.src || null,
            updated_at: new Date()
          });
        updated++;
      } else {
        // Create new product
        await db('products').insert({
          customer_id: customerId,
          product_name: product.title,
          product_url: `https://www.hobo.nl/products/${product.handle}`,
          own_price: product.variants?.[0]?.price || null,
          shopify_product_id: String(product.id),
          image_url: product.image?.src || null,
          sync_status: 'synced',
          created_at: new Date(),
          updated_at: new Date()
        });
        created++;
      }
    }

    console.log(`✅ Sync complete: ${created} created, ${updated} updated`);

    res.json({
      success: true,
      created,
      updated,
      total: products.length,
      message: `Synced ${products.length} products from Shopify collection`
    });
  } catch (error) {
    console.error('❌ Error syncing collection:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
