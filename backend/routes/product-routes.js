const express = require('express');
const ProductInsightsService = require('../services/product-insights');
const db = require('../config/database');

const router = express.Router();

// POST /api/v1/products/create - Create single product
router.post('/create', async (req, res) => {
  try {
    const {
      shopify_customer_id,
      product_name,
      product_ean,
      product_sku,
      brand,
      category,
      own_price,
      product_url,
      image_url,
      channable_product_id,
      active = true
    } = req.body;

    // Validate required fields
    if (!shopify_customer_id || !product_name) {
      return res.status(400).json({
        error: 'shopify_customer_id and product_name are required'
      });
    }

    // Check for duplicate by EAN
    if (product_ean) {
      const existing = await db('products')
        .where({ product_ean, shopify_customer_id })
        .first();

      if (existing) {
        return res.status(409).json({
          error: 'Product with this EAN already exists for this customer',
          product_id: existing.id
        });
      }
    }

    // Insert product
    const [product] = await db('products')
      .insert({
        shopify_customer_id,
        product_name,
        product_ean,
        product_sku,
        brand,
        category,
        own_price,
        product_url,
        image_url,
        channable_product_id,
        active
      })
      .returning('*');

    res.status(201).json({
      success: true,
      product
    });

  } catch (error) {
    console.error('Product creation error:', error);
    res.status(500).json({
      error: 'Failed to create product',
      message: error.message
    });
  }
});

// GET /api/v1/products/:customerId
router.get('/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const result = await ProductInsightsService.getProductOverview(customerId, {
      search: req.query.search,
      limit: req.query.limit,
      page: req.query.page,
      sort: req.query.sort,
      order: req.query.order
    });

    res.json(result);
  } catch (error) {
    console.error('❌ Product overview error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch product overview'
    });
  }
});

// GET /api/v1/products/:customerId/:productId/history
router.get('/:customerId/:productId/history', async (req, res) => {
  try {
    const { customerId, productId } = req.params;
    const { retailer, days } = req.query;

    const result = await ProductInsightsService.getPriceHistory(customerId, productId, {
      retailer,
      days
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Price history error:', error.message);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to fetch price history'
    });
  }
});

// GET /api/v1/products/:customerId/:productId/competitors
router.get('/:customerId/:productId/competitors', async (req, res) => {
  try {
    const { customerId, productId } = req.params;
    const result = await ProductInsightsService.getManualCompetitors(customerId, productId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Fetch manual competitors error:', error.message);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

// POST /api/v1/products/:customerId/:productId/competitors
router.post('/:customerId/:productId/competitors', async (req, res) => {
  try {
    const { customerId, productId } = req.params;
    const payload = {
      retailer: req.body.retailer,
      competitorUrl: req.body.competitorUrl
    };

    const result = await ProductInsightsService.addManualCompetitor(customerId, productId, payload);
    res.status(201).json({ success: true, competitor: result });
  } catch (error) {
    console.error('❌ Add manual competitor error:', error.message);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/products/:customerId/:productId/competitors/:competitorId
router.put('/:customerId/:productId/competitors/:competitorId', async (req, res) => {
  try {
    const { customerId, productId, competitorId } = req.params;
    const payload = {
      retailer: req.body.retailer,
      competitorUrl: req.body.competitorUrl,
      active: req.body.active
    };

    await ProductInsightsService.updateManualCompetitor(
      customerId,
      productId,
      competitorId,
      payload
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Update manual competitor error:', error.message);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/products/:customerId/:productId/competitors/:competitorId
router.delete('/:customerId/:productId/competitors/:competitorId', async (req, res) => {
  try {
    const { customerId, productId, competitorId } = req.params;
    await ProductInsightsService.deleteManualCompetitor(customerId, productId, competitorId);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Delete manual competitor error:', error.message);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

module.exports = router;
