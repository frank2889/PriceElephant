/**
 * Hobo.nl Dedicated API Routes
 * 
 * Protected routes voor Hobo.nl admin dashboard
 * Vereist API key authenticatie
 */

const express = require('express');
const router = express.Router();
const ChannableIntegration = require('../integrations/channable');

// Middleware: API Key Authentication
const authenticateClient = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  // In productie: check database
  // Voor nu: hardcoded Hobo.nl key
  if (apiKey === 'hobo_demo_key' || apiKey?.startsWith('hobo_')) {
    req.client = {
      id: 1,
      name: 'Hobo.nl',
      shopifyDomain: 'hobo-nl.myshopify.com'
    };
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }
};

// GET /api/hobo/products - Alle producten van Hobo.nl
router.get('/products', authenticateClient, async (req, res) => {
  try {
    // TODO: Query database voor Hobo.nl producten
    // Voor nu: mock data
    
    const products = [
      {
        id: 1,
        name: 'Hobo Leren Tas - Cognac',
        sku: 'HOBO-LT-COG-001',
        ean: '8719327031001',
        price: 129.95,
        shopifyProductId: 123456789,
        image: 'https://cdn.shopify.com/...',
        active: true,
        competitors: [
          { retailer: 'Bol.com', price: 134.99, url: 'https://bol.com/...', lastChecked: new Date() },
          { retailer: 'Amazon.nl', price: 124.50, url: 'https://amazon.nl/...', lastChecked: new Date() }
        ],
        lastScraped: new Date()
      },
      {
        id: 2,
        name: 'Hobo Canvas Rugzak - Navy',
        sku: 'HOBO-RZ-NAV-002',
        ean: '8719327031002',
        price: 89.95,
        shopifyProductId: 123456790,
        image: 'https://cdn.shopify.com/...',
        active: true,
        competitors: [
          { retailer: 'Coolblue', price: 94.99, url: 'https://coolblue.nl/...', lastChecked: new Date() },
          { retailer: 'MediaMarkt', price: 87.50, url: 'https://mediamarkt.nl/...', lastChecked: new Date() }
        ],
        lastScraped: new Date()
      }
    ];

    const stats = {
      totalProducts: products.length,
      activeTracking: products.filter(p => p.active).length,
      competitorsTracked: 4,
      avgPriceDifference: -5.2
    };

    res.json({
      success: true,
      client: req.client,
      products,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/hobo/products/:id - Specifiek product details
router.get('/products/:id', authenticateClient, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    // TODO: Database query
    const product = {
      id: productId,
      name: 'Hobo Leren Tas - Cognac',
      sku: 'HOBO-LT-COG-001',
      ean: '8719327031001',
      currentPrice: 129.95,
      priceHistory: generatePriceHistory(30, 129.95),
      competitors: [
        {
          retailer: 'Bol.com',
          currentPrice: 134.99,
          priceHistory: generatePriceHistory(30, 134.99),
          url: 'https://www.bol.com/nl/...'
        },
        {
          retailer: 'Amazon.nl',
          currentPrice: 124.50,
          priceHistory: generatePriceHistory(30, 124.50),
          url: 'https://www.amazon.nl/...'
        }
      ]
    };

    res.json({
      success: true,
      product
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/hobo/products/:id/check-now - Trigger immediate price check
router.post('/products/:id/check-now', authenticateClient, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    // TODO: Trigger scraper job
    // const CompetitorScraper = require('../crawlers/competitor-scraper');
    // const scraper = new CompetitorScraper();
    // const results = await scraper.scrapeProduct(productName, ean);
    
    res.json({
      success: true,
      message: 'Prijscheck gestart',
      productId,
      status: 'queued',
      estimatedCompletion: new Date(Date.now() + 60000) // 1 min
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/hobo/sync-shopify - Sync producten van Shopify store
router.post('/sync-shopify', authenticateClient, async (req, res) => {
  try {
    // TODO: Shopify API integration
    // 1. Haal alle producten op van hobo-nl.myshopify.com
    // 2. Sla op in database
    // 3. Start price tracking jobs
    
    res.json({
      success: true,
      message: 'Shopify sync gestart',
      productsFound: 0,
      productsAdded: 0,
      productsUpdated: 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/hobo/alerts - Actieve prijsalerts
router.get('/alerts', authenticateClient, async (req, res) => {
  try {
    const alerts = [
      {
        id: 1,
        productName: 'Hobo Leren Tas - Cognac',
        type: 'competitor_lower',
        message: 'Amazon.nl is €5,45 goedkoper',
        createdAt: new Date()
      },
      {
        id: 2,
        productName: 'Hobo Canvas Rugzak - Navy',
        type: 'price_drop',
        message: 'MediaMarkt heeft prijs verlaagd naar €87,50',
        createdAt: new Date()
      }
    ];

    res.json({
      success: true,
      alerts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/hobo/channable/sync - Import products from Channable
router.post('/channable/sync', authenticateClient, async (req, res) => {
  try {
    const { companyId, apiToken, projectId, feedUrl } = req.body;

    // Validate required fields
    if (!feedUrl && (!companyId || !apiToken || !projectId)) {
      return res.status(400).json({
        error: 'Either feedUrl or (companyId, apiToken, projectId) is required'
      });
    }

    const channable = new ChannableIntegration({
      companyId,
      apiToken,
      projectId,
      feedUrl
    });

    // Import products
    let products;
    if (feedUrl) {
      products = await channable.importFromFeed();
    } else {
      products = await channable.importFromAPI();
    }

    // TODO: Save products to database with client_id
    // For now: return imported data

    res.json({
      success: true,
      imported: products.length,
      products: products.slice(0, 10), // Preview first 10
      message: `Successfully imported ${products.length} products from Channable`
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// GET /api/hobo/channable/test - Test Channable connection
router.post('/channable/test', authenticateClient, async (req, res) => {
  try {
    const { companyId, apiToken, projectId, feedUrl } = req.body;

    const channable = new ChannableIntegration({
      companyId,
      apiToken,
      projectId,
      feedUrl
    });

    const result = await channable.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Helper: Generate realistic price history
function generatePriceHistory(days, basePrice) {
  const history = [];
  let currentPrice = basePrice;
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    // Small fluctuations
    const change = (Math.random() - 0.5) * 0.03;
    currentPrice = currentPrice * (1 + change);
    
    history.push({
      date: date.toISOString().split('T')[0],
      price: Math.round(currentPrice * 100) / 100
    });
  }
  
  return history;
}

module.exports = router;
