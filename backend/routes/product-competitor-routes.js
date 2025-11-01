/**
 * Product Competitor Routes
 * 
 * Allows customers to add their own competitor URLs per product
 * This is self-service - no manual work needed
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const HybridScraper = require('../crawlers/hybrid-scraper');
const ShopifyIntegration = require('../integrations/shopify');
const competitorPriceHistory = require('../services/competitor-price-history');

function normaliseRetailer(url) {
  try {
    const hostname = new URL(url).hostname || 'unknown';
    return hostname.replace(/^www\./, '');
  } catch (error) {
    return 'unknown';
  }
}

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

    // Check product exists
    const product = await db('products')
      .where({ id: productId })
      .first();

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check subscription limits via customer tier
    const tier = await db('customer_tiers')
      .where({ customer_id: product.shopify_customer_id })
      .first();

    const maxCompetitors = tier?.competitor_limit || 5; // Default to 5

    const currentCompetitors = await db('competitor_prices')
      .where({ product_id: productId })
      .groupBy('retailer')
      .count('* as count');

    if (maxCompetitors > 0 && currentCompetitors.length >= maxCompetitors) {
      return res.status(403).json({ 
        error: `Competitor limit reached (${maxCompetitors} max for ${tier?.tier || 'your'} tier). Upgrade for more.`,
        upgrade_url: '/pricing'
      });
    }

    console.log(`🔍 Scraping new competitor URL: ${url}`);
    const scraper = new HybridScraper();

    const result = await scraper.scrapeProduct(url, null, null, productId);

    if (!result || !result.price) {
      throw new Error('No price detected on competitor page');
    }

    const retailer = normaliseRetailer(url);

    await db('competitor_prices').insert({
      product_id: productId,
      retailer,
      price: result.price,
      original_price: result.originalPrice || null,
      url,
      in_stock: result.inStock !== false,
      scraped_at: new Date(),
      created_at: new Date()
    });

    // Record price history
    await competitorPriceHistory.recordPrice(
      productId,
      retailer,
      url,
      result.price,
      result.originalPrice,
      result.inStock !== false
    );

    // Sync competitor URLs and prices to Shopify metafield
    if (product.shopify_product_id) {
      try {
        // Get all competitors with prices for this product
        const allCompetitors = await db('competitor_prices')
          .where({ product_id: productId })
          .select('url', 'retailer', 'price', 'original_price', 'in_stock')
          .orderBy('retailer');

        const competitorData = allCompetitors.map(c => ({
          url: c.url,
          retailer: c.retailer,
          price: parseFloat(c.price),
          original_price: c.original_price ? parseFloat(c.original_price) : null,
          in_stock: c.in_stock
        }));

        // Get Shopify credentials for this customer
        const config = await db('customer_configs')
          .where('customer_id', product.shopify_customer_id)
          .first();

        if (config && config.shopify_domain && config.shopify_access_token) {
          const ShopifyIntegration = require('../integrations/shopify');
          const shopify = new ShopifyIntegration({
            shopDomain: config.shopify_domain,
            accessToken: config.shopify_access_token
          });

          await shopify.updateCompetitorData(
            product.shopify_product_id,
            product.product_url, // Own URL
            competitorData
          );

          console.log(`✅ Synced ${competitorData.length} competitors with prices to Shopify metafield`);
        }
      } catch (metafieldError) {
        console.error('⚠️  Failed to sync to Shopify metafield:', metafieldError.message);
        // Don't fail the request if metafield sync fails
      }
    }

    res.json({
      success: true,
      message: 'Competitor added and scraped',
      data: {
        url,
        price: result.price,
        retailer,
        in_stock: result.inStock !== false,
        method: result.tier,
        cost: result.cost || 0
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

    // Get product info before deleting
    const product = await db('products')
      .where({ id: productId })
      .first();

    await db('competitor_prices')
      .where({ product_id: productId, retailer })
      .del();

    // Sync updated competitor data to Shopify metafield
    if (product && product.shopify_product_id) {
      try {
        // Get remaining competitors with prices
        const remainingCompetitors = await db('competitor_prices')
          .where({ product_id: productId })
          .select('url', 'retailer', 'price', 'original_price', 'in_stock')
          .orderBy('retailer');

        const competitorData = remainingCompetitors.map(c => ({
          url: c.url,
          retailer: c.retailer,
          price: parseFloat(c.price),
          original_price: c.original_price ? parseFloat(c.original_price) : null,
          in_stock: c.in_stock
        }));

        // Get Shopify credentials for this customer
        const config = await db('customer_configs')
          .where('customer_id', product.shopify_customer_id)
          .first();

        if (config && config.shopify_domain && config.shopify_access_token) {
          const ShopifyIntegration = require('../integrations/shopify');
          const shopify = new ShopifyIntegration({
            shopDomain: config.shopify_domain,
            accessToken: config.shopify_access_token
          });

          await shopify.updateCompetitorData(
            product.shopify_product_id,
            product.product_url, // Own URL
            competitorData
          );

          console.log(`✅ Synced ${competitorData.length} competitors with prices to Shopify metafield after deletion`);
        }
      } catch (metafieldError) {
        console.error('⚠️  Failed to sync to Shopify metafield:', metafieldError.message);
        // Don't fail the request if metafield sync fails
      }
    }

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
 * Manually trigger scrape for all competitors and sync to Shopify metafield
 */
