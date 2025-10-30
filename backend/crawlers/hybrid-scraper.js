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
const AdaptiveThrottler = require('../utils/adaptive-throttling');
const BrowserProfiles = require('../utils/browser-profiles');
const HttpCacheManager = require('../utils/http-cache-manager');
const db = require('../config/database');

class HybridScraper {
  constructor() {
    this.proxyPool = new ProxyPool();
    this.aiVision = new AIVisionScraper();
    this.throttler = new AdaptiveThrottler({ verbose: true }); // Enable logging
    this.browserProfiles = new BrowserProfiles();
    this.httpCache = new HttpCacheManager({ verbose: true });
    this.browser = null;
    this.context = null;
    this.browserInitialized = false;
    this.browserLock = null; // Prevent concurrent browser launches
    
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
      httpCacheHits: 0,
      failures: 0,
      totalCost: 0,
      preScanFiltered: 0, // URLs filtered out by pre-scan (category pages)
      preScanPassed: 0,   // URLs that passed pre-scan (product pages)
      platformDetections: {
        shopify: 0,
        magento: 0,
        woocommerce: 0,
        lightspeed: 0,
        ccv: 0,
        custom: 0,
        unknown: 0
      }
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
   * Detect e-commerce platform from HTML
   * Analyzes meta tags, scripts, and URL patterns to identify platform
   * @param {Object} page - Playwright page instance
   * @returns {Object} { platform: string, confidence: number, features: array }
   */
  async detectPlatform(page) {
    try {
      const detection = await page.evaluate(() => {
        const html = document.documentElement.outerHTML.toLowerCase();
        const head = document.head?.innerHTML?.toLowerCase() || '';
        const body = document.body?.innerHTML?.toLowerCase() || '';

        const platforms = {
          shopify: {
            score: 0,
            features: []
          },
          magento: {
            score: 0,
            features: []
          },
          woocommerce: {
            score: 0,
            features: []
          },
          lightspeed: {
            score: 0,
            features: []
          },
          ccv: {
            score: 0,
            features: []
          },
          custom: {
            score: 0,
            features: []
          }
        };

        // Shopify detection
        if (html.includes('shopify')) {
          platforms.shopify.score += 30;
          platforms.shopify.features.push('shopify-mention');
        }
        if (html.includes('cdn.shopify.com')) {
          platforms.shopify.score += 40;
          platforms.shopify.features.push('shopify-cdn');
        }
        if (html.includes('shopify.theme')) {
          platforms.shopify.score += 20;
          platforms.shopify.features.push('shopify-theme');
        }
        if (document.querySelector('meta[name="shopify-checkout-api-token"]')) {
          platforms.shopify.score += 50;
          platforms.shopify.features.push('shopify-meta');
        }

        // Magento detection
        if (html.includes('magento')) {
          platforms.magento.score += 30;
          platforms.magento.features.push('magento-mention');
        }
        if (html.includes('mage/') || html.includes('magento_')) {
          platforms.magento.score += 40;
          platforms.magento.features.push('magento-scripts');
        }
        if (document.querySelector('[data-mage-init]') || document.querySelector('[x-magento-init]')) {
          platforms.magento.score += 50;
          platforms.magento.features.push('magento-attributes');
        }

        // WooCommerce detection
        if (html.includes('woocommerce')) {
          platforms.woocommerce.score += 40;
          platforms.woocommerce.features.push('woocommerce-mention');
        }
        if (html.includes('wp-content')) {
          platforms.woocommerce.score += 20;
          platforms.woocommerce.features.push('wordpress');
        }
        if (document.querySelector('.woocommerce') || document.querySelector('[class*="wc-"]')) {
          platforms.woocommerce.score += 50;
          platforms.woocommerce.features.push('woocommerce-classes');
        }
        if (document.querySelector('meta[name="generator"][content*="WooCommerce"]')) {
          platforms.woocommerce.score += 40;
          platforms.woocommerce.features.push('woocommerce-meta');
        }

        // Lightspeed detection
        if (html.includes('lightspeed') || html.includes('webshopapp')) {
          platforms.lightspeed.score += 50;
          platforms.lightspeed.features.push('lightspeed-mention');
        }
        if (html.includes('seoshop.') || html.includes('lightspeedhq.')) {
          platforms.lightspeed.score += 40;
          platforms.lightspeed.features.push('lightspeed-domain');
        }

        // CCV Shop detection
        if (html.includes('ccvshop') || html.includes('ccv.shop')) {
          platforms.ccv.score += 50;
          platforms.ccv.features.push('ccv-mention');
        }
        if (html.includes('ccv-') || html.includes('data-ccv')) {
          platforms.ccv.score += 40;
          platforms.ccv.features.push('ccv-attributes');
        }

        // Find highest scoring platform
        let detected = { platform: 'custom', score: 0, features: [] };
        for (const [name, data] of Object.entries(platforms)) {
          if (data.score > detected.score) {
            detected = { platform: name, score: data.score, features: data.features };
          }
        }

        return detected;
      });

      // Calculate confidence (0-100%)
      const confidence = Math.min(100, detection.score);

      console.log(`🔍 Platform detection: ${detection.platform} (${confidence}% confidence)`, {
        features: detection.features
      });

      return {
        platform: detection.platform,
        confidence,
        features: detection.features
      };

    } catch (error) {
      console.warn(`⚠️ Platform detection failed: ${error.message}`);
      return { platform: 'unknown', confidence: 0, features: [] };
    }
  }

  /**
   * Select optimal selector set based on platform
   * @param {string} platform - Detected platform name
   * @param {Object} fallbackSelectors - Default selectors to use
   * @returns {Object} Optimized selector set
   */
  getOptimizedSelectors(platform, fallbackSelectors) {
    // Platform-specific optimized selectors (prioritize most reliable)
    const platformSelectors = {
      shopify: {
        price: '[itemprop="price"], .product__price .price-item--regular, .product__price .price-item--sale, .product-price, [data-product-price]',
        originalPrice: '.product__price .price-item--regular s, .price--compare, .was-price',
        title: '[itemprop="name"], .product-single__title, .product__title, h1.product-title',
        availability: '[itemprop="availability"], .product-form__inventory, [data-product-available]',
        image: '[itemprop="image"], .product__media img, .product-single__photo img'
      },
      magento: {
        price: '[itemprop="price"], .price-box .price, [data-price-type="finalPrice"], .special-price .price',
        originalPrice: '.old-price .price, .price-box .old-price',
        title: '[itemprop="name"], .product-info-main .page-title, .product-name, h1.product-name',
        availability: '[itemprop="availability"], .stock.available, .stock-status',
        image: '[itemprop="image"], .product-image-photo, .fotorama__img'
      },
      woocommerce: {
        price: '[itemprop="price"], .woocommerce-Price-amount, p.price ins .amount, p.price .amount',
        originalPrice: 'p.price del .amount, .price del .amount',
        title: '[itemprop="name"], .product_title, h1.entry-title',
        availability: '[itemprop="availability"], .stock, .availability',
        image: '[itemprop="image"], .woocommerce-product-gallery__image img, .wp-post-image'
      }
    };

    if (platformSelectors[platform]) {
      console.log(`✅ Using optimized ${platform} selectors`);
      return platformSelectors[platform];
    }

    console.log(`📋 Using universal selectors for ${platform}`);
    return fallbackSelectors;
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
    // Reuse existing browser if already initialized
    if (this.browserInitialized && this.browser) {
      console.log('♻️ Reusing existing browser instance');
      return;
    }

    // Prevent concurrent browser launches
    if (this.browserLock) {
      console.log('⏳ Waiting for existing browser initialization...');
      await this.browserLock;
      return;
    }

    // Create lock promise
    let releaseLock;
    this.browserLock = new Promise(resolve => { releaseLock = resolve; });

    try {
      // Get random browser profile for unique fingerprint
      const profile = this.browserProfiles.getRandomProfile();
      
      const launchOptions = {
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-web-security',
          '--disable-gpu', // Reduce memory usage on Railway
          '--single-process' // Critical: prevent process spawning issues
        ]
      };

      // Add proxy if provided
      if (proxyConfig && proxyConfig.proxy) {
        launchOptions.proxy = proxyConfig.proxy;
        console.log(`✅ Using ${proxyConfig.tier} proxy (cost: €${proxyConfig.cost}/req) + ${profile.type} profile`);
      } else {
        console.log(`🚀 Direct scraping (no proxy) + ${profile.type} profile`);
      }

      this.browser = await chromium.launch(launchOptions);
      this.browserInitialized = true;

      this.context = await this.browser.newContext({
        userAgent: profile.userAgent,
        viewport: profile.viewport,
        locale: 'nl-NL',
        timezoneId: 'Europe/Amsterdam',
        extraHTTPHeaders: profile.headers
      });

      // Resource blocking: block images, stylesheets, fonts, media
      // Target: 50%+ page load speed improvement
      await this.context.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        const blockedTypes = ['image', 'stylesheet', 'font', 'media'];
        
        if (blockedTypes.includes(resourceType)) {
          // Abort blocked resources
          route.abort();
        } else {
          // Allow HTML, scripts, XHR, fetch (needed for scraping)
          route.continue();
        }
      });
    } finally {
      // Release lock
      releaseLock();
      this.browserLock = null;
    }
  }

  /**
   * Fast pre-scan to check if URL is a product page
   * Checks URL patterns and does lightweight page analysis
   * Returns: { isProduct: boolean, reason: string, confidence: number }
   */
  async isProductPage(url) {
    try {
      // 1. URL Pattern Analysis (instant, no page load)
      const urlLower = url.toLowerCase();
      
      // Category/listing page indicators in URL
      const categoryPatterns = [
        '/categor', '/collection', '/shop/', '/products/', '/zoeken',
        '/search', '/filter', '/browse', '/overzicht', '/alle-',
        '?page=', '&page=', '/page/', '/p/', '?q=', '&q=',
        '/tag/', '/tags/', '/brand/', '/brands/', '/merk/'
      ];
      
      const hasCategory = categoryPatterns.some(pattern => urlLower.includes(pattern));
      
      if (hasCategory) {
        return { 
          isProduct: false, 
          reason: 'URL pattern indicates category/listing page',
          confidence: 85,
          method: 'url-pattern'
        };
      }
      
      // Product page indicators in URL
      const productPatterns = [
        '/product/', '/p/', '/pd/', '/item/', '/dp/',
        '.html', '-p-', '/detail/', '/artikel/'
      ];
      
      const hasProduct = productPatterns.some(pattern => urlLower.includes(pattern));
      
      if (hasProduct) {
        return { 
          isProduct: true, 
          reason: 'URL pattern indicates product page',
          confidence: 70,
          method: 'url-pattern'
        };
      }
      
      // 2. Lightweight HEAD request check (fast, no full page load)
      const proxyConfig = await this.proxyPool.getNextProxy();
      await this.init(proxyConfig);
      const page = await this.context.newPage();
      
      try {
        // Navigate but don't wait for full load
        await page.goto(url, { 
          waitUntil: 'domcontentloaded', 
          timeout: 5000 
        });
        
        // Quick DOM analysis (< 100ms)
        const pageType = await page.evaluate(() => {
          // Check for product schema
          const productSchema = document.querySelector('script[type="application/ld+json"]');
          if (productSchema) {
            try {
              const data = JSON.parse(productSchema.textContent);
              const hasProduct = JSON.stringify(data).includes('"@type":"Product"');
              if (hasProduct) return { type: 'product', confidence: 95 };
            } catch (e) {}
          }
          
          // Check for multiple product cards (= listing page)
          const productCards = document.querySelectorAll('[data-product-id], .product-card, .product-item, article.product, [itemtype*="Product"]');
          if (productCards.length > 3) {
            return { type: 'listing', confidence: 90 };
          }
          
          // Check for single product price
          const priceElements = document.querySelectorAll('[itemprop="price"], .price, [data-price], .product-price');
          if (priceElements.length === 1 || priceElements.length === 2) {
            return { type: 'product', confidence: 75 };
          }
          
          // Check for pagination (= listing page)
          const pagination = document.querySelector('.pagination, [class*="paging"], nav[aria-label*="pagination"]');
          if (pagination) {
            return { type: 'listing', confidence: 85 };
          }
          
          // Check for add-to-cart button (= product page)
          const addToCart = document.querySelector('[data-add-to-cart], .add-to-cart, button[type="submit"][name*="add"], input[name="add-to-cart"]');
          if (addToCart) {
            return { type: 'product', confidence: 80 };
          }
          
          // Check title/h1
          const h1 = document.querySelector('h1');
          const title = h1?.textContent?.toLowerCase() || '';
          if (title.includes('categor') || title.includes('collectie') || title.includes('overzicht')) {
            return { type: 'listing', confidence: 70 };
          }
          
          // Default: uncertain
          return { type: 'unknown', confidence: 0 };
        });
        
        await page.close();
        await this.close();
        
        if (pageType.type === 'product') {
          return {
            isProduct: true,
            reason: 'DOM analysis confirms product page',
            confidence: pageType.confidence,
            method: 'dom-analysis'
          };
        } else if (pageType.type === 'listing') {
          return {
            isProduct: false,
            reason: 'DOM analysis indicates listing/category page',
            confidence: pageType.confidence,
            method: 'dom-analysis'
          };
        }
        
        // Uncertain - allow scraping but flag it
        return {
          isProduct: true, // Default to true to avoid false negatives
          reason: 'Could not determine page type, proceeding with caution',
          confidence: 50,
          method: 'fallback'
        };
        
      } catch (error) {
        await page.close();
        await this.close();
        
        // On error, default to true (don't skip potential products)
        return {
          isProduct: true,
          reason: `Pre-scan failed: ${error.message}`,
          confidence: 0,
          method: 'error-fallback'
        };
      }
      
    } catch (error) {
      console.warn(`⚠️ Pre-scan error: ${error.message}`);
      return {
        isProduct: true,
        reason: 'Pre-scan unavailable, assuming product page',
        confidence: 0,
        method: 'error'
      };
    }
  }

  /**
   * Scrape product with multi-tier fallback strategy
   * Now with adaptive throttling per retailer + HTTP caching + product page pre-scan
   */
  async scrapeProduct(url, ean = null, retailerKey = null, productId = null, skipPreScan = false) {
    // FAST PRE-SCAN: Check if this is actually a product page
    if (!skipPreScan) {
      const preScan = await this.isProductPage(url);
      console.log(`🔍 Pre-scan: ${preScan.isProduct ? '✅ Product' : '❌ Not product'} (${preScan.confidence}% confidence, ${preScan.reason})`);
      
      if (!preScan.isProduct && preScan.confidence >= 70) {
        this.stats.preScanFiltered++; // Track filtered URLs
        throw new Error(`Not a product page: ${preScan.reason} (confidence: ${preScan.confidence}%)`);
      }
      
      this.stats.preScanPassed++; // Track passed URLs
    }
    
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

    // Apply adaptive throttling BEFORE scraping
    await this.throttler.beforeRequest(retailerLabel);

    this.stats.total++;
    let scrapedData = null;
    let tier = null;
    let cost = 0;
    let scrapeStartTime = Date.now();
    let scrapeError = null;
    let cacheHit = false;

    // Check HTTP cache first (ETag/Last-Modified)
    try {
      const proxyConfig = await this.proxyPool.getNextProxy();
      await this.init(proxyConfig);
      const page = await this.context.newPage();
      
      const cacheCheck = await this.httpCache.checkIfModified(url, page);
      await page.close();
      
      if (!cacheCheck.changed && cacheCheck.cached) {
        console.log(`✅ HTTP Cache Hit (304 Not Modified) - using cached data`);
        scrapedData = cacheCheck.cached;
        tier = 'http-cache';
        cost = 0; // Free!
        cacheHit = true;
        this.stats.httpCacheHits++;
        
        await this.close();
        
        // Update throttler with fast cache hit
        const responseTime = Date.now() - scrapeStartTime;
        await this.throttler.afterRequest(retailerLabel, {
          responseTime,
          status: 304,
          success: true
        });
        
        this.stats.totalCost += cost;
        
        if (scrapedData && !scrapedData.ean && ean) {
          scrapedData.ean = ean;
        }

        if (productId) {
          await this.savePriceSnapshot(productId, retailerLabel, scrapedData, tier, cost);
        }
        
        return {
          ...scrapedData,
          tier,
          cost,
          retailer: retailerLabel,
          retailerKey: retailerKey || retailerLabel,
          responseTime,
          cacheHit: true
        };
      }
      
      await this.close();
    } catch (cacheError) {
      console.log(`⚠️ Cache check failed, continuing with normal scrape: ${cacheError.message}`);
      await this.close();
    }

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
      scrapeError = error;
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
          scrapeError = null; // Success clears error
          console.log(`✅ Tier 2 success: €${scrapedData.price}`);
        } else {
          throw new Error('No valid price found');
        }
      } catch (error2) {
        scrapeError = error2;
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
            scrapeError = null; // Success clears error
            console.log(`✅ Tier 3 success: €${scrapedData.price} (cost: €${cost})`);
          } else {
            throw new Error('No valid price found');
          }
        } catch (error3) {
          scrapeError = error3;
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
            scrapeError = null; // Success clears error
            console.log(`✅ Tier 4 AI success: €${scrapedData.price} (cost: €${cost})`);
          } catch (error4) {
            scrapeError = error4;
            console.error(`❌ All tiers failed for ${url}:`, error4.message);
            this.stats.failures++;
            throw new Error(`All scraping methods failed: ${error4.message}`);
          }
        }
      }
    }

    await this.close();

    // Calculate response time
    const responseTime = Date.now() - scrapeStartTime;

    // Update adaptive throttler with result
    await this.throttler.afterRequest(retailerLabel, {
      error: scrapeError?.message,
      responseTime,
      status: scrapeError ? (scrapeError.message.includes('429') ? 429 : 500) : 200,
      success: !scrapeError
    });

    // Update stats
    this.stats.totalCost += cost;

    // Store in HTTP cache if successful (for future 304 checks)
    if (scrapedData && !cacheHit) {
      try {
        // Re-open browser briefly to get response headers
        const proxyConfig = await this.proxyPool.getNextProxy();
        await this.init(proxyConfig);
        const page = await this.context.newPage();
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const headers = response.headers();
        await page.close();
        await this.close();
        
        await this.httpCache.store(url, headers, scrapedData);
      } catch (cacheStoreError) {
        console.log(`⚠️ Failed to store HTTP cache: ${cacheStoreError.message}`);
        await this.close();
      }
    }

    // Save to database if productId provided
    if (scrapedData && !scrapedData.ean && ean) {
      scrapedData.ean = ean;
    }

    if (productId && scrapedData) {
      await this.savePriceSnapshot(productId, retailerLabel, scrapedData, tier, cost);
    }

    return {
      ...scrapedData,
      tier,
      cost,
      retailer: retailerLabel,
      retailerKey: retailerKey || retailerLabel,
      responseTime,
      cacheHit
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

      // Detect platform for unknown retailers (optimize selector set)
      let optimizedSelectors = retailer.selectors;
      let detectedPlatform = null;
      
      if (retailer.name === 'Universal (Auto-detect)') {
        detectedPlatform = await this.detectPlatform(page);
        if (detectedPlatform.confidence >= 50) {
          optimizedSelectors = this.getOptimizedSelectors(detectedPlatform.platform, retailer.selectors);
          // Track platform detection stats
          if (this.stats.platformDetections[detectedPlatform.platform] !== undefined) {
            this.stats.platformDetections[detectedPlatform.platform]++;
          } else {
            this.stats.platformDetections.unknown++;
          }
        }
      }

      const productData = await page.evaluate((selectors) => {
        // Helper function to try multiple selectors
        const normalizeSelectorList = (value) => {
          if (!value) return [];
          if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
          if (typeof value === 'string') {
            return value.split(',').map((s) => s.trim()).filter(Boolean);
          }
          return [];
        };

        const trySelectors = (selectorValue) => {
          const selectors = normalizeSelectorList(selectorValue);
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

        const toAbsoluteUrl = (value) => {
          if (!value) return null;
          try {
            return new URL(value, window.location.origin).href;
          } catch (error) {
            return value;
          }
        };

        const flattenNodes = (node) => {
          if (!node) return [];
          if (Array.isArray(node)) {
            return node.flatMap(flattenNodes);
          }
          if (typeof node === 'object') {
            const items = [node];
            if (node['@graph']) items.push(...flattenNodes(node['@graph']));
            if (node.itemListElement) items.push(...flattenNodes(node.itemListElement));
            if (node.offers) items.push(...flattenNodes(node.offers));
            return items;
          }
          return [];
        };

        const normalizeGtin = (value) => {
          if (value === null || value === undefined) {
            return null;
          }
          if (typeof value === 'object') {
            if (Array.isArray(value)) {
              for (const item of value) {
                const normalized = normalizeGtin(item);
                if (normalized) return normalized;
              }
              return null;
            }
            const candidateKeys = ['value', '@value', 'text', 'barcode', 'sku', 'id'];
            for (const key of candidateKeys) {
              if (value[key]) {
                const normalized = normalizeGtin(value[key]);
                if (normalized) return normalized;
              }
            }
            if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
              return normalizeGtin(value.toString());
            }
            return null;
          }

          const digits = String(value).replace(/[^0-9]/g, '');
          if (!digits) return null;
          if ([8, 12, 13, 14].includes(digits.length)) {
            return digits;
          }
          return null;
        };

        const collectGtinCandidates = (value, pool) => {
          if (value === null || value === undefined) {
            return;
          }
          if (Array.isArray(value)) {
            value.forEach((item) => collectGtinCandidates(item, pool));
            return;
          }
          if (typeof value === 'object') {
            const keys = ['gtin', 'gtin13', 'gtin12', 'gtin8', 'gtin14', 'barcode', 'ean', 'value', '@value', 'text'];
            let found = false;
            for (const key of keys) {
              if (value[key]) {
                collectGtinCandidates(value[key], pool);
                found = true;
              }
            }
            if (!found) {
              if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
                collectGtinCandidates(value.toString(), pool);
              }
            }
            return;
          }

          const normalized = normalizeGtin(value);
          if (normalized) {
            pool.push(normalized);
          }
        };

        const dedupe = (values) => Array.from(new Set(values.filter(Boolean)));

          const extractImage = (source) => {
            if (!source) return null;
            if (typeof source === 'string') return source;
            if (Array.isArray(source)) {
              for (const item of source) {
                const candidate = extractImage(item);
                if (candidate) return candidate;
              }
              return null;
            }
            if (typeof source === 'object') {
              if (source.url) return extractImage(source.url);
              if (source.contentUrl) return extractImage(source.contentUrl);
              if (source.image) return extractImage(source.image);
            }
            return null;
          };

        const extractFromJsonLd = () => {
          const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          if (!scripts.length) return null;

          const parsed = [];
          for (const script of scripts) {
            if (!script.textContent) continue;
            try {
              parsed.push(JSON.parse(script.textContent));
            } catch (error) {
              continue;
            }
          }

          if (!parsed.length) return null;

          const nodes = parsed.flatMap(flattenNodes);
          const productNode = nodes.find((node) => {
            if (!node || typeof node !== 'object') return false;
            const type = node['@type'];
            if (!type) return false;
            if (Array.isArray(type)) return type.includes('Product');
            return type === 'Product';
          });

          if (!productNode) return null;

          const offerNodes = flattenNodes(productNode.offers || []);
          const offer = offerNodes.find((candidate) => candidate && (candidate.price || (candidate.priceSpecification && candidate.priceSpecification.price))) || offerNodes[0] || null;

          const priceCandidate = offer?.priceSpecification?.price ?? offer?.price ?? productNode.offers?.price ?? productNode.price;
          const price = parsePrice(priceCandidate != null ? `${priceCandidate}` : null);
          if (!price) return null;

          const originalCandidate = offer?.priceSpecification?.compareAtPrice ?? offer?.priceSpecification?.highPrice ?? offer?.priceSpecification?.referencePrice ?? productNode.offers?.priceSpecification?.highPrice;
          const originalPrice = parsePrice(originalCandidate != null ? `${originalCandidate}` : null);

          const availabilityRaw = (offer?.availability || '').toString().toLowerCase();
          const inStock = availabilityRaw ? availabilityRaw.includes('instock') || availabilityRaw.includes('preorder') : true;

          const imageValue = extractImage(productNode.image) || extractImage(productNode.offers?.image) || extractImage(productNode.offers?.itemOffered?.image);
          const brandNode = productNode.brand;
          const brand = typeof brandNode === 'string' ? brandNode : brandNode?.name || null;

          const aggregate = productNode.aggregateRating || {};
          const rating = aggregate.ratingValue ? parseFloat(aggregate.ratingValue) : null;
          const reviewCount = aggregate.reviewCount ? parseInt(aggregate.reviewCount, 10) : (aggregate.ratingCount ? parseInt(aggregate.ratingCount, 10) : null);

          const shippingDetails = productNode.shippingDetails || productNode.offers?.shippingDetails || null;
          const shippingText = typeof shippingDetails === 'string'
            ? shippingDetails
            : (
                shippingDetails?.shippingRate?.name ||
                shippingDetails?.shippingRate?.description ||
                shippingDetails?.deliveryTime?.handlingTime ||
                shippingDetails?.deliveryTime?.transitTimeLabel ||
                ''
              );
          const hasFreeShipping = typeof shippingText === 'string' && shippingText.toLowerCase().includes('gratis');

          const eanCandidates = [];
          collectGtinCandidates(
            [
              productNode.gtin, productNode.gtin13, productNode.gtin12, productNode.gtin8, productNode.gtin14,
              productNode.isbn, productNode.ean, productNode.productID, productNode.sku,
              offer?.gtin13, offer?.gtin, offer?.sku, offer?.productID,
              productNode.identifier, productNode.barcode,
              productNode?.offers?.itemOffered?.gtin13, productNode?.offers?.itemOffered?.gtin
            ],
            eanCandidates
          );

          const payload = {
            title: productNode.name || document.querySelector('h1')?.textContent?.trim() || 'Unknown Product',
            price,
            originalPrice,
            discountPercentage: (originalPrice && originalPrice > price) ? Math.round(((originalPrice - price) / originalPrice) * 100) : null,
            discountBadge: null,
            hasFreeShipping,
            shippingInfo: shippingText || null,
            inStock,
            imageUrl: imageValue ? toAbsoluteUrl(imageValue) : null,
            brand,
            rating: rating || null,
            reviewCount: reviewCount || null,
            stockLevel: null,
            deliveryTime: productNode.offers?.deliveryLeadTime?.transitTimeLabel || productNode.offers?.availabilityStarts || null,
            bundleInfo: null,
            currency: offer?.priceCurrency || offer?.priceSpecification?.priceCurrency || productNode.priceCurrency || 'EUR',
            ean: dedupe(eanCandidates)[0] || null,
            extractedBy: 'json-ld',
            scrapedAt: new Date().toISOString()
          };

          console.log('[HybridScraper][JSON-LD] Extracted product payload', {
            title: payload.title,
            price: payload.price
          });

          return payload;
        };

        const schemaPayload = extractFromJsonLd();
        if (schemaPayload) {
          return schemaPayload;
        }

        const eanCandidates = [];

        const priceElement = trySelectors(selectors.price);
        const originalPriceElement = trySelectors(selectors.originalPrice);
        const titleElement = trySelectors(selectors.title);
        const stockElement = trySelectors(selectors.availability);
        const imageElement = trySelectors(selectors.image);
        const eanSelectors = [
          selectors.ean,
          '[itemprop="gtin13"]',
          '[itemprop="gtin"]',
          '[itemprop="gtin8"]',
          '[itemprop="gtin12"]',
          '[data-product-ean]',
          '[data-product-barcode]',
          '.product-ean',
          '.product__ean',
          '.product-barcode',
          '.ean',
          '#ProductEan',
          '#ProductEAN',
          '#ProductBarcode',
          '[data-ean]'
        ].filter(Boolean);
        const eanElement = trySelectors(eanSelectors);
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
            imageUrl = imageElement.src || imageElement.dataset.src || imageElement.getAttribute('data-lazy-src') || imageElement.getAttribute('data-srcset');
            if (!imageUrl && imageElement.srcset) {
              imageUrl = imageElement.srcset.split(',').map((entry) => entry.trim().split(' ')[0]).find(Boolean) || null;
            }
          } else if (imageElement.tagName === 'SOURCE' || imageElement.tagName === 'SOURCESET') {
            const srcset = imageElement.srcset || imageElement.getAttribute('data-srcset');
            if (srcset) {
              imageUrl = srcset.split(',').map((entry) => entry.trim().split(' ')[0]).find(Boolean) || null;
            }
          } else if (imageElement.tagName === 'META' || imageElement.tagName === 'LINK') {
            imageUrl = imageElement.content || imageElement.getAttribute('href');
          } else {
            imageUrl = imageElement.getAttribute('data-src') || imageElement.dataset?.src || imageElement.style?.backgroundImage?.replace(/url\(("|')?(.*?)("|')?\)/, '$2');
          }

          if (imageUrl && imageUrl.startsWith('data:image')) {
            imageUrl = null;
          }
        }

        if (!imageUrl) {
          const ogImage = document.querySelector('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"], link[rel="image_src"]');
          if (ogImage) {
            imageUrl = ogImage.getAttribute('content') || ogImage.getAttribute('href');
          }
        }

        imageUrl = imageUrl ? toAbsoluteUrl(imageUrl) : null;

        const eanFromElement = normalizeGtin(readElementValue(eanElement));
        if (eanFromElement) {
          eanCandidates.push(eanFromElement);
        }

        const metaEanSelectors = [
          'meta[property="product:ean"]',
          'meta[property="og:ean"]',
          'meta[name="ean"]',
          'meta[name="gtin"]',
          'meta[itemprop="gtin13"]',
          'meta[itemprop="gtin"]'
        ];
        for (const selector of metaEanSelectors) {
          const meta = document.querySelector(selector);
          if (meta?.content) {
            const normalized = normalizeGtin(meta.content);
            if (normalized) {
              eanCandidates.push(normalized);
            }
          }
        }

        const productJsonScript = document.querySelector('script[type="application/json"][data-product-json], script#ProductJson');
        if (productJsonScript?.textContent) {
          try {
            const productJson = JSON.parse(productJsonScript.textContent);
            const variants = Array.isArray(productJson?.variants) ? productJson.variants : [];
            variants.forEach((variant) => {
              collectGtinCandidates([variant?.barcode, variant?.sku], eanCandidates);
            });
          } catch (error) {
            // Ignore JSON parse errors silently
          }
        }

        const shopifyAnalyticsProduct = window?.ShopifyAnalytics?.meta?.product;
        if (shopifyAnalyticsProduct) {
          collectGtinCandidates([
            shopifyAnalyticsProduct.barcode,
            shopifyAnalyticsProduct.product_id,
            ...(Array.isArray(shopifyAnalyticsProduct.variants) ? shopifyAnalyticsProduct.variants.map((variant) => variant?.barcode || variant?.sku) : [])
          ], eanCandidates);
        }

        if (!eanCandidates.length) {
          const bodyText = document.body?.innerText || '';
          const textMatch = bodyText.match(/(?:EAN|GTIN|Barcode)\D*([0-9]{8,14})/i);
          if (textMatch && textMatch[1]) {
            const normalized = normalizeGtin(textMatch[1]);
            if (normalized) {
              eanCandidates.push(normalized);
            }
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
          ean: dedupe(eanCandidates)[0] || null,
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
      }, optimizedSelectors);

      // Add platform detection info to result if detected
      if (detectedPlatform && productData) {
        productData.detectedPlatform = detectedPlatform.platform;
        productData.platformConfidence = detectedPlatform.confidence;
      }

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
   * Now includes adaptive throttling metrics + Sprint 2.9 features
   */
  getStats() {
    const successRate = this.stats.total > 0 
      ? ((this.stats.total - this.stats.failures) / this.stats.total * 100).toFixed(1)
      : 0;
    
    const avgCost = this.stats.total > 0
      ? (this.stats.totalCost / this.stats.total).toFixed(4)
      : 0;

    const cacheHitRate = this.stats.total > 0
      ? ((this.stats.httpCacheHits / this.stats.total) * 100).toFixed(1)
      : 0;

    const preScanTotal = this.stats.preScanFiltered + this.stats.preScanPassed;
    const preScanFilterRate = preScanTotal > 0
      ? ((this.stats.preScanFiltered / preScanTotal) * 100).toFixed(1)
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
        aiVision: this.stats.aiVisionSuccess,
        httpCache: this.stats.httpCacheHits
      },
      sprint29Features: {
        httpCacheHits: this.stats.httpCacheHits,
        cacheHitRate: `${cacheHitRate}%`,
        preScanFiltered: this.stats.preScanFiltered,
        preScanPassed: this.stats.preScanPassed,
        preScanFilterRate: `${preScanFilterRate}%`,
        platformDetections: this.stats.platformDetections,
        browserProfiles: this.browserProfiles.getStats(),
        adaptiveThrottling: this.throttler.getAllStats()
      },
      proxyPoolStats: this.proxyPool.getStats(),
      throttlingStats: this.throttler.getAllStats()
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
      this.browserInitialized = false;
      console.log('🔒 Browser closed and cleaned up');
    }
  }
}

module.exports = HybridScraper;
