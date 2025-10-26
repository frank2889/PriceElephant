/**
 * Simple Hybrid Scraper - 4-Tier Fallback + Price Alerts
 * 
 * Tier 1: Direct (FREE) → 60% success
 * Tier 2: Free Proxies (FREE) → 40% success  
 * Tier 3: WebShare (€0.0003) → 90% success
 * Tier 4: AI Vision (€0.02) → 99% emergency fallback
 * 
 * USP: Real-time price alerts via Klaviyo (SMS + Email)
 * Cost: €30-50/month for 500 products, 95%+ margin
 */

require('dotenv').config();
const { chromium } = require('playwright');
const ProxyPool = require('../utils/proxy-pool');
const AIVisionScraper = require('../utils/ai-vision-scraper');
const PriceAlertService = require('../services/price-alert');
const db = require('../config/database');

class SimpleHybridScraper {
  constructor() {
    this.proxyPool = new ProxyPool();
    this.aiVision = new AIVisionScraper();
    this.alertService = new PriceAlertService();
    this.browser = null;
    this.context = null;
    
    // Retailer configurations
    this.retailers = {
      coolblue: {
        name: 'Coolblue',
        selectors: {
          price: '.sales-price__current, [data-test="sales-price"]',
          title: 'h1.product-name, h1[data-test="product-name"]',
          availability: '.product-buy-box__availability'
        }
      },
      bol: {
        name: 'Bol.com',
        selectors: {
          price: '.promo-price, [data-test="price"]',
          title: 'h1[data-test="title"]',
          availability: '.buy-block__availability'
        }
      }
    };
    
    // Stats
    this.stats = {
      total: 0,
      direct: 0,
      freeProxy: 0,
      webshare: 0,
      aiVision: 0,
      failures: 0,
      totalCost: 0
    };
  }

