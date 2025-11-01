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
const { extractDomain, normalizeRetailerName, extractCompanyName } = require('../utils/domain-extractor');
const { setupCompetitorInShopify } = require('../services/competitor-customer-service');

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

    // MULTI-TENANT: Register competitor domain (auto-create as prospect)
    const domain = extractDomain(url);
    let registry = null;
    
    if (domain) {
      console.log(`📝 Registering competitor domain: ${domain}`);
      
      // Check if already registered
      registry = await db('competitor_registry')
        .where({ domain })
        .first();
      
      if (registry) {
        // Already registered - increment counters
        console.log(`  ✅ Domain already registered (tracked by ${registry.tracked_by_customers} customers)`);
        await db('competitor_registry')
          .where({ id: registry.id })
          .increment('total_products_tracked', 1);
      } else {
        // New competitor - register as prospect
        console.log(`  🆕 New competitor domain - creating prospect customer`);
        
        [registry] = await db('competitor_registry').insert({
          domain,
          retailer_name: normalizeRetailerName(domain),
          is_paying_customer: false,
          shopify_customer_id: null,  // Will be set when they sign up
          total_products_tracked: 1,
          tracked_by_customers: 1,
          first_tracked_at: new Date()
        }).returning('*');
        
        console.log(`  ✅ Created competitor registry entry: ${registry.retailer_name}`);
        
        // Auto-create Shopify customer + collection for this competitor
        // This enables tracking their data and contacting them later
        try {
          const customerConfig = await db('customer_configs')
            .where({ customer_id: req.customer.id })
            .first();
          
          if (customerConfig?.shopify_domain && customerConfig?.shopify_access_token) {
            const { customerId, collectionId } = await setupCompetitorInShopify(
              registry.id,
              domain,
              normalizeRetailerName(domain),
              customerConfig.shopify_domain,
              customerConfig.shopify_access_token
            );
            
            console.log(`  🎯 Auto-created Shopify customer (${customerId}) and collection (${collectionId})`);
          }
        } catch (shopifyError) {
          console.error('  ⚠️ Failed to auto-create Shopify customer:', shopifyError.message);
          // Continue - registry is created, Shopify setup can be retried later
        }
      }
    }

    await db('competitor_prices').insert({
      product_id: productId,
      retailer,
      price: result.price,
      original_price: result.originalPrice || null,
      url,
      competitor_registry_id: registry?.id || null,  // Link to registry
      ean: product.product_ean || null,              // For multi-tenant deduplication
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

    // Get customer config for Shopify access
    const customerConfig = await db('customer_configs')
      .where({ customer_id: product.shopify_customer_id })
      .first();

    if (!customerConfig) {
      return res.status(400).json({ 
        error: 'Shopify credentials not configured'
      });
    }

    // Initialize Shopify integration
    const shopify = new ShopifyIntegration(
      customerConfig.shopify_domain,
      customerConfig.shopify_access_token
    );

    // BIDIRECTIONAL SYNC: Merge competitors from both Shopify metafield AND database
    let competitors = [];
    let metafieldCompetitors = [];
    
    try {
      const metafields = await shopify.getProductMetafields(product.shopify_product_id);
      const competitorDataMetafield = metafields.find(m => 
        m.namespace === 'priceelephant' && m.key === 'competitor_data'
      );

      if (competitorDataMetafield && competitorDataMetafield.value) {
        const competitorData = JSON.parse(competitorDataMetafield.value);
        metafieldCompetitors = competitorData.competitors || [];
        console.log(`📥 Found ${metafieldCompetitors.length} competitors in Shopify metafield`);
      }
    } catch (metafieldError) {
      console.log('⚠️  Could not read metafield:', metafieldError.message);
    }

    // Get existing competitors from database
    const dbCompetitors = await db('competitor_prices')
      .where({ product_id: productId })
      .select('id', 'retailer', 'url', 'price', 'in_stock', 'scraped_at');

    console.log(`💾 Found ${dbCompetitors.length} competitors in database`);

    // Create URL-based map for deduplication
    const competitorMap = new Map();

    // 1. Add database competitors to map
    dbCompetitors.forEach(comp => {
      competitorMap.set(comp.url, {
        id: comp.id,
        retailer: comp.retailer,
        url: comp.url,
        price: comp.price,
        in_stock: comp.in_stock,
        source: 'database'
      });
    });

    // 2. Merge metafield competitors (add missing ones to database)
    for (const comp of metafieldCompetitors) {
      if (!competitorMap.has(comp.url)) {
        // URL exists in metafield but not in database → Add to database
        console.log(`  ➕ Adding ${comp.retailer} from metafield to database`);
        const [insertedId] = await db('competitor_prices').insert({
          product_id: productId,
          retailer: comp.retailer,
          url: comp.url,
          price: comp.price || 0,
          original_price: comp.original_price || null,
          in_stock: comp.in_stock !== false,
          scraped_at: new Date(),
          created_at: new Date()
        }).returning('id');

        competitorMap.set(comp.url, {
          id: insertedId,
          retailer: comp.retailer,
          url: comp.url,
          price: comp.price || 0,
          in_stock: comp.in_stock !== false,
          source: 'metafield'
        });
      } else {
        // URL exists in both → Keep database version (will be updated by scrape)
        console.log(`  ✅ ${comp.retailer} already in database`);
      }
    }

    // 3. Convert map back to array
    competitors = Array.from(competitorMap.values());

    if (competitors.length === 0) {
      return res.status(400).json({ 
        error: 'No competitor URLs configured',
        hint: 'Add competitors first via Beheer button'
      });
    }

    console.log(`🔍 Re-scraping ${competitors.length} competitors for product ${product.product_name}...`);

    // Scrape each competitor
    const scraper = new HybridScraper();
    const results = [];
    const scrapedCompetitors = [];

    for (const comp of competitors) {
      try {
        console.log(`  Scraping ${comp.retailer} - ${comp.url}...`);
        const result = await scraper.scrapeProduct(comp.url, null, null, productId);

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
            url: comp.url,
            price: result.price,
            original_price: result.originalPrice || null,
            in_stock: result.inStock !== false
          });
        }
        
        results.push({
          retailer: comp.retailer,
          url: comp.url,
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
        console.error(`  ❌ Failed to scrape ${comp.url}:`, error.message);
        results.push({
          retailer: comp.retailer,
          url: comp.url,
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
