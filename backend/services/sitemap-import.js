/**
 * Sitemap Import Service
 * 
 * Import products by crawling sitemap.xml URLs
 * Alternative to Channable for customers without feed
 * Uses HybridScraper for intelligent, cost-optimized product detection
 */

const Sitemapper = require('sitemapper');
const HybridScraper = require('../crawlers/hybrid-scraper');
const db = require('../config/database');

class SitemapImportService {
  constructor(customerId) {
    this.customerId = customerId;
    this.scraper = new HybridScraper();
  }

  /**
   * Import products from sitemap URL
   * @param {string} sitemapUrl - URL to sitemap.xml
   * @param {object} options - Import options
   * @returns {object} Import results
   */
  async importFromSitemap(sitemapUrl, options = {}) {
    const {
      maxProducts = 100,
      productUrlPattern = null,
    } = options;

    console.log(`[SitemapImport] Starting intelligent product detection from: ${sitemapUrl}`);
    console.log(`[SitemapImport] Max products target: ${maxProducts}`);

    try {
      const sitemap = new Sitemapper({
        url: sitemapUrl,
        timeout: 15000
      });

      const { sites } = await sitemap.fetch();
      console.log(`[SitemapImport] Found ${sites.length} URLs in sitemap`);

      let candidateUrls = sites;
      
      if (productUrlPattern) {
        const regex = new RegExp(productUrlPattern, 'i');
        candidateUrls = sites.filter(url => regex.test(url));
        console.log(`[SitemapImport] Pre-filtered to ${candidateUrls.length} candidate URLs`);
      }

      console.log(`[SitemapImport] Starting intelligent product detection with HybridScraper...`);

      const results = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        products: [],
        scanned: 0,
        detectedProducts: 0,
        scrapingStats: {
          direct: 0,
          freeProxy: 0,
          paidProxy: 0,
          aiVision: 0,
          totalCost: 0
        }
      };

      let productsFound = 0;
      
      for (let i = 0; i < candidateUrls.length && productsFound < maxProducts; i++) {
        const url = candidateUrls[i];
        results.scanned++;
        
        console.log(`[SitemapImport] [${i+1}/${candidateUrls.length}] Scanning: ${url}`);

        try {
          const scrapedData = await this.scraper.scrapeProduct(url, null, null, null);
          
          if (!scrapedData || !scrapedData.price || !scrapedData.title) {
            console.log(`[SitemapImport] ❌ Not a product page (no price/title found)`);
            results.skipped++;
            continue;
          }

          console.log(`[SitemapImport] ✅ Product detected: ${scrapedData.title} - €${scrapedData.price}`);
          results.detectedProducts++;
          productsFound++;

          if (scrapedData.extractedBy === 'selectors') {
            results.scrapingStats.direct++;
          } else if (scrapedData.extractedBy === 'ai-vision') {
            results.scrapingStats.aiVision++;
          }

          const existing = await db('products')
            .where({ 
              customer_id: this.customerId,
              product_url: url
            })
            .first();

          if (existing) {
            await db('products')
              .where({ id: existing.id })
              .update({
                product_name: scrapedData.title,
                own_price: scrapedData.price,
                in_stock: scrapedData.inStock !== false,
                updated_at: new Date()
              });
            
            results.updated++;
            console.log(`[SitemapImport] Updated: ${scrapedData.title}`);
          } else {
            const [newProduct] = await db('products').insert({
              customer_id: this.customerId,
              product_name: scrapedData.title,
              product_ean: null,
              product_sku: null,
              own_price: scrapedData.price,
              product_url: url,
              in_stock: scrapedData.inStock !== false,
              brand: null,
              category: null,
              image_url: null,
              import_source: 'sitemap',
              created_at: new Date()
            }).returning('*');
            
            results.created++;
            results.products.push(newProduct);
            console.log(`[SitemapImport] Created: ${scrapedData.title}`);
          }

        } catch (error) {
          console.error(`[SitemapImport] Error scanning ${url}:`, error.message);
          results.errors.push({
            url,
            error: error.message
          });
          results.skipped++;
        }
      }

      const scraperStats = this.scraper.getStats();
      results.scrapingStats = {
        direct: scraperStats.directSuccess,
        freeProxy: scraperStats.freeProxySuccess,
        paidProxy: scraperStats.paidProxySuccess,
        aiVision: scraperStats.aiVisionSuccess,
        totalCost: scraperStats.totalCost
      };

      console.log(`[SitemapImport] ✅ Complete!`);
      console.log(`[SitemapImport] Scanned: ${results.scanned} URLs`);
      console.log(`[SitemapImport] Products detected: ${results.detectedProducts}`);
      console.log(`[SitemapImport] Created: ${results.created}, Updated: ${results.updated}`);
      console.log(`[SitemapImport] Skipped: ${results.skipped}, Errors: ${results.errors.length}`);
      console.log(`[SitemapImport] Scraping cost: €${results.scrapingStats.totalCost.toFixed(4)}`);

      return results;

    } catch (error) {
      throw new Error(`Sitemap import failed: ${error.message}`);
    }
  }
}

module.exports = SitemapImportService;
