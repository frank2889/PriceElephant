/**
 * Scraper API Routes
 * POST /api/v1/scraper/run - Trigger scrape for products
 */

const express = require('express');
const router = express.Router();
const ProductionScraper = require('../crawlers/production-scraper');
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

    // Initialize scraper
    const scraper = new ProductionScraper();
    await scraper.initBrowser();

    const results = {
      total: products.length,
      scraped: 0,
      failed: 0,
      products: []
    };

    // Scrape each product
    for (const product of products) {
      try {
        console.log(`\n🔍 Scraping: ${product.product_name}`);
        
        const scrapeResult = await scraper.scrapeAllRetailers(
          product.id,
          product.product_ean
        );

        results.products.push({
          id: product.id,
          name: product.product_name,
          ean: product.product_ean,
          success_count: scrapeResult.success_count,
          failed_count: scrapeResult.failed_count,
          retailers: scrapeResult.retailers
        });

        if (scrapeResult.success_count > 0) {
          results.scraped++;
        } else {
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

    // Cleanup
    await scraper.close();

    res.json({
      success: true,
      results
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

    // Group by retailer
    const byRetailer = {};
    for (const snap of snapshots) {
      if (!byRetailer[snap.retailer]) {
        byRetailer[snap.retailer] = [];
      }
      byRetailer[snap.retailer].push({
        price: parseFloat(snap.price),
        in_stock: snap.in_stock,
        url: snap.competitor_url,
        scraped_at: snap.scraped_at
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
 * Test Bright Data connection
 */
router.post('/test', async (req, res) => {
  try {
    const ProductionScraper = require('../crawlers/production-scraper');
    const scraper = new ProductionScraper();
    
    // Test proxy connection
    const testResult = await scraper.proxy.testConnection();
    
    if (!testResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Bright Data connection failed',
        details: testResult.error
      });
    }

    res.json({
      success: true,
      message: 'Bright Data connected successfully',
      proxy: {
        ip: testResult.ip,
        country: testResult.country,
        isp: testResult.isp
      }
    });

  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Connection test failed',
      message: error.message
    });
  }
});

module.exports = router;
