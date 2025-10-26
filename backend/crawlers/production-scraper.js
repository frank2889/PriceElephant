/**
 * Production Price Scraper met Bright Data
 * 
 * Scraped retailers:
 * - Coolblue.nl
 * - Bol.com
 * - Amazon.nl
 * - MediaMarkt.nl
 * 
 * Features:
 * - Bright Data residential proxies
 * - Anti-detection browser fingerprinting
 * - Rate limiting (2 req/sec per retailer)
 * - Error handling & retry logic
 * - Price snapshot storage in database
 */

require('dotenv').config();
const { chromium } = require('playwright');
const BrightDataProxy = require('../utils/brightdata-proxy');
const db = require('../config/database');

class ProductionScraper {
  constructor() {
    this.proxy = new BrightDataProxy();
    this.browser = null;
    this.context = null;
    
    // Retailer configs
    this.retailers = {
      coolblue: {
        name: 'Coolblue',
        searchUrl: 'https://www.coolblue.nl/zoeken?query=',
        selectors: {
          price: '.sales-price__current',
          availability: '.product-availability',
          title: 'h1.product-title'
        },
        rateLimit: 2000 // ms between requests
      },
      bol: {
        name: 'Bol.com',
        searchUrl: 'https://www.bol.com/nl/nl/s/?searchtext=',
        selectors: {
          price: '.promo-price',
          availability: '.buy-block__availability',
          title: 'h1[data-test="title"]'
        },
        rateLimit: 2000
      },
      amazon: {
        name: 'Amazon.nl',
        searchUrl: 'https://www.amazon.nl/s?k=',
        selectors: {
          price: '.a-price-whole',
          availability: '#availability span',
          title: '#productTitle'
        },
        rateLimit: 3000 // Amazon is stricter
      },
      mediamarkt: {
        name: 'MediaMarkt',
        searchUrl: 'https://www.mediamarkt.nl/nl/search.html?query=',
        selectors: {
          price: '.price',
          availability: '.availability',
          title: 'h1.product-title'
        },
        rateLimit: 2000
      }
    };
  }

