/**
 * Product Competitor Routes
 * 
 * Allows customers to add their own competitor URLs per product
 * This is self-service - no manual work needed
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const IntelligentScraper = require('../crawlers/intelligent-scraper');

/**
 * GET /api/v1/products/:productId/competitors
 * Get all competitor URLs for a product
 */
router.get('/:productId/competitors', async (req, res) => {
  try {
    const { productId } = req.params;

    const competitors = await db('competitor_prices')
      .select('retailer', 'url', 'price', 'in_stock', 'scraped_at')
      .where({ product_id: productId })
      .orderBy('scraped_at', 'desc')
      .limit(100);

    // Group by retailer (latest price per retailer)
    const grouped = {};
    competitors.forEach(c => {
      if (!grouped[c.retailer]) {
        grouped[c.retailer] = c;
      }
    });

    res.json({
      success: true,
      product_id: productId,
      competitors: Object.values(grouped)
    });

  } catch (error) {
    console.error('Get competitors error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/products/:productId/competitors
 * Add a new competitor URL
 * 
 * Body: { url: "https://coolblue.nl/product/123" }
 */
router.post('/:productId/competitors', async (req, res) => {
  try {
    const { productId } = req.params;
    const { url } = req.body;

    if (!url || !url.startsWith('http')) {
      return res.status(400).json({ error: 'Valid URL required' });
    }

    // Check product exists and get client_id
    const product = await db('products')
      .where({ id: productId })
      .first();

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check subscription limits
    const plan = await db('clients')
      .join('subscription_plans', 'clients.subscription_plan_id', 'subscription_plans.id')
      .where({ 'clients.id': product.client_id })
      .select('subscription_plans.max_competitors')
      .first();

    const currentCompetitors = await db('competitor_prices')
      .where({ product_id: productId })
      .groupBy('retailer')
      .count('* as count');

    if (currentCompetitors.length >= (plan?.max_competitors || 3)) {
      return res.status(403).json({ 
        error: `Competitor limit reached (${plan?.max_competitors || 3} max). Upgrade plan for more.`,
        upgrade_url: '/pricing'
      });
    }

    // Scrape immediately with intelligent scraper
    console.log(`🔍 Scraping new competitor URL: ${url}`);
    const scraper = new IntelligentScraper();
    
    const result = await scraper.scrape(url, productId, product.client_id);

    res.json({
      success: true,
      message: 'Competitor added and scraped',
      data: {
        url,
        price: result.price,
        in_stock: result.inStock,
        method: result.method,
        cost: result.cost
      }
    });

  } catch (error) {
    console.error('Add competitor error:', error);
    res.status(500).json({ 
      error: 'Failed to add competitor',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/v1/products/:productId/competitors/:retailer
 * Remove a competitor
 */
router.delete('/:productId/competitors/:retailer', async (req, res) => {
  try {
    const { productId, retailer } = req.params;

    await db('competitor_prices')
      .where({ product_id: productId, retailer })
      .del();

    res.json({
      success: true,
      message: `Competitor ${retailer} removed`
    });

  } catch (error) {
    console.error('Delete competitor error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/products/:productId/competitors/scrape
 * Manually trigger scrape for all competitors
 */
router.post('/:productId/competitors/scrape', async (req, res) => {
  try {
    const { productId } = req.params;

    // Get product + all competitor URLs
    const product = await db('products')
      .where({ id: productId })
      .first();

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get unique competitor URLs
    const competitors = await db('competitor_prices')
      .select('url', 'retailer')
      .where({ product_id: productId })
      .whereNotNull('url')
      .groupBy('url', 'retailer');

    if (competitors.length === 0) {
      return res.status(400).json({ 
        error: 'No competitor URLs configured',
        hint: 'Add competitors first via POST /competitors'
      });
    }

    // Scrape each
    const scraper = new IntelligentScraper();
    const results = [];

    for (const comp of competitors) {
      try {
        console.log(`Scraping ${comp.retailer}...`);
        const result = await scraper.scrape(comp.url, productId, product.client_id);
        
        results.push({
          retailer: comp.retailer,
          success: true,
          price: result.price,
          method: result.method,
          cost: result.cost
        });

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        results.push({
          retailer: comp.retailer,
          success: false,
          error: error.message
        });
      }
    }

    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);

    res.json({
      success: true,
      scraped: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      total_cost: `€${totalCost.toFixed(4)}`,
      results
    });

  } catch (error) {
    console.error('Scrape competitors error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
