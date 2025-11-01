/**
 * Sitemap Import Routes
 * API endpoints for importing products from sitemap.xml
 */

const express = require('express');
const router = express.Router();
const SitemapImportService = require('../services/sitemap-import');
const db = require('../config/database');

// Track active sitemap imports for cancellation support
const activeSitemapImports = new Map();

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
      productUrlPattern,
      resetProgress
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

    const cancelKey = String(customerId);
    if (activeSitemapImports.has(cancelKey)) {
      console.warn('[Sitemap SSE] Import already running for customer', cancelKey);
      sendEvent('error', {
        error: 'Import already running',
        message: 'Er draait al een sitemap import voor deze klant. Wacht tot deze is afgerond of stop de huidige import.'
      });
      res.end();
      return;
    }

    const cancelToken = { cancelled: false, startedAt: Date.now() };
    activeSitemapImports.set(cancelKey, cancelToken);

    const cleanup = () => {
      const current = activeSitemapImports.get(cancelKey);
      if (current === cancelToken) {
        activeSitemapImports.delete(cancelKey);
      }
    };

    req.on('close', () => {
      if (!cancelToken.cancelled) {
        console.log('[Sitemap SSE] Client disconnected, cancelling import for', cancelKey);
        cancelToken.cancelled = true;
      }
    });

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
        resetProgress: resetProgress === 'true',
        onProgress,
        isCancelled: () => cancelToken.cancelled
      });

      console.log('[Sitemap SSE] ✅ Import completed:', {
        scanned: results.scanned,
        created: results.created,
        updated: results.updated,
        errors: results.errors?.length || 0,
        cancelled: results.cancelled || false
      });

      if (results.cancelled) {
        sendEvent('cancelled', {
          success: false,
          cancelled: true,
          results: {
            scanned: results.scanned,
            detectedProducts: results.detectedProducts,
            created: results.created,
            updated: results.updated,
            skipped: results.skipped,
            errors: results.errors,
            scrapingStats: results.scrapingStats
          }
        });
      } else {
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
      }

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
    } finally {
      cleanup();
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
 * POST /api/v1/sitemap/import/cancel
 * Request cancellation for an active sitemap import
 */
router.post('/import/cancel', async (req, res) => {
  try {
    const { customerId } = req.body || {};
    const cancelKey = customerId ? String(customerId) : null;

    if (!cancelKey) {
      return res.status(400).json({ success: false, error: 'customerId is required' });
    }

    const token = activeSitemapImports.get(cancelKey);
    if (!token) {
      return res.status(404).json({ success: false, error: 'No active sitemap import for this customer' });
    }

    token.cancelled = true;
    token.cancelledAt = Date.now();

    console.log('[Sitemap SSE] Cancellation requested for', cancelKey);

    return res.json({ success: true, message: 'Sitemap import cancellation requested' });
  } catch (error) {
    console.error('[Sitemap SSE] Cancel request failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to cancel sitemap import', message: error.message });
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
      maxProducts
    } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    if (!sitemapUrl) {
      return res.status(400).json({ error: 'sitemapUrl is required' });
    }

    let parsedMaxProducts = parseInt(maxProducts, 10);
    if (!Number.isFinite(parsedMaxProducts) || parsedMaxProducts <= 0) {
      parsedMaxProducts = 500;
    }

    if (parsedMaxProducts >= 999999) {
      parsedMaxProducts = 10000;
    }

    let finalMaxProducts = parsedMaxProducts;
    let isEnterprise = false;

    try {
      const tier = await db('customer_tiers')
        .where({ customer_id: customerId })
        .first();

      if (tier) {
        const tierProductLimit = Number(tier.product_limit);

        if (tier.tier === 'enterprise' && tierProductLimit === 0) {
          isEnterprise = true;
          finalMaxProducts = 10000; // enterprise accounts should always import everything
          console.log('[Sitemap Config] Enterprise customer detected - forcing maxProducts to 10000');
        } else if (Number.isFinite(tierProductLimit) && tierProductLimit > 0) {
          finalMaxProducts = Math.min(parsedMaxProducts, tierProductLimit);
          console.log('[Sitemap Config] Applying tier product limit:', tierProductLimit);
        }
      }
    } catch (tierError) {
      console.log('[Sitemap Config] Tier lookup skipped:', tierError.message);
    }

    const timestamp = new Date();
    const configData = {
      sitemap_url: sitemapUrl,
      sitemap_product_url_pattern: productUrlPattern,
      sitemap_max_products: finalMaxProducts,
      updated_at: timestamp
    };

    const existing = await db('customer_configs')
      .where({ customer_id: customerId })
      .first();

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
          created_at: timestamp
        });
      console.log('[Sitemap Config] ✅ Created config for customer:', customerId, 'maxProducts:', finalMaxProducts);
    }

    res.json({
      success: true,
      message: 'Sitemap configuration saved',
      maxProducts: finalMaxProducts,
      enterprise: isEnterprise
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
 * Load sitemap configuration
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

    let maxProducts = Number(config.sitemap_max_products);
    if (!Number.isFinite(maxProducts) || maxProducts <= 0) {
      maxProducts = 500;
    }

    let isEnterprise = false;

    try {
      const tier = await db('customer_tiers')
        .where({ customer_id: customerId })
        .first();

      if (tier) {
        const tierProductLimit = Number(tier.product_limit);

        if (tier.tier === 'enterprise' && tierProductLimit === 0) {
          isEnterprise = true;
          maxProducts = 10000;
        } else if (Number.isFinite(tierProductLimit) && tierProductLimit > 0) {
          maxProducts = Math.min(maxProducts, tierProductLimit);
        }
      }
    } catch (tierError) {
      console.log('[Sitemap Config] Tier lookup skipped on load:', tierError.message);
    }

    console.log('[Sitemap Config] ✅ Loaded config:', {
      sitemapUrl: config.sitemap_url,
      maxProducts,
      enterprise: isEnterprise
    });

    // Get last scraped page from sitemap_configs if available
    let lastScrapedPage = 0;
    try {
      const sitemapConfig = await db('sitemap_configs')
        .where({ customer_id: customerId })
        .first();
      if (sitemapConfig && sitemapConfig.last_scraped_page) {
        lastScrapedPage = sitemapConfig.last_scraped_page;
      }
    } catch (err) {
      console.log('[Sitemap Config] No sitemap_configs entry found:', err.message);
    }

    res.json({
      sitemapUrl: config.sitemap_url,
      productUrlPattern: config.sitemap_product_url_pattern,
      maxProducts,
      enterprise: isEnterprise,
      lastScrapedPage
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