  /**
   * Initialize browser with Bright Data proxy
   */
  async initBrowser() {
    console.log('🚀 Starting browser with Bright Data proxy...');
    
    this.browser = await chromium.launch({
      headless: true,
      proxy: this.proxy.getProxyConfig()
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'nl-NL',
      timezoneId: 'Europe/Amsterdam',
      permissions: [],
      extraHTTPHeaders: {
        'Accept-Language': 'nl-NL,nl;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    console.log('✅ Browser initialized with Dutch locale & Bright Data proxy');
  }

  /**
   * Scrape single product from retailer
   */
  async scrapeProduct(productId, ean, retailerKey) {
    const retailer = this.retailers[retailerKey];
    if (!retailer) {
      throw new Error(`Unknown retailer: ${retailerKey}`);
    }

    const page = await this.context.newPage();
    
    try {
      console.log(`🔍 Scraping ${retailer.name} for EAN: ${ean}`);
      
      // Navigate to search page
      const searchUrl = `${retailer.searchUrl}${ean}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Wait for price element
      await page.waitForSelector(retailer.selectors.price, { timeout: 10000 });
      
      // Extract data
      const priceText = await page.locator(retailer.selectors.price).first().textContent();
      const availabilityText = await page.locator(retailer.selectors.availability).first().textContent();
      const productUrl = page.url();
      
      // Parse price (remove €, comma's, etc)
      const price = parseFloat(priceText.replace(/[€\s.,]/g, '').replace(',', '.'));
      const inStock = availabilityText.toLowerCase().includes('voorraad') || 
                       availabilityText.toLowerCase().includes('beschikbaar');
      
      // Save to database
      const snapshot = await this.savePriceSnapshot({
        product_id: productId,
        retailer: retailer.name,
        price: price,
        in_stock: inStock,
        competitor_url: productUrl,
        scraped_at: new Date()
      });
      
      console.log(`✅ ${retailer.name}: €${price.toFixed(2)} ${inStock ? '✓' : '✗'}`);
      
      // Rate limiting
      await this.sleep(retailer.rateLimit);
      
      return snapshot;
      
    } catch (error) {
      console.error(`❌ Scraping ${retailer.name} failed:`, error.message);
      
      // Log failed scrape
      await this.logFailedScrape(productId, retailerKey, error.message);
      
      // Rotate proxy session on failure
      if (error.message.includes('timeout') || error.message.includes('blocked')) {
        this.proxy.rotateSession();
      }
      
      return null;
      
    } finally {
      await page.close();
    }
  }

  /**
   * Scrape all retailers for a product
   */
  async scrapeAllRetailers(productId, ean) {
    const results = {
      product_id: productId,
      ean: ean,
      retailers: {},
      scraped_at: new Date(),
      success_count: 0,
      failed_count: 0
    };

    for (const [key, retailer] of Object.entries(this.retailers)) {
      try {
        const snapshot = await this.scrapeProduct(productId, ean, key);
        
        if (snapshot) {
          results.retailers[key] = {
            success: true,
            price: snapshot.price,
            in_stock: snapshot.in_stock,
            url: snapshot.competitor_url
          };
          results.success_count++;
        } else {
          results.retailers[key] = { success: false };
          results.failed_count++;
        }
        
      } catch (error) {
        results.retailers[key] = { 
          success: false, 
          error: error.message 
        };
        results.failed_count++;
      }
    }

    return results;
  }

  /**
   * Save price snapshot to database
   */
  async savePriceSnapshot(data) {
    const [snapshot] = await db('price_snapshots')
      .insert({
        product_id: data.product_id,
        retailer: data.retailer,
        price: data.price,
        in_stock: data.in_stock,
        competitor_url: data.competitor_url,
        scraped_at: data.scraped_at
      })
      .returning('*');

    return snapshot;
  }

  /**
   * Log failed scrape attempt
   */
  async logFailedScrape(productId, retailer, errorMessage) {
    await db('scrape_jobs').insert({
      product_id: productId,
      retailer: retailer,
      status: 'failed',
      error_message: errorMessage,
      created_at: new Date()
    });
  }

  /**
   * Get competitor prices for product (from recent snapshots)
   */
  async getCompetitorPrices(productId, hoursAgo = 24) {
    const cutoff = new Date(Date.now() - (hoursAgo * 60 * 60 * 1000));
    
    const snapshots = await db('price_snapshots')
      .where('product_id', productId)
      .where('scraped_at', '>', cutoff)
      .orderBy('scraped_at', 'desc');

    // Group by retailer, take most recent
    const byRetailer = {};
    for (const snap of snapshots) {
      if (!byRetailer[snap.retailer]) {
        byRetailer[snap.retailer] = snap;
      }
    }

    return Object.values(byRetailer);
  }

  /**
   * Cleanup
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🛑 Browser closed');
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI usage
if (require.main === module) {
  const scraper = new ProductionScraper();
  
  (async () => {
    try {
      await scraper.initBrowser();
      
      // Test scrape
      const productId = 36; // Apple AirPods Pro
      const ean = '194253398578';
      
      console.log(`\n🎯 Scraping product ${productId} (EAN: ${ean})\n`);
      const results = await scraper.scrapeAllRetailers(productId, ean);
      
      console.log('\n📊 RESULTS:');
      console.log(`   Success: ${results.success_count}/${Object.keys(scraper.retailers).length}`);
      console.log(`   Failed: ${results.failed_count}`);
      console.log('\n   Prices:');
      
      for (const [retailer, data] of Object.entries(results.retailers)) {
        if (data.success) {
          console.log(`   ${retailer}: €${data.price.toFixed(2)} ${data.in_stock ? '✓' : '✗'}`);
        } else {
          console.log(`   ${retailer}: ❌ Failed`);
        }
      }
      
    } catch (error) {
      console.error('Scraper error:', error);
    } finally {
      await scraper.close();
      process.exit(0);
    }
  })();
}

module.exports = ProductionScraper;
