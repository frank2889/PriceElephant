/**
 * Channable Import Routes
 * API endpoints for importing products from Channable
 */

require('dotenv').config();
const express = require('express');
const router = express.Router();
const ProductImportService = require('../services/product-import');
const ChannableIntegration = require('../integrations/channable');
const db = require('../config/database');

/**
 * POST /api/v1/channable/import
 * Import products from Channable for a customer
 */
router.post('/import', async (req, res) => {
  try {
    const { customerId, feedUrl, companyId, projectId, apiToken } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    // Get customer's Channable config from database
    let config;
    if (feedUrl || (companyId && projectId)) {
      config = { feedUrl, companyId, projectId, apiToken };
    } else {
      const dbConfig = await db('channable_integrations')
        .where({ shopify_customer_id: customerId })
        .first();

      if (!dbConfig) {
        return res.status(404).json({ 
          error: 'No Channable integration found. Please configure Channable first.' 
        });
      }

      config = {
        feedUrl: dbConfig.feed_url,
        companyId: dbConfig.channable_company_id,
        projectId: dbConfig.channable_project_id,
        apiToken: dbConfig.api_token
      };
    }

    // Import products
    const service = new ProductImportService(customerId);
    const results = await service.importFromChannable(config);

    // Update last sync timestamp
    if (config.feedUrl || config.companyId) {
      await db('channable_integrations')
        .where({ shopify_customer_id: customerId })
        .update({
          last_sync_at: db.fn.now(),
          products_synced: results.created + results.updated
        });
    }

    res.json({
      success: true,
      customerId,
      results: {
        created: results.created,
        updated: results.updated,
        skipped: results.skipped,
        errors: results.errors,
        total: results.created + results.updated + results.skipped
      }
    });

  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ 
      error: 'Import failed', 
      message: error.message 
    });
  }
});

/**
 * POST /api/v1/channable/configure
 * Save Channable configuration for a customer
 */
router.post('/configure', async (req, res) => {
  try {
    const { customerId, feedUrl, companyId, projectId, apiToken, feedFormat } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    if (!feedUrl && (!companyId || !projectId || !apiToken)) {
      return res.status(400).json({ 
        error: 'Either feedUrl or (companyId + projectId + apiToken) is required' 
      });
    }

    // Test connection before saving
    const channable = new ChannableIntegration({
      feedUrl,
      companyId,
      projectId,
      apiToken
    });

    const testResult = await channable.testConnection();
    if (!testResult.success) {
      return res.status(400).json({ 
        error: 'Connection test failed', 
        message: testResult.error 
      });
    }

    // Save or update configuration
    const existing = await db('channable_integrations')
      .where({ shopify_customer_id: customerId })
      .first();

    if (existing) {
      await db('channable_integrations')
        .where({ shopify_customer_id: customerId })
        .update({
          channable_company_id: companyId,
          channable_project_id: projectId,
          feed_url: feedUrl,
          api_token: apiToken, // TODO: Encrypt this
          feed_format: feedFormat || 'xml'
        });
    } else {
      await db('channable_integrations').insert({
        shopify_customer_id: customerId,
        channable_company_id: companyId,
        channable_project_id: projectId,
        feed_url: feedUrl,
        api_token: apiToken, // TODO: Encrypt this
        feed_format: feedFormat || 'xml'
      });
    }

    res.json({
      success: true,
      message: 'Channable configuration saved',
      testResult
    });

  } catch (error) {
    console.error('Configuration error:', error);
    res.status(500).json({ 
      error: 'Configuration failed', 
      message: error.message 
    });
  }
});

/**
 * GET /api/v1/channable/config/:customerId
 * Get Channable configuration for a customer
 */
router.get('/config/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const config = await db('channable_integrations')
      .where({ shopify_customer_id: customerId })
      .first();

    if (!config) {
      return res.status(404).json({ 
        error: 'No Channable configuration found' 
      });
    }

    res.json({
      success: true,
      config: {
        feedUrl: config.feed_url,
        feedFormat: config.feed_format,
        lastSync: config.last_sync_at,
        productsSynced: config.products_synced,
        hasApiCredentials: !!config.api_token
      }
    });

  } catch (error) {
    console.error('Config fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch configuration', 
      message: error.message 
    });
  }
});

/**
 * GET /api/v1/channable/products/:customerId
 * Get all products for a customer
 */
router.get('/products/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { limit = 50, offset = 0, search } = req.query;

    let query = db('products')
      .where({ shopify_customer_id: customerId, active: true })
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    if (search) {
      query = query.where(function() {
        this.where('product_name', 'ilike', `%${search}%`)
          .orWhere('product_ean', 'ilike', `%${search}%`)
          .orWhere('brand', 'ilike', `%${search}%`);
      });
    }

    const products = await query;

    const totalCount = await db('products')
      .where({ shopify_customer_id: customerId, active: true })
      .count('* as count')
      .first();

    res.json({
      success: true,
      products,
      pagination: {
        total: parseInt(totalCount.count),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + products.length < parseInt(totalCount.count)
      }
    });

  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch products', 
      message: error.message 
    });
  }
});

module.exports = router;
