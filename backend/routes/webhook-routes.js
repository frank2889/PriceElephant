/**
 * Shopify Webhook Routes
 * Handle Shopify events to keep database in sync
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const crypto = require('crypto');

/**
 * Verify Shopify webhook authenticity
 */
function verifyShopifyWebhook(req, res, next) {
  const hmac = req.get('X-Shopify-Hmac-SHA256');
  const body = req.rawBody || JSON.stringify(req.body);
  
  if (!hmac) {
    console.error('[Webhook] Missing HMAC header');
    return res.status(401).send('Unauthorized');
  }

  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(body, 'utf8')
    .digest('base64');

  if (hash !== hmac) {
    console.error('[Webhook] HMAC verification failed');
    return res.status(401).send('Unauthorized');
  }

  next();
}

/**
 * POST /api/v1/webhooks/shopify/products/delete
 * Called when a product is deleted in Shopify
 */
router.post('/shopify/products/delete', verifyShopifyWebhook, async (req, res) => {
  try {
    const { id: shopifyProductId } = req.body;
    
    console.log('[Webhook] Product deleted in Shopify:', shopifyProductId);

    // Find and delete the product from database
    const deleted = await db('products')
      .where({ shopify_product_id: String(shopifyProductId) })
      .del();

    if (deleted > 0) {
      console.log(`[Webhook] ✅ Deleted ${deleted} product(s) from database`);
    } else {
      console.log('[Webhook] ⚠️ Product not found in database');
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook] Error handling product deletion:', error.message);
    res.status(500).send('Error');
  }
});

/**
 * POST /api/v1/webhooks/shopify/products/update
 * Called when a product is updated in Shopify
 */
router.post('/shopify/products/update', verifyShopifyWebhook, async (req, res) => {
  try {
    const { id: shopifyProductId, title, variants } = req.body;
    
    console.log('[Webhook] Product updated in Shopify:', shopifyProductId);

    // Update product in database
    const updated = await db('products')
      .where({ shopify_product_id: String(shopifyProductId) })
      .update({
        product_name: title,
        own_price: variants?.[0]?.price || null,
        updated_at: new Date()
      });

    if (updated > 0) {
      console.log(`[Webhook] ✅ Updated ${updated} product(s) in database`);
    } else {
      console.log('[Webhook] ⚠️ Product not found in database');
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook] Error handling product update:', error.message);
    res.status(500).send('Error');
  }
});

/**
 * POST /api/v1/webhooks/shopify/products/create
 * Called when a product is created or added to a collection in Shopify
 */
router.post('/shopify/products/create', verifyShopifyWebhook, async (req, res) => {
  try {
    const { id: shopifyProductId, title, handle, variants, tags, image } = req.body;
    
    console.log('[Webhook] Product created in Shopify:', shopifyProductId, title);

    // Extract customer ID from tags (format: customer-8557353828568)
    const customerTag = tags?.split(',').find(t => t.trim().startsWith('customer-'));
    const customerId = customerTag ? customerTag.trim().replace('customer-', '') : null;

    if (!customerId) {
      console.log('[Webhook] ⚠️ No customer tag found, skipping');
      return res.status(200).send('OK');
    }

    // Check if product already exists
    const existing = await db('products')
      .where({ shopify_product_id: String(shopifyProductId) })
      .first();

    if (existing) {
      console.log('[Webhook] Product already exists in database');
      return res.status(200).send('OK');
    }

    // Create product in database
    await db('products').insert({
      customer_id: customerId,
      product_name: title,
      product_url: `https://www.hobo.nl/products/${handle}`,
      own_price: variants?.[0]?.price || null,
      shopify_product_id: String(shopifyProductId),
      image_url: image?.src || null,
      sync_status: 'synced',
      created_at: new Date(),
      updated_at: new Date()
    });

    console.log(`[Webhook] ✅ Created product in database for customer ${customerId}`);

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook] Error handling product creation:', error.message);
    res.status(500).send('Error');
  }
});

/**
 * POST /api/v1/webhooks/shopify/collections/update
 * Called when products are added/removed from a collection
 */
router.post('/shopify/collections/update', verifyShopifyWebhook, async (req, res) => {
  try {
    const { title, id: collectionId } = req.body;
    
    console.log('[Webhook] Collection updated:', title);

    // Extract customer ID from collection title (format: PriceElephant - Customer 8557353828568)
    const match = title?.match(/Customer\s+(\d+)/i);
    const customerId = match ? match[1] : null;

    if (!customerId) {
      console.log('[Webhook] ⚠️ Not a customer collection, skipping');
      return res.status(200).send('OK');
    }

    // Fetch products in this collection from Shopify
    const shopify = require('../integrations/shopify');
    const products = await shopify.getCollectionProducts(customerId, collectionId);

    console.log(`[Webhook] Found ${products.length} products in collection`);

    // Sync each product to database
    for (const product of products) {
      const existing = await db('products')
        .where({ shopify_product_id: String(product.id) })
        .first();

      if (!existing) {
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
        console.log(`[Webhook] ✅ Created product: ${product.title}`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook] Error handling collection update:', error.message);
    res.status(500).send('Error');
  }
});

module.exports = router;
