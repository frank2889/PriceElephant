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

    // Update main product in database
    const updated = await db('products')
      .where({ shopify_product_id: String(shopifyProductId) })
      .update({
        product_name: title,
        own_price: variants?.[0]?.price || null,
        updated_at: new Date()
      });

    if (updated > 0) {
      console.log(`[Webhook] ✅ Updated ${updated} product(s) in database`);
      
      // Update variants if multiple exist
      if (variants && variants.length > 1) {
        const mainProduct = await db('products')
          .where({ shopify_product_id: String(shopifyProductId) })
          .first();

        if (mainProduct) {
          // Mark as parent product
          await db('products')
            .where({ id: mainProduct.id })
            .update({ is_parent_product: true });

          // Update or create variants
          for (let i = 0; i < variants.length; i++) {
            const variant = variants[i];
            const shopifyVariantId = String(variant.id);

            const existingVariant = await db('products')
              .where({ shopify_variant_id: shopifyVariantId })
              .first();

            if (existingVariant) {
              // Update existing variant
              await db('products')
                .where({ id: existingVariant.id })
                .update({
                  product_name: `${title} - ${variant.title}`,
                  own_price: variant.price,
                  product_sku: variant.sku,
                  in_stock: variant.inventory_quantity > 0,
                  stock_quantity: variant.inventory_quantity,
                  updated_at: new Date()
                });
            } else {
              // Create new variant
              await db('products').insert({
                customer_id: mainProduct.customer_id,
                parent_product_id: mainProduct.id,
                product_name: `${title} - ${variant.title}`,
                product_sku: variant.sku,
                product_ean: variant.barcode,
                own_price: variant.price,
                shopify_product_id: String(shopifyProductId),
                shopify_variant_id: shopifyVariantId,
                variant_position: variant.position,
                option1_value: variant.option1,
                option2_value: variant.option2,
                option3_value: variant.option3,
                in_stock: variant.inventory_quantity > 0,
                stock_quantity: variant.inventory_quantity,
                sync_status: 'synced',
                created_at: new Date(),
                updated_at: new Date()
              });
            }
          }
          console.log(`[Webhook] ✅ Synced ${variants.length} variants`);
        }
      }
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

    // Create main product in database
    const [mainProduct] = await db('products').insert({
      customer_id: customerId,
      product_name: title,
      product_url: `https://www.hobo.nl/products/${handle}`,
      own_price: variants?.[0]?.price || null,
      product_sku: variants?.[0]?.sku,
      product_ean: variants?.[0]?.barcode,
      shopify_product_id: String(shopifyProductId),
      shopify_variant_id: variants?.[0] ? String(variants[0].id) : null,
      image_url: image?.src || null,
      in_stock: variants?.[0]?.inventory_quantity > 0,
      stock_quantity: variants?.[0]?.inventory_quantity || 0,
      is_parent_product: variants && variants.length > 1,
      sync_status: 'synced',
      created_at: new Date(),
      updated_at: new Date()
    }).returning('id');

    console.log(`[Webhook] ✅ Created product in database for customer ${customerId}`);

    // Create additional variants if they exist
    if (variants && variants.length > 1) {
      for (let i = 1; i < variants.length; i++) {
        const variant = variants[i];
        await db('products').insert({
          customer_id: customerId,
          parent_product_id: mainProduct.id,
          product_name: `${title} - ${variant.title}`,
          product_url: `https://www.hobo.nl/products/${handle}`,
          product_sku: variant.sku,
          product_ean: variant.barcode,
          own_price: variant.price,
          shopify_product_id: String(shopifyProductId),
          shopify_variant_id: String(variant.id),
          variant_position: variant.position,
          option1_value: variant.option1,
          option2_value: variant.option2,
          option3_value: variant.option3,
          in_stock: variant.inventory_quantity > 0,
          stock_quantity: variant.inventory_quantity,
          sync_status: 'synced',
          created_at: new Date(),
          updated_at: new Date()
        });
      }
      console.log(`[Webhook] ✅ Created ${variants.length - 1} additional variants`);
    }

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
    const ShopifyIntegration = require('../integrations/shopify');
    const config = await db('customer_configs').where('customer_id', customerId).first();
    
    if (!config) {
      console.log('[Webhook] ⚠️ Customer config not found');
      return res.status(200).send('OK');
    }

    const shopify = new ShopifyIntegration({
      shopDomain: config.shopify_domain,
      accessToken: config.shopify_access_token
    });

    const products = await shopify.getCollectionProducts(customerId, collectionId);
    const shopifyProductIds = products.map(p => String(p.id));

    console.log(`[Webhook] Found ${products.length} products in collection`);

    // Get all products in database for this customer
    const dbProducts = await db('products')
      .where('customer_id', customerId)
      .whereNotNull('shopify_product_id');

    // Find products to remove (in DB but not in Shopify collection)
    const productsToRemove = dbProducts.filter(p => 
      !shopifyProductIds.includes(p.shopify_product_id)
    );

    if (productsToRemove.length > 0) {
      await db('products')
        .whereIn('id', productsToRemove.map(p => p.id))
        .del();
      console.log(`[Webhook] 🗑️ Removed ${productsToRemove.length} products no longer in collection`);
    }

    // Sync each product in collection to database
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

/**
 * POST /api/v1/webhooks/shopify/inventory/update
 * Called when inventory levels change in Shopify
 */
router.post('/shopify/inventory/update', verifyShopifyWebhook, async (req, res) => {
  try {
    const { inventory_item_id, available } = req.body;
    
    console.log('[Webhook] Inventory updated:', inventory_item_id, 'Available:', available);

    // Find product by variant's inventory_item_id
    // We'll need to store inventory_item_id in products table or join through variants
    const updated = await db('products')
      .where({ inventory_item_id: String(inventory_item_id) })
      .update({
        in_stock: available > 0,
        stock_quantity: available,
        updated_at: new Date()
      });

    if (updated > 0) {
      console.log(`[Webhook] ✅ Updated inventory for ${updated} product(s)`);
    } else {
      console.log('[Webhook] ⚠️ Product not found for inventory item');
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook] Error handling inventory update:', error.message);
    res.status(500).send('Error');
  }
});

/**
 * POST /api/v1/webhooks/shopify/products/metafields/update
 * Called when product metafields are updated in Shopify
 */
router.post('/shopify/products/metafields/update', verifyShopifyWebhook, async (req, res) => {
  try {
    const { owner_id, namespace, key, value } = req.body;
    
    console.log('[Webhook] Metafield updated:', namespace, key, 'for product', owner_id);

    // Handle competitor URLs metafield
    if (namespace === 'priceelephant' && key === 'competitor_urls') {
      const product = await db('products')
        .where({ shopify_product_id: String(owner_id) })
        .first();

      if (product) {
        const competitorUrls = typeof value === 'string' ? JSON.parse(value) : value;
        
        // Delete existing competitor URLs
        await db('product_competitors')
          .where({ product_id: product.id })
          .del();

        // Insert new competitor URLs
        if (Array.isArray(competitorUrls) && competitorUrls.length > 0) {
          const competitors = competitorUrls.map(url => ({
            product_id: product.id,
            competitor_url: url,
            created_at: new Date()
          }));

          await db('product_competitors').insert(competitors);
          console.log(`[Webhook] ✅ Updated ${competitors.length} competitor URLs`);
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook] Error handling metafield update:', error.message);
    res.status(500).send('Error');
  }
});

module.exports = router;
