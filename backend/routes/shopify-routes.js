/**
 * Shopify Sync Routes
 * API endpoints for syncing products to Shopify
 */

require('dotenv').config();
const express = require('express');
const router = express.Router();
const ShopifySyncService = require('../services/shopify-sync');
const db = require('../config/database');

/**
 * POST /api/v1/shopify/sync
 * Sync products from database to Shopify
 */
router.post('/sync', async (req, res) => {
  try {
    const { customerId, limit } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    const service = new ShopifySyncService();
    const results = await service.syncProductsToShopify(customerId, limit || 10);

    res.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/shopify/sync-all
 * Sync ALL products for a customer
 */
router.post('/sync-all', async (req, res) => {
  try {
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    const service = new ShopifySyncService();
    
    // Start sync in background
    service.syncAllProducts(customerId)
      .then(results => {
        console.log(`✅ Bulk sync completed for customer ${customerId}:`, results);
      })
      .catch(error => {
        console.error(`❌ Bulk sync failed for customer ${customerId}:`, error);
      });

    res.json({
      success: true,
      message: 'Bulk sync started in background'
    });

  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/shopify/sync-prices/:productId
 * Update competitor prices for a specific product
 */
router.post('/sync-prices/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    const service = new ShopifySyncService();
    await service.syncCompetitorPrices(parseInt(productId));

    res.json({
      success: true,
      message: 'Competitor prices updated'
    });

  } catch (error) {
    console.error('Price sync error:', error);
    res.status(500).json({
      error: 'Price sync failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/shopify/status/:customerId
 * Get sync status for a customer
 */
router.get('/status/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const totalProducts = await db('products')
      .where({ shopify_customer_id: customerId, active: true })
      .count('* as count')
      .first();

    const syncedProducts = await db('products')
      .where({ shopify_customer_id: customerId, active: true })
      .whereNotNull('shopify_product_id')
      .count('* as count')
      .first();

    const pendingProducts = await db('products')
      .where({ shopify_customer_id: customerId, active: true })
      .whereNull('shopify_product_id')
      .count('* as count')
      .first();

    res.json({
      success: true,
      status: {
        total: parseInt(totalProducts.count),
        synced: parseInt(syncedProducts.count),
        pending: parseInt(pendingProducts.count),
        syncPercentage: totalProducts.count > 0 
          ? ((syncedProducts.count / totalProducts.count) * 100).toFixed(1)
          : 0
      }
    });

  } catch (error) {
    console.error('Status fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch status',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/shopify/test
 * Test Shopify API connection
 */
router.get('/test', async (req, res) => {
  try {
    const result = await ShopifySyncService.testConnection();

    if (result.success) {
      res.json({
        success: true,
        shop: result.shop,
        domain: result.domain,
        message: 'Shopify connection successful'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: 'Shopify connection failed'
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