router.post('/:productId/competitors/scrape', async (req, res) => {
  try {
    const { productId } = req.params;

    // Get product
    const product = await db('products')
      .where({ id: productId })
      .first();

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (!product.shopify_product_id) {
      return res.status(400).json({ 
        error: 'Product not synced to Shopify',
        hint: 'Sync product to Shopify first'
      });
    }

    // Get customer config
    const customerConfig = await db('customer_configs')
      .where({ customer_id: product.shopify_customer_id })
      .first();

    if (!customerConfig) {
      return res.status(400).json({ 
        error: 'Shopify credentials not configured'
      });
    }

    // Get competitors from database (source of truth for URLs)
    const competitors = await db('competitor_prices')
      .where({ product_id: productId })
      .select('id', 'retailer', 'competitor_url', 'price', 'in_stock', 'scraped_at');

    if (competitors.length === 0) {
      return res.status(400).json({ 
        error: 'No competitor URLs configured',
        hint: 'Add competitors first via Beheer button'
      });
    }

    // Initialize Shopify integration for syncing results
    const shopify = new ShopifyIntegration(
      customerConfig.shopify_domain,
      customerConfig.shopify_access_token
    );

    console.log(`🔍 Re-scraping ${competitors.length} competitors for product ${product.product_name}...`);

    // Scrape each competitor
    const scraper = new HybridScraper();
    const results = [];
    const scrapedCompetitors = [];

    for (const comp of competitors) {
      try {
        console.log(`  Scraping ${comp.retailer} - ${comp.competitor_url}...`);
        const result = await scraper.scrapeProduct(comp.competitor_url, null, null, productId);

        if (result?.price) {
          // Update existing competitor_prices record
          await db('competitor_prices')
            .where({ id: comp.id })
            .update({
              price: result.price,
              original_price: result.originalPrice || null,
              in_stock: result.inStock !== false,
              scraped_at: new Date(),
              updated_at: new Date()
            });

          // Add to scraped competitors for metafield sync
          scrapedCompetitors.push({
            retailer: comp.retailer,
            url: comp.competitor_url,
            price: result.price,
            original_price: result.originalPrice || null,
            in_stock: result.inStock !== false
          });
        }
        
        results.push({
          retailer: comp.retailer,
          url: comp.competitor_url,
          success: true,
          price: result.price,
          original_price: result.originalPrice,
          in_stock: result.inStock,
          method: result.tier,
          cost: result.cost || 0
        });

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`  ❌ Failed to scrape ${comp.competitor_url}:`, error.message);
        results.push({
          retailer: comp.retailer,
          url: comp.competitor_url,
          success: false,
          error: error.message
        });
      }
    }

    // Update Shopify metafield with latest prices (bidirectional sync)
    try {
      await shopify.updateCompetitorData(
        product.shopify_product_id,
        product.product_url || '',
        scrapedCompetitors
      );
      console.log(`✅ Updated competitor_data metafield for product ${product.shopify_product_id}`);
    } catch (metafieldError) {
      console.error('Failed to sync metafield:', metafieldError.message);
    }

    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
    const scraped = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      scraped,
      failed,
      total_cost: `€${totalCost.toFixed(4)}`,
      metafield_synced: true,
      results
    });

  } catch (error) {
    console.error('Scrape competitors error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
