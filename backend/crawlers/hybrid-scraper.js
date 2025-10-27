/**
 * Hybrid Scraper - Cost-Optimized Multi-Tier Scraping
 * 
 * Strategy:
 * 1. Try direct (no proxy) - FREE - 60% success
 * 2. Try free proxies - FREE - 40% success  
 * 3. Try WebShare - €0.0003/req - 90% success
 * 4. Fallback AI Vision - €0.02/req - 99% success
 * 
 * Target: €30-50/maand for 500 products (2x/dag scraping)
 */

require('dotenv').config();
const { chromium } = require('playwright');
const ProxyPool = require('../utils/proxy-pool');
const AIVisionScraper = require('../utils/ai-vision-scraper');
const db = require('../config/database');

class HybridScraper {
  constructor() {
    this.proxyPool = new ProxyPool();
    this.aiVision = new AIVisionScraper();
    this.browser = null;
    this.context = null;
    
    // Retailer configurations
    this.retailers = {
      coolblue: {
        name: 'Coolblue',
        searchUrl: 'https://www.coolblue.nl/zoeken?query=',
        selectors: {
          price: '[data-test="sales-price-current"], .sales-price__current, [class*="sales-price"]',
          availability: '[data-test="delivery-promise"], .availability-label',
          title: 'h1, [data-test="product-name"]'
        }
      },
      bol: {
        name: 'Bol.com',
        searchUrl: 'https://www.bol.com/nl/nl/s/?searchtext=',
        selectors: {
          price: '.promo-price, [data-test="price"]',
          availability: '.buy-block__availability',
          title: 'h1[data-test="title"]'
        }
      },
      amazon: {
        name: 'Amazon.nl',
        searchUrl: 'https://www.amazon.nl/s?k=',
        selectors: {
          price: '.a-price-whole, #priceblock_ourprice',
          availability: '#availability span',
          title: '#productTitle'
        }
      },
      mediamarkt: {
        name: 'MediaMarkt',
        searchUrl: 'https://www.mediamarkt.nl/nl/search.html?query=',
        selectors: {
          price: '[data-test="mms-product-price"], .price',
          availability: '[data-test="mms-delivery-info"]',
          title: 'h1[data-test="mms-product-title"]'
        }
      }
    };

    // Universal fallback selectors voor onbekende retailers
    // Werkt met: Shopify, Magento, WooCommerce, Lightspeed, CCV, etc.
    this.universalSelectors = {
      price: [
        // Schema.org
        '[itemprop="price"]', 'meta[property="product:price:amount"]',
        // Shopify
        '.product__price .price-item--regular', '.product-price', '[data-product-price]',
        // Magento
        '.price-box .price', '[data-price-type="finalPrice"]', '.product-info-price .price',
        // WooCommerce
        '.woocommerce-Price-amount', 'p.price .amount', '.price ins .amount',
        // Lightspeed
        '.product-price', '.price-current',
        // CCV Shop
        '.productPrice', '.price',
        // Generic
        '.price', '[data-price]', '.product-price', '.current-price'
      ].join(', '),
      
      title: [
        // Schema.org
        '[itemprop="name"]',
        // Shopify
        '.product-single__title', '.product__title', 'h1.product-title',
        // Magento
        '.product-info-main .page-title', '.product-name', 'h1.product-name',
        // WooCommerce
        '.product_title', 'h1.entry-title',
        // Lightspeed
        '.product-title', '.product-name',
        // CCV Shop
        '.product-name', '.productTitle',
        // Generic
        'h1', '.product-title', '.product-name', '.title'
      ].join(', '),
      
      availability: [
        // Schema.org
        '[itemprop="availability"]',
        // Shopify
        '.product-form__inventory', '[data-product-available]',
        // Magento
        '.stock.available', '.stock-status',
        // WooCommerce
        '.stock', '.availability',
        // Generic
        '.stock-status', '.availability', '.voorraad', '.in-stock'
      ].join(', '),
      
      image: [
        // Schema.org
        '[itemprop="image"]', 'meta[property="og:image"]',
        // Shopify
        '.product__media img', '.product-single__photo img', '.product__main-photos img',
        // Magento
        '.product-image-photo', '.fotorama__img', '.gallery-placeholder__image',
        // WooCommerce
        '.woocommerce-product-gallery__image img', '.wp-post-image',
        // Lightspeed
        '.product-image img', '.main-image img',
        // CCV Shop
        '.productImage img', '.product-photo img',
        // Generic
        '.product-image img', '.main-image', '.gallery-image img', 'img.product'
      ].join(', ')
    };
    
    // Statistics
    this.stats = {
      total: 0,
      directSuccess: 0,
      freeProxySuccess: 0,
      paidProxySuccess: 0,
      aiVisionSuccess: 0,
      failures: 0,
      totalCost: 0
    };
  }

