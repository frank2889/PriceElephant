/**
 * Scraper API Routes - Cost-Optimized Hybrid Scraping
 * POST /api/v1/scraper/run - Trigger scrape for products
 * Uses multi-tier fallback: Direct → Free Proxy → WebShare → AI Vision
 * Target cost: €30-50/maand instead of €800/maand
 */

const express = require('express');
const router = express.Router();
const HybridScraper = require('../crawlers/hybrid-scraper');
const db = require('../config/database');

/**
 * POST /api/v1/scraper/run
 * Run scraper for specific customer's products
 */
router.post('/run', async (req, res) => {
  try {
    const { customerId, productIds, limit = 10 } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    // Get products to scrape
    let query = db('products')
      .where({ shopify_customer_id: customerId, active: true })
      .whereNotNull('product_ean'); // Only scrape products with EAN

    if (productIds && productIds.length > 0) {
      query = query.whereIn('id', productIds);
    }

    const products = await query.limit(limit);

    if (products.length === 0) {
      return res.json({
        success: true,
        message: 'No products found to scrape',
        scraped: 0
      });
    }

    // Initialize hybrid scraper
    const scraper = new HybridScraper();

    const results = {
      total: products.length,
      scraped: 0,
      failed: 0,
      totalCost: 0,
      products: []
    };

    // Scrape each product
    for (const product of products) {
      try {
        console.log(`\n🔍 Scraping: ${product.product_name}`);
        
        // Build retailer URLs (you need to add these to products table)
        const urls = {
          coolblue: product.coolblue_url,
          bol: product.bol_url,
          amazon: product.amazon_url,
          mediamarkt: product.mediamarkt_url
        };

        const scrapeResults = await scraper.scrapeAllRetailers(
          product.id,
          product.product_ean,
          urls,
          customerId // Pass customerId for intelligent scheduling and alerts
        );

        const successCount = scrapeResults.filter(r => !r.error && !r.skipped).length;
        const skippedCount = scrapeResults.filter(r => r.skipped).length;
        const productCost = scrapeResults.reduce((sum, r) => sum + (r.cost || 0), 0);

        results.products.push({
          id: product.id,
          name: product.product_name,
          ean: product.product_ean,
          success_count: successCount,
          skipped_count: skippedCount,
          failed_count: scrapeResults.length - successCount - skippedCount,
          cost: productCost,
          retailers: scrapeResults
        });

        results.totalCost += productCost;

        if (successCount > 0) {
          results.scraped++;
        } else if (skippedCount === 0) {
          results.failed++;
        }

      } catch (error) {
        console.error(`❌ Scrape failed for ${product.product_name}:`, error.message);
        results.failed++;
        
        results.products.push({
          id: product.id,
          name: product.product_name,
          error: error.message
        });
      }
    }

    // Get scraper stats
    const stats = scraper.getStats();

    res.json({
      success: true,
      ...results,
      cost: `€${results.totalCost.toFixed(2)}`,
      avgCostPerProduct: `€${(results.totalCost / products.length).toFixed(4)}`,
      stats: stats
    });

  } catch (error) {
    console.error('Scraper endpoint error:', error);
    res.status(500).json({
      error: 'Scraper failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/scraper/status/:productId
 * Get latest scrape results for product
 */
router.get('/status/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    const snapshots = await db('price_snapshots')
      .where({ product_id: productId })
      .orderBy('scraped_at', 'desc')
      .limit(20);

    // Group by retailer with cost info
    const byRetailer = {};
    for (const snap of snapshots) {
      if (!byRetailer[snap.retailer]) {
        byRetailer[snap.retailer] = [];
      }
      byRetailer[snap.retailer].push({
        price: parseFloat(snap.price),
        in_stock: snap.in_stock,
        scraped_at: snap.scraped_at,
        method: snap.scraping_method,
        cost: snap.scraping_cost
      });
    }

    res.json({
      success: true,
      product_id: productId,
      retailers: byRetailer,
      last_scraped: snapshots[0]?.scraped_at || null
    });

  } catch (error) {
    console.error('Status endpoint error:', error);
    res.status(500).json({
      error: 'Failed to get scraper status',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/scraper/test
 * Test proxy pool and scraping
 */
router.post('/test', async (req, res) => {
  try {
    const scraper = new HybridScraper();
    
    // Test URL: Coolblue product
    const testUrl = 'https://www.coolblue.nl/product/942019/apple-airpods-pro-2e-generatie-usb-c.html';
    
    const testResult = await scraper.scrapeProduct(
      testUrl,
      null,
      'coolblue',
      null
    );
    
    const stats = scraper.getStats();

    res.json({
      success: true,
      message: 'Scraping test successful',
      test: {
        url: testUrl,
        price: testResult.price,
        tier: testResult.tier,
        cost: testResult.cost,
        inStock: testResult.inStock
      },
      stats: stats
    });

  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Test failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/scraper/throttling
 * Get adaptive throttling statistics
 */
router.get('/throttling', async (req, res) => {
  try {
    const { getThrottlingStats } = require('../jobs/scraper-queue');
    const stats = getThrottlingStats();
    
    res.json({
      success: true,
      throttling: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Throttling stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get throttling stats',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/scraper/throttling/reset
 * Reset adaptive throttling for a retailer
 */
router.post('/throttling/reset', async (req, res) => {
  try {
    const { retailer } = req.body;
    const { resetThrottling } = require('../jobs/scraper-queue');
    
    resetThrottling(retailer); // Pass null to reset all
    
    res.json({
      success: true,
      message: retailer 
        ? `Throttling reset for ${retailer}` 
        : 'All throttling reset',
      retailer: retailer || 'all'
    });
  } catch (error) {
    console.error('Throttling reset error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset throttling',
      message: error.message
    });
  }
});

module.exports = router;