  /**
   * Initialize browser
   */
  async init(proxyConfig = null) {
    const launchOptions = {
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    };

    if (proxyConfig?.proxy) {
      launchOptions.proxy = proxyConfig.proxy;
    }

    this.browser = await chromium.launch(launchOptions);
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'nl-NL'
    });
  }

  /**
   * Scrape with CSS selectors
   */
  async scrapeWithSelectors(url, retailer) {
    const page = await this.context.newPage();
    
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const data = await page.evaluate((selectors) => {
        const trySelector = (selectorString) => {
          for (const sel of selectorString.split(',')) {
            const el = document.querySelector(sel.trim());
            if (el) return el;
          }
          return null;
        };

        const priceEl = trySelector(selectors.price);
        const titleEl = trySelector(selectors.title);
        const stockEl = trySelector(selectors.availability);

        if (!priceEl) return null;

        let priceText = priceEl.textContent.trim();
        priceText = priceText.replace('€', '').replace(',', '.').replace(/[^\d.]/g, '');
        const price = parseFloat(priceText);

        if (isNaN(price) || price <= 0) return null;

        return {
          title: titleEl?.textContent?.trim() || 'Unknown Product',
          price,
          inStock: stockEl ? !stockEl.textContent.toLowerCase().includes('niet beschikbaar') : true,
          currency: 'EUR'
        };
      }, retailer.selectors);

      await page.close();
      return data;
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Main scrape method with 4-tier fallback
   */
  async scrape(url, retailerKey, productId = null, clientId = null) {
    const retailer = this.retailers[retailerKey];
    if (!retailer) throw new Error(`Unknown retailer: ${retailerKey}`);

    this.stats.total++;
    let data = null;
    let tier = null;
    let cost = 0;

    // TIER 1: Direct
    try {
      console.log('🎯 Tier 1: Direct (no proxy)');
      await this.init();
      data = await this.scrapeWithSelectors(url, retailer);
      
      if (data?.price > 0) {
        this.stats.direct++;
        tier = 'direct';
        console.log(`✅ Success: €${data.price}`);
      } else {
        throw new Error('No price found');
      }
    } catch (e1) {
      console.log(`❌ Tier 1 failed: ${e1.message}`);
      await this.close();

      // TIER 2: Free Proxies
      try {
        console.log('🎯 Tier 2: Free Proxies');
        await this.proxyPool.refreshFreeProxies();
        const proxy = await this.proxyPool.getNextProxy();
        await this.init(proxy);
        data = await this.scrapeWithSelectors(url, retailer);
        
        if (data?.price > 0) {
          this.stats.freeProxy++;
          tier = 'free-proxy';
          console.log(`✅ Success: €${data.price}`);
        } else {
          throw new Error('No price found');
        }
      } catch (e2) {
        console.log(`❌ Tier 2 failed: ${e2.message}`);
        await this.close();

        // TIER 3: WebShare
        try {
          console.log('🎯 Tier 3: WebShare');
          const proxy = this.proxyPool.createProxyConfig('webshare');
          if (!proxy.proxy) throw new Error('WebShare not configured');
          
          await this.init(proxy);
          data = await this.scrapeWithSelectors(url, retailer);
          
          if (data?.price > 0) {
            this.stats.webshare++;
            tier = 'webshare';
            cost = 0.0003;
            console.log(`✅ Success: €${data.price} (cost: €${cost})`);
          } else {
            throw new Error('No price found');
          }
        } catch (e3) {
          console.log(`❌ Tier 3 failed: ${e3.message}`);
          await this.close();

          // TIER 4: AI Vision Emergency
          try {
            console.log('🎯 Tier 4: AI Vision (emergency fallback)');
            
            // Take screenshot for AI
            await this.init();
            const page = await this.context.newPage();
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            const screenshot = await page.screenshot({ fullPage: false });
            await page.close();
            
            data = await this.aiVision.extractFromScreenshot(screenshot.toString('base64'), url);
            
            if (data?.price > 0) {
              this.stats.aiVision++;
              tier = 'ai-vision';
              cost = 0.02;
              console.log(`✅ AI Success: €${data.price} (cost: €${cost})`);
            } else {
              throw new Error('AI could not extract price');
            }
          } catch (e4) {
            console.error(`❌ All tiers failed:`, e4.message);
            this.stats.failures++;
            await this.close();
            throw new Error(`All scraping methods failed for ${url}`);
          }
        }
      }
    }

    await this.close();
    this.stats.totalCost += cost;

    // Save to database + trigger alerts
    if (productId && data) {
      await this.saveAndAlert(productId, clientId, retailerKey, data, tier, cost);
    }

    return { ...data, tier, cost, retailer: retailer.name };
  }

  /**
   * Save price snapshot and trigger alerts
   */
  async saveAndAlert(productId, clientId, retailerKey, data, tier, cost) {
    try {
      // Save to database
      await db('competitor_prices').insert({
        product_id: productId,
        retailer: retailerKey,
        price: data.price,
        url: null,
        in_stock: data.inStock,
        scraped_at: new Date(),
        created_at: new Date()
      });
      
      console.log(`💾 Saved ${retailerKey}: €${data.price}`);

      // Trigger price alerts (USP feature!)
      if (clientId) {
        const alerts = await this.alertService.analyzePriceSnapshot(
          productId,
          clientId,
          retailerKey,
          data.price,
          data.inStock
        );
        
        if (alerts.length > 0) {
          console.log(`🔔 ${alerts.length} alerts generated`);
        }
      }
    } catch (error) {
      console.error('Save/alert error:', error.message);
    }
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      avgCost: this.stats.total > 0 ? (this.stats.totalCost / this.stats.total).toFixed(4) : 0,
      successRate: this.stats.total > 0 ? 
        (((this.stats.total - this.stats.failures) / this.stats.total) * 100).toFixed(1) : 0
    };
  }
}

module.exports = SimpleHybridScraper;
