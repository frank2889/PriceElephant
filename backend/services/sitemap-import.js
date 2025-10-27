/**
 * Sitemap Import Service
 * 
 * Import products by crawling sitemap.xml URLs
 * Alternative to Channable for customers without feed
 */

const Sitemapper = require('sitemapper');
const { chromium } = require('playwright');
const db = require('../config/database');

class SitemapImportService {
  constructor(customerId) {
    this.customerId = customerId;
    this.browser = null;
  }

  /**
   * Import products from sitemap URL
   * @param {string} sitemapUrl - URL to sitemap.xml
   * @param {object} options - Import options
   * @returns {object} Import results
   */
  async importFromSitemap(sitemapUrl, options = {}) {
    const {
      maxProducts = 100, // Limit aantal producten
      productUrlPattern = null, // Regex filter voor product URLs
      selectors = {} // Custom selectors voor scraping
    } = options;

    console.log(`[SitemapImport] Starting import from: ${sitemapUrl}`);
    console.log(`[SitemapImport] Max products: ${maxProducts}`);

    try {
      // Parse sitemap
      const sitemap = new Sitemapper({
        url: sitemapUrl,
        timeout: 15000
      });

      const { sites } = await sitemap.fetch();
      console.log(`[SitemapImport] Found ${sites.length} URLs in sitemap`);

      // Filter product URLs
      let productUrls = sites;
      
      if (productUrlPattern) {
        const regex = new RegExp(productUrlPattern, 'i');
        productUrls = sites.filter(url => regex.test(url));
        console.log(`[SitemapImport] Filtered to ${productUrls.length} product URLs`);
      }

      // Limit to maxProducts
      productUrls = productUrls.slice(0, maxProducts);
      console.log(`[SitemapImport] Processing ${productUrls.length} products`);

      // Scrape products
      const results = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        products: []
      };

      this.browser = await chromium.launch({ headless: true });

      for (let i = 0; i < productUrls.length; i++) {
        const url = productUrls[i];
        console.log(`[SitemapImport] [${i+1}/${productUrls.length}] Scraping: ${url}`);

        try {
          const product = await this.scrapeProduct(url, selectors);
          
          if (!product.title || !product.price) {
            console.warn(`[SitemapImport] Skipping ${url}: Missing title or price`);
            results.skipped++;
            continue;
          }

          // Check if product exists (by URL)
          const existing = await db('products')
            .where({ 
              customer_id: this.customerId,
              product_url: url
            })
            .first();

          if (existing) {
            // Update
            await db('products')
              .where({ id: existing.id })
              .update({
                product_name: product.title,
                own_price: product.price,
                in_stock: product.inStock,
                updated_at: new Date()
              });
            
            results.updated++;
            console.log(`[SitemapImport] Updated: ${product.title}`);
          } else {
            // Create
            const [newProduct] = await db('products').insert({
              customer_id: this.customerId,
              product_name: product.title,
              product_ean: product.ean || null,
              product_sku: product.sku || null,
              own_price: product.price,
              product_url: url,
              in_stock: product.inStock,
              brand: product.brand || null,
              category: product.category || null,
              image_url: product.imageUrl || null,
              import_source: 'sitemap',
              created_at: new Date()
            }).returning('*');
            
            results.created++;
            results.products.push(newProduct);
            console.log(`[SitemapImport] Created: ${product.title}`);
          }

          // Rate limiting
          await this.delay(2000);

        } catch (error) {
          console.error(`[SitemapImport] Error scraping ${url}:`, error.message);
          results.errors.push({
            url,
            error: error.message
          });
        }
      }

      await this.browser.close();

      console.log(`[SitemapImport] Complete: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped, ${results.errors.length} errors`);

      return results;

    } catch (error) {
      if (this.browser) {
        await this.browser.close();
      }
      throw new Error(`Sitemap import failed: ${error.message}`);
    }
  }

  /**
   * Scrape product data from URL
   * @param {string} url - Product page URL
   * @param {object} customSelectors - Custom CSS selectors
   * @returns {object} Product data
   */
  async scrapeProduct(url, customSelectors = {}) {
    const page = await this.browser.newPage();

    try {
      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      await page.waitForTimeout(1000);

      // Default selectors (werkt voor de meeste webshops)
      const selectors = {
        title: customSelectors.title || 'h1, [itemprop="name"], .product-title, .product-name',
        price: customSelectors.price || '[itemprop="price"], .price, .product-price, [data-price]',
        ean: customSelectors.ean || '[itemprop="gtin13"], [itemprop="gtin"], .ean, .gtin',
        sku: customSelectors.sku || '[itemprop="sku"], .sku, .product-code',
        brand: customSelectors.brand || '[itemprop="brand"], .brand, .manufacturer',
        category: customSelectors.category || '[itemprop="category"], .category, .breadcrumb',
        image: customSelectors.image || '[itemprop="image"], .product-image img, .main-image',
        inStock: customSelectors.inStock || '[itemprop="availability"], .stock-status, .availability'
      };

      const product = await page.evaluate((selectors) => {
        const getTextContent = (selector) => {
          const selectorList = selector.split(',').map(s => s.trim());
          for (const sel of selectorList) {
            const el = document.querySelector(sel);
            if (el) {
              return el.textContent.trim();
            }
          }
          return null;
        };

        const getAttribute = (selector, attr) => {
          const selectorList = selector.split(',').map(s => s.trim());
          for (const sel of selectorList) {
            const el = document.querySelector(sel);
            if (el) {
              return el.getAttribute(attr);
            }
          }
          return null;
        };

        const title = getTextContent(selectors.title);
        const priceText = getTextContent(selectors.price) || getAttribute(selectors.price, 'content');
        const price = priceText ? parseFloat(priceText.replace(/[^0-9,.]/g, '').replace(',', '.')) : null;
        const ean = getTextContent(selectors.ean) || getAttribute(selectors.ean, 'content');
        const sku = getTextContent(selectors.sku) || getAttribute(selectors.sku, 'content');
        const brand = getTextContent(selectors.brand) || getAttribute(selectors.brand, 'content');
        const category = getTextContent(selectors.category);
        const imageUrl = getAttribute(selectors.image, 'src') || getAttribute(selectors.image, 'content');
        const stockText = getTextContent(selectors.inStock) || getAttribute(selectors.inStock, 'content');
        const inStock = stockText ? !stockText.toLowerCase().includes('out of stock') : true;

        return {
          title,
          price,
          ean,
          sku,
          brand,
          category,
          imageUrl,
          inStock
        };
      }, selectors);

      await page.close();
      return product;

    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = SitemapImportService;