  /**
   * Auto-detect retailer from URL
   * @param {string} url - Product URL
   * @returns {string|null} Retailer key or null for universal
   */
  detectRetailerFromUrl(url) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('coolblue.nl')) return 'coolblue';
    if (urlLower.includes('bol.com')) return 'bol';
    if (urlLower.includes('amazon.nl')) return 'amazon';
    if (urlLower.includes('mediamarkt.nl')) return 'mediamarkt';
    
    // Unknown retailer - will use universal selectors
    return null;
  }

  /**
   * Initialize browser with proxy config
   */
  async init(proxyConfig = null) {
    const launchOptions = {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-web-security'
      ]
    };

    // Add proxy if provided
    if (proxyConfig && proxyConfig.proxy) {
      launchOptions.proxy = proxyConfig.proxy;
      console.log(`✅ Using ${proxyConfig.tier} proxy (cost: €${proxyConfig.cost}/req)`);
    } else {
      console.log('🚀 Direct scraping (no proxy)');
    }

    this.browser = await chromium.launch(launchOptions);

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'nl-NL',
      timezoneId: 'Europe/Amsterdam',
      extraHTTPHeaders: {
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8'
      }
    });
  }

  /**
   * Scrape product with multi-tier fallback strategy
   */
  async scrapeProduct(url, ean = null, retailerKey = null, productId = null) {
    // Auto-detect retailer from URL if not provided
    if (!retailerKey) {
      retailerKey = this.detectRetailerFromUrl(url);
    }

    const retailer = retailerKey ? this.retailers[retailerKey] : null;
    
    // Use universal selectors for unknown retailers
    const selectors = retailer ? retailer.selectors : this.universalSelectors;
    const retailerName = retailer ? retailer.name : 'Universal (Auto-detect)';
    
    console.log(`🏪 Retailer: ${retailerName}`);

    this.stats.total++;
    let scrapedData = null;
    let tier = null;
    let cost = 0;

    // Try Tier 1: Direct (no proxy)
    try {
      console.log(`🎯 Tier 1: Direct scraping ${url}`);
      const proxyConfig = await this.proxyPool.getNextProxy();
      await this.init(proxyConfig);
      
      scrapedData = await this.scrapeWithSelectors(url, { selectors, name: retailerName });
      
      if (scrapedData && scrapedData.price > 0) {
        this.proxyPool.recordResult('direct', true, 0);
        this.stats.directSuccess++;
        tier = 'direct';
        cost = 0;
        console.log(`✅ Tier 1 success: €${scrapedData.price}`);
      } else {
        throw new Error('No valid price found');
      }
    } catch (error) {
      this.proxyPool.recordResult('direct', false, 0);
      console.log(`❌ Tier 1 failed: ${error.message}`);
      await this.close();

      // Try Tier 2: Free proxies
      try {
        console.log(`🎯 Tier 2: Free proxy scraping`);
        await this.proxyPool.refreshFreeProxies();
        const proxyConfig = await this.proxyPool.getNextProxy();
        await this.init(proxyConfig);
        
        scrapedData = await this.scrapeWithSelectors(url, { selectors, name: retailerName });
        
        if (scrapedData && scrapedData.price > 0) {
          this.proxyPool.recordResult('free', true, 0);
          this.stats.freeProxySuccess++;
          tier = 'free';
          cost = 0;
          console.log(`✅ Tier 2 success: €${scrapedData.price}`);
        } else {
          throw new Error('No valid price found');
        }
      } catch (error2) {
        this.proxyPool.recordResult('free', false, 0);
        console.log(`❌ Tier 2 failed: ${error2.message}`);
        await this.close();

        // Try Tier 3: WebShare (cheap paid)
        try {
          console.log(`🎯 Tier 3: WebShare proxy`);
          const proxyConfig = this.proxyPool.createProxyConfig('webshare');
          if (!proxyConfig.proxy) {
            throw new Error('WebShare not configured');
          }
          
          await this.init(proxyConfig);
          scrapedData = await this.scrapeWithSelectors(url, { selectors, name: retailerName });
          
          if (scrapedData && scrapedData.price > 0) {
            this.proxyPool.recordResult('webshare', true, 0.0003);
            this.stats.paidProxySuccess++;
            tier = 'webshare';
            cost = 0.0003;
            console.log(`✅ Tier 3 success: €${scrapedData.price} (cost: €${cost})`);
          } else {
            throw new Error('No valid price found');
          }
        } catch (error3) {
          this.proxyPool.recordResult('webshare', false, 0);
          console.log(`❌ Tier 3 failed: ${error3.message}`);
          await this.close();

          // Try Tier 4: AI Vision (final fallback)
          console.log(`🎯 Tier 4: AI Vision fallback`);
          try {
            scrapedData = await this.aiVision.scrape(url);
            this.stats.aiVisionSuccess++;
            tier = 'ai-vision';
            cost = 0.02; // GPT-4V API cost
            console.log(`✅ Tier 4 AI success: €${scrapedData.price} (cost: €${cost})`);
          } catch (error4) {
            console.error(`❌ All tiers failed for ${url}:`, error4.message);
            this.stats.failures++;
            throw new Error(`All scraping methods failed: ${error4.message}`);
          }
        }
      }
    }

    await this.close();

    // Update stats
    this.stats.totalCost += cost;

    // Save to database if productId provided
    if (productId && scrapedData) {
      await this.savePriceSnapshot(productId, retailerKey, scrapedData, tier, cost);
    }

    return {
      ...scrapedData,
      tier,
      cost,
      retailer: retailer.name
    };
  }

  /**
   * Scrape with traditional selectors (fast, cheap)
   */
  async scrapeWithSelectors(url, retailer) {
    const page = await this.context.newPage();
    
    try {
      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const productData = await page.evaluate((selectors) => {
        // Helper function to try multiple selectors
        const trySelectors = (selectorString) => {
          const selectors = selectorString.split(',').map(s => s.trim());
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) return el;
          }
          return null;
        };

        const priceElement = trySelectors(selectors.price);
        const titleElement = trySelectors(selectors.title);
        const stockElement = trySelectors(selectors.availability);
        const imageElement = trySelectors(selectors.image);

        if (!priceElement) {
          return null; // Trigger fallback
        }

        // Parse price
        let priceText = priceElement.textContent.trim();
        priceText = priceText.replace('€', '').replace(',', '.').replace(/[^\d.]/g, '').trim();
        const price = parseFloat(priceText);

        if (isNaN(price) || price <= 0) {
          return null; // Invalid price
        }

        // Extract image URL
        let imageUrl = null;
        if (imageElement) {
          if (imageElement.tagName === 'IMG') {
            imageUrl = imageElement.src || imageElement.dataset.src || imageElement.getAttribute('data-lazy-src');
          } else if (imageElement.tagName === 'META') {
            imageUrl = imageElement.content;
          }
          
          // Convert relative URLs to absolute
          if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = new URL(imageUrl, window.location.origin).href;
          }
        }

        return {
          title: titleElement?.textContent?.trim() || 'Unknown Product',
          price: price,
          inStock: stockElement ? !stockElement.textContent.toLowerCase().includes('niet beschikbaar') : true,
          imageUrl: imageUrl,
          currency: 'EUR',
          extractedBy: 'selectors',
          scrapedAt: new Date().toISOString()
        };
      }, retailer.selectors);

      await page.close();
      return productData;

    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Save price snapshot to database
   */
  async savePriceSnapshot(productId, retailerKey, data, tier, cost) {
    try {
      await db('price_snapshots').insert({
        product_id: productId,
        retailer: retailerKey,
        price: data.price,
        currency: data.currency || 'EUR',
        in_stock: data.inStock,
        scraped_at: new Date(),
        scraping_method: tier,
        scraping_cost: cost,
        metadata: JSON.stringify({
          title: data.title,
          extractedBy: data.extractedBy
        })
      });
      
      console.log(`💾 Saved ${retailerKey} price: €${data.price} (method: ${tier})`);
    } catch (error) {
      console.error('Failed to save price snapshot:', error.message);
    }
  }

  /**
   * Scrape all retailers for a product
   */
  async scrapeAllRetailers(productId, ean, urls = {}) {
    const results = [];
    
    for (const [retailerKey, url] of Object.entries(urls)) {
      if (!url || !this.retailers[retailerKey]) continue;
      
      try {
        const result = await this.scrapeProduct(url, ean, retailerKey, productId);
        results.push(result);
        
        // Rate limiting between retailers
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`Failed to scrape ${retailerKey}:`, error.message);
        results.push({
          retailer: retailerKey,
          error: error.message,
          success: false
        });
      }
    }
    
    return results;
  }

  /**
   * Get scraping statistics
   */
  getStats() {
    const successRate = this.stats.total > 0 
      ? ((this.stats.total - this.stats.failures) / this.stats.total * 100).toFixed(1)
      : 0;
    
    const avgCost = this.stats.total > 0
      ? (this.stats.totalCost / this.stats.total).toFixed(4)
      : 0;

    return {
      total: this.stats.total,
      success: this.stats.total - this.stats.failures,
      failures: this.stats.failures,
      successRate: `${successRate}%`,
      totalCost: `€${this.stats.totalCost.toFixed(2)}`,
      avgCostPerScrape: `€${avgCost}`,
      byMethod: {
        direct: this.stats.directSuccess,
        freeProxy: this.stats.freeProxySuccess,
        paidProxy: this.stats.paidProxySuccess,
        aiVision: this.stats.aiVisionSuccess
      },
      proxyPoolStats: this.proxyPool.getStats()
    };
  }

  /**
   * Close browser
   */
  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = HybridScraper;
