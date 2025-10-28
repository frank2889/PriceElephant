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
    console.log('[Sitemap Import] Request received:', {
      customerId: req.body.customerId,
      sitemapUrl: req.body.sitemapUrl,
      maxProducts: req.body.maxProducts,
      productUrlPattern: req.body.productUrlPattern
    });
    
    const { 
      customerId, 
      sitemapUrl, 
      maxProducts = 500,
      productUrlPattern,
      selectors 
    } = req.body;

    if (!customerId) {
      console.error('[Sitemap Import] Error: customerId missing');
      return res.status(400).json({ error: 'customerId is required' });
    }

    if (!sitemapUrl) {
      console.error('[Sitemap Import] Error: sitemapUrl missing');
      return res.status(400).json({ error: 'sitemapUrl is required' });
    }

    // Validate URL
    try {
      new URL(sitemapUrl);
      console.log('[Sitemap Import] URL validation passed');
    } catch (e) {
      console.error('[Sitemap Import] Invalid URL:', e.message);
      return res.status(400).json({ error: 'Invalid sitemap URL' });
    }

    console.log('[Sitemap Import] Starting import service...');
    const service = new SitemapImportService(customerId);
    
    const results = await service.importFromSitemap(sitemapUrl, {
      maxProducts,
      productUrlPattern,
      selectors
    });

    console.log('[Sitemap Import] ✅ Import completed:', {
      scanned: results.scanned,
      created: results.created,
      updated: results.updated,
      errors: results.errors?.length || 0
    });

    res.json({
      success: true,
      customerId,
      sitemapUrl,
      results: {
        created: results.created,
        updated: results.updated,
        skipped: results.skipped,
        scanned: results.scanned,
        detectedProducts: results.detectedProducts,
        products: results.products,
        errors: results.errors.length,
        errorDetails: results.errors,
        total: results.created + results.updated + results.skipped
      }
    });

  } catch (error) {
    console.error('[Sitemap Import] ❌ Fatal error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ 
      error: 'Import failed', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/v1/sitemap/import-stream
 * Import products from sitemap with real-time progress via SSE
 */
router.get('/import-stream', async (req, res) => {
  try {
    console.log('[Sitemap SSE] Stream request received:', {
      customerId: req.query.customerId,
      sitemapUrl: req.query.sitemapUrl,
      maxProducts: req.query.maxProducts,
      productUrlPattern: req.query.productUrlPattern
    });
    
    const { 
      customerId, 
      sitemapUrl, 
      maxProducts,
      productUrlPattern
    } = req.query;

    if (!customerId) {
      console.error('[Sitemap SSE] Error: customerId missing');
      return res.status(400).json({ error: 'customerId is required' });
    }

    if (!sitemapUrl) {
      console.error('[Sitemap SSE] Error: sitemapUrl missing');
      return res.status(400).json({ error: 'sitemapUrl is required' });
    }

    // Validate URL
    try {
      new URL(sitemapUrl);
      console.log('[Sitemap SSE] URL validation passed');
    } catch (e) {
      console.error('[Sitemap SSE] Invalid URL:', e.message);
      return res.status(400).json({ error: 'Invalid sitemap URL' });
    }

    // Setup SSE
    console.log('[Sitemap SSE] Setting up SSE stream...');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event, data) => {
      console.log(`[Sitemap SSE] Event: ${event}`, data);
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    console.log('[Sitemap SSE] Starting import service...');
    const service = new SitemapImportService(customerId);
    
    // Progress callback
    const onProgress = (progressData) => {
      sendEvent('progress', progressData);
    };

    try {
      const results = await service.importFromSitemap(sitemapUrl, {
        maxProducts: parseInt(maxProducts) || 500,
        productUrlPattern: productUrlPattern || null,
        onProgress
      });

      console.log('[Sitemap SSE] ✅ Import completed:', {
        scanned: results.scanned,
        created: results.created,
        updated: results.updated,
        errors: results.errors?.length || 0
      });

      // Send final results
      sendEvent('complete', {
        success: true,
        results: {
          created: results.created,
          updated: results.updated,
          skipped: results.skipped,
          scanned: results.scanned,
          detectedProducts: results.detectedProducts,
          products: results.products,
          scrapingStats: results.scrapingStats,
          errors: results.errors
        }
      });

      res.end();
    } catch (error) {
      console.error('[Sitemap SSE] ❌ Fatal error:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      sendEvent('error', {
        error: 'Import failed',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
      res.end();
    }

  } catch (error) {
    console.error('[Sitemap SSE] ❌ Stream setup error:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Stream setup failed', 
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
    console.log('[Sitemap Config] Save request:', req.body);
    
    const { 
      customerId, 
      sitemapUrl,
      productUrlPattern,
      maxProducts,
      selectors
    } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    if (!sitemapUrl) {
      return res.status(400).json({ error: 'sitemapUrl is required' });
    }

    // Check customer tier to determine maxProducts limit
    let finalMaxProducts = maxProducts || 500;
    
    try {
      const tier = await db('customer_tiers')
        .where({ customer_id: customerId })
        .first();
      
      if (tier && tier.tier === 'enterprise' && tier.product_limit === 0) {
        // Enterprise unlimited - use provided maxProducts or default to 10000
        finalMaxProducts = maxProducts || 10000;
        console.log('[Sitemap Config] Enterprise customer detected - maxProducts:', finalMaxProducts);
      }
    } catch (tierError) {
      console.log('[Sitemap Config] Tier check skipped (table might not exist yet)');
    }

    // Save configuration to customer_configs table
    const existing = await db('customer_configs')
      .where({ customer_id: customerId })
      .first();

    const configData = {
      sitemap_url: sitemapUrl,
      sitemap_product_url_pattern: productUrlPattern,
      sitemap_max_products: finalMaxProducts,
      updated_at: new Date()
    };

    if (existing) {
      await db('customer_configs')
        .where({ customer_id: customerId })
        .update(configData);
      console.log('[Sitemap Config] ✅ Updated config for customer:', customerId, 'maxProducts:', finalMaxProducts);
    } else {
      await db('customer_configs')
        .insert({
          customer_id: customerId,
          ...configData,
          created_at: new Date()
        });
      console.log('[Sitemap Config] ✅ Created config for customer:', customerId, 'maxProducts:', finalMaxProducts);
    }

    res.json({
      success: true,
      message: 'Sitemap configuration saved',
      maxProducts: finalMaxProducts
    });

  } catch (error) {
    console.error('[Sitemap Config] ❌ Error:', error.message);
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
    console.log('[Sitemap Config] Load request for customer:', customerId);

    const config = await db('customer_configs')
      .where({ customer_id: customerId })
      .first();

    if (!config) {
      console.log('[Sitemap Config] No config found for customer:', customerId);
      return res.status(404).json({ 
        error: 'No sitemap configuration found' 
      });
    }

    console.log('[Sitemap Config] ✅ Loaded config:', {
      sitemapUrl: config.sitemap_url,
      maxProducts: config.sitemap_max_products
    });

    res.json({
      sitemapUrl: config.sitemap_url,
      productUrlPattern: config.sitemap_product_url_pattern,
      maxProducts: config.sitemap_max_products
    });

  } catch (error) {
    console.error('[Sitemap Config] ❌ Load error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch configuration', 
      message: error.message 
    });
  }
});

module.exports = router;
