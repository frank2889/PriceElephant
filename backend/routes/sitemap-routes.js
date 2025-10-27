/**
 * Sitemap Import Routes
 * API endpoints for importing products from sitemap.xml
 */

const express = require('express');
const router = express.Router();
const SitemapImportService = require('../services/sitemap-import');
const db = require('../config/database');

/**
 * POST /api/v1/sitemap/import
 * Import products from sitemap
 */
router.post('/import', async (req, res) => {
  try {
    const { 
      customerId, 
      sitemapUrl, 
      maxProducts = 50,
      productUrlPattern,
      selectors 
    } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    if (!sitemapUrl) {
      return res.status(400).json({ error: 'sitemapUrl is required' });
    }

    // Validate URL
    try {
      new URL(sitemapUrl);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid sitemap URL' });
    }

    const service = new SitemapImportService(customerId);
    
    const results = await service.importFromSitemap(sitemapUrl, {
      maxProducts,
      productUrlPattern,
      selectors
    });

    res.json({
      success: true,
      customerId,
      sitemapUrl,
      results: {
        created: results.created,
        updated: results.updated,
        skipped: results.skipped,
        errors: results.errors.length,
        errorDetails: results.errors,
        total: results.created + results.updated + results.skipped
      }
    });

  } catch (error) {
    console.error('Sitemap import error:', error);
    res.status(500).json({ 
      error: 'Import failed', 
      message: error.message 
    });
  }
});

/**
 * POST /api/v1/sitemap/configure
 * Save sitemap configuration
 */
router.post('/configure', async (req, res) => {
  try {
    const { 
      customerId, 
      sitemapUrl,
      productUrlPattern,
      selectors
    } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    if (!sitemapUrl) {
      return res.status(400).json({ error: 'sitemapUrl is required' });
    }

    // Save configuration
    const existing = await db('sitemap_configs')
      .where({ customer_id: customerId })
      .first();

    if (existing) {
      await db('sitemap_configs')
        .where({ customer_id: customerId })
        .update({
          sitemap_url: sitemapUrl,
          product_url_pattern: productUrlPattern,
          selectors: JSON.stringify(selectors || {}),
          updated_at: new Date()
        });
    } else {
      await db('sitemap_configs').insert({
        customer_id: customerId,
        sitemap_url: sitemapUrl,
        product_url_pattern: productUrlPattern,
        selectors: JSON.stringify(selectors || {}),
        created_at: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Sitemap configuration saved'
    });

  } catch (error) {
    console.error('Configuration error:', error);
    res.status(500).json({ 
      error: 'Failed to save configuration', 
      message: error.message 
    });
  }
});

/**
 * GET /api/v1/sitemap/config/:customerId
 * Get sitemap configuration
 */
router.get('/config/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const config = await db('sitemap_configs')
      .where({ customer_id: customerId })
      .first();

    if (!config) {
      return res.status(404).json({ 
        error: 'No sitemap configuration found' 
      });
    }

    res.json({
      sitemapUrl: config.sitemap_url,
      productUrlPattern: config.product_url_pattern,
      selectors: config.selectors ? JSON.parse(config.selectors) : {}
    });

  } catch (error) {
    console.error('Config fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch configuration', 
      message: error.message 
    });
  }
});

module.exports = router;
