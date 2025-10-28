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
      // Current/Sale price (actual selling price)
      price: [
        // Schema.org
        '[itemprop="price"]', 'meta[property="product:price:amount"]',
        // Shopify
        '.product__price .price-item--regular', '.product__price .price-item--sale', '.product-price', '[data-product-price]',
        // Magento
        '.price-box .price', '[data-price-type="finalPrice"]', '.special-price .price', '.product-info-price .price',
        // WooCommerce
        '.woocommerce-Price-amount', 'p.price ins .amount', 'p.price .amount', '.price ins .amount',
        // Lightspeed
        '.product-price', '.price-current', '.sale-price',
        // CCV Shop
        '.productPrice', '.price', '.salePrice',
        // Generic
        '.sale-price', '.special-price', '.price', '[data-price]', '.product-price', '.current-price'
      ].join(', '),
      
      // Original price (crossed out / was price)
      originalPrice: [
        // Shopify
        '.product__price .price-item--regular s', '.price--compare', '.was-price',
        // Magento
        '.old-price .price', '.price-box .old-price',
        // WooCommerce
        'p.price del .amount', '.price del .amount',
        // Generic
        '.original-price', '.old-price', '.was-price', '.compare-at-price', 's .price', 'del .price'
      ].join(', '),
      
      // Discount/Sale badge
      discount: [
        // Shopify
        '.product__badge', '.badge--sale', '[data-sale-badge]',
        // Magento
        '.product-label-sale', '.sale-label',
        // WooCommerce
        '.onsale', '.product-badge',
        // Generic
        '.discount', '.sale-badge', '.discount-badge', '.promo-badge'
      ].join(', '),
      
      // Free shipping info
      shipping: [
        // Shopify
        '.product__shipping', '.free-shipping', '[data-free-shipping]',
        // Magento
        '.shipping-info', '.free-shipping-message',
        // WooCommerce
        '.free-shipping', '.shipping-notice',
        // Generic
        '.shipping-info', '.delivery-info', '.free-shipping', '.shipping-message'
      ].join(', '),
      
      // Brand/Manufacturer
      brand: [
        // Schema.org
        '[itemprop="brand"]',
        // Shopify
        '.product__vendor', '[data-product-vendor]',
        // Magento
        '.product-info-main .brand', '[data-th="Brand"]',
        // WooCommerce
        '.product_meta .posted_in a',
        // Generic
        '.brand', '.manufacturer', '.merk', '.vendor'
      ].join(', '),
      
      // Product ratings/reviews
      rating: [
        // Schema.org
        '[itemprop="ratingValue"]', '[itemprop="aggregateRating"]',
        // Shopify
        '.product-rating', '.spr-badge-starrating',
        // Magento
        '.rating-result', '[itemprop="ratingValue"]',
        // WooCommerce
        '.star-rating', '.woocommerce-product-rating',
        // Generic
        '.rating', '.review-rating', '.product-rating', '[data-rating]'
      ].join(', '),
      
      // Review count
      reviewCount: [
        // Schema.org
        '[itemprop="reviewCount"]', '[itemprop="ratingCount"]',
        // Shopify
        '.spr-badge-caption',
        // Magento
        '.reviews-actions a',
        // WooCommerce
        '.woocommerce-review-link',
        // Generic
        '.review-count', '.rating-count', '[data-review-count]'
      ].join(', '),
      
      // Stock quantity/urgency
      stockLevel: [
        // Shopify
        '.product__inventory-quantity', '[data-stock-level]',
        // Magento
        '.stock.qty', '.qty-available',
        // WooCommerce
        '.stock-quantity',
        // Generic
        '.stock-level', '.quantity-available', '.items-left'
      ].join(', '),
      
      // Delivery time
      deliveryTime: [
        // Shopify
        '.product__delivery', '.delivery-time', '[data-delivery]',
        // Magento
        '.delivery-info', '.estimated-delivery',
        // WooCommerce
        '.delivery-estimate',
        // Generic
        '.delivery-time', '.shipping-time', '.delivery-estimate', '.levertijd'
      ].join(', '),
      
      // Bundle/combo deals
      bundleInfo: [
        // Generic
        '.bundle-info', '.combo-deal', '.package-deal', '.product-bundle', '.inclusief'
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

  getRetailerLabel(url, fallbackName = 'unknown') {
    if (fallbackName && fallbackName !== 'Universal (Auto-detect)') {
      return fallbackName;
    }

    try {
      const hostname = new URL(url).hostname || fallbackName;
      return hostname.replace(/^www\./, '') || fallbackName;
    } catch (error) {
      return fallbackName;
    }
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
  const retailerLabel = this.getRetailerLabel(url, retailerName);
    
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
      await this.savePriceSnapshot(productId, retailerLabel, scrapedData, tier, cost);
    }

    return {
      ...scrapedData,
      tier,
      cost,
      retailer: retailerLabel,
      retailerKey: retailerKey || retailerLabel
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
          const selectors = selectorString.split(',').map(s => s.trim()).filter(Boolean);
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) return el;
          }
          return null;
        };

        const readElementValue = (el) => {
          if (!el) return null;
          const attrCandidates = ['content', 'data-price', 'data-value', 'data-amount', 'value'];
          for (const attr of attrCandidates) {
            const attrValue = el.getAttribute && el.getAttribute(attr);
            if (attrValue) {
              return attrValue;
            }
          }
          if (el.dataset) {
            if (el.dataset.price) return el.dataset.price;
            if (el.dataset.value) return el.dataset.value;
            if (el.dataset.amount) return el.dataset.amount;
          }
          return el.textContent;
        };

        // Helper to parse price from text
        const parsePrice = (raw) => {
          if (!raw) return null;
          const text = raw.trim();
          if (!text) return null;

          let cleaned = text
            .replace(/[^0-9.,-]/g, '')
            .replace(/\s+/g, '');

          if (!cleaned) return null;

          const commaCount = (cleaned.match(/,/g) || []).length;
          const dotCount = (cleaned.match(/\./g) || []).length;

          if (commaCount && dotCount) {
            if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
              cleaned = cleaned.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
            } else {
              cleaned = cleaned.replace(/,/g, '');
            }
          } else if (commaCount === 1 && dotCount === 0) {
            cleaned = cleaned.replace(',', '.');
          } else if (dotCount > 1 && commaCount === 0) {
            cleaned = cleaned.replace(/\.(?=\d{3}(?:\D|$))/g, '');
          }

          const price = parseFloat(cleaned);
          return (isNaN(price) || price <= 0) ? null : price;
        };

        const priceElement = trySelectors(selectors.price);
        const originalPriceElement = trySelectors(selectors.originalPrice);
        const titleElement = trySelectors(selectors.title);
        const stockElement = trySelectors(selectors.availability);
        const imageElement = trySelectors(selectors.image);
        const discountElement = trySelectors(selectors.discount);
        const shippingElement = trySelectors(selectors.shipping);
        const brandElement = trySelectors(selectors.brand);
        const ratingElement = trySelectors(selectors.rating);
        const reviewCountElement = trySelectors(selectors.reviewCount);
        const stockLevelElement = trySelectors(selectors.stockLevel);
        const deliveryTimeElement = trySelectors(selectors.deliveryTime);
        const bundleInfoElement = trySelectors(selectors.bundleInfo);

        if (!priceElement) {
          const diagnostic = {
            reason: 'PRICE_SELECTOR_MISSED',
            selectorsTried: selectors.price,
            htmlSample: document.body.innerHTML.slice(0, 1000)
          };
          console.log('[HybridScraper][Selectors] No price element found', diagnostic);
          return null; // Trigger fallback
        }

        // Parse current price (actual selling price)
        const price = parsePrice(readElementValue(priceElement));
        if (!price) {
          console.log('[HybridScraper][Selectors] Invalid price parsed', {
            raw: readElementValue(priceElement),
            selector: priceElement ? priceElement.outerHTML?.slice(0, 200) : null
          });
          return null; // Invalid price
        }

        // Parse original price (if on sale)
        const originalPrice = originalPriceElement ? parsePrice(readElementValue(originalPriceElement)) : null;
        
        // Calculate discount percentage
        let discountPercentage = null;
        if (originalPrice && originalPrice > price) {
          discountPercentage = Math.round(((originalPrice - price) / originalPrice) * 100);
        }

        // Extract discount badge text
        const discountBadge = discountElement?.textContent?.trim() || null;

        // Check for free shipping
        const shippingText = shippingElement?.textContent?.toLowerCase() || '';
        const hasFreeShipping = shippingText.includes('gratis') || 
                                shippingText.includes('free') || 
                                shippingText.includes('verzending');

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

        // Parse rating (1-5 scale)
        let rating = null;
        if (ratingElement) {
          const ratingText = ratingElement.textContent || ratingElement.content || ratingElement.getAttribute('content');
          const ratingMatch = ratingText?.match(/[\d.]+/);
          if (ratingMatch) {
            rating = parseFloat(ratingMatch[0]);
            if (rating > 5) rating = rating / 10; // Convert 10-scale to 5-scale
            rating = Math.min(5, Math.max(0, rating)); // Clamp to 0-5
          }
        }

        // Parse review count
        let reviewCount = null;
        if (reviewCountElement) {
          const reviewText = reviewCountElement.textContent || reviewCountElement.content;
          const reviewMatch = reviewText?.match(/\d+/);
          if (reviewMatch) {
            reviewCount = parseInt(reviewMatch[0], 10);
          }
        }

        // Extract brand
        const brand = brandElement?.textContent?.trim() || brandElement?.content || null;

        // Extract stock level (numeric quantity if available)
        let stockLevel = null;
        if (stockLevelElement) {
          const stockText = stockLevelElement.textContent || stockLevelElement.value;
          const stockMatch = stockText?.match(/\d+/);
          if (stockMatch) {
            stockLevel = parseInt(stockMatch[0], 10);
          }
        }

        // Extract delivery time
        const deliveryTime = deliveryTimeElement?.textContent?.trim() || null;

        // Extract bundle info
        const bundleInfo = bundleInfoElement?.textContent?.trim() || null;

        const payload = {
          title: titleElement?.textContent?.trim() || 'Unknown Product',
          price: price,
          originalPrice: originalPrice,
          discountPercentage: discountPercentage,
          discountBadge: discountBadge,
          hasFreeShipping: hasFreeShipping,
          shippingInfo: shippingText || null,
          inStock: stockElement ? !stockElement.textContent.toLowerCase().includes('niet beschikbaar') : true,
          imageUrl: imageUrl,
          brand: brand,
          rating: rating,
          reviewCount: reviewCount,
          stockLevel: stockLevel,
          deliveryTime: deliveryTime,
          bundleInfo: bundleInfo,
          currency: 'EUR',
          extractedBy: 'selectors',
          scrapedAt: new Date().toISOString()
        };

        console.log('[HybridScraper][Selectors] Extracted product payload', {
          title: payload.title,
          price: payload.price,
          hasOriginalPrice: Boolean(payload.originalPrice),
          hasImage: Boolean(payload.imageUrl),
          hasBrand: Boolean(payload.brand)
        });

        return payload;
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
  async savePriceSnapshot(productId, retailerLabel, data, tier, cost) {
    try {
      await db('price_snapshots').insert({
        product_id: productId,
        retailer: retailerLabel,
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
      
      console.log(`💾 Saved ${retailerLabel} price: €${data.price} (method: ${tier})`);
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
