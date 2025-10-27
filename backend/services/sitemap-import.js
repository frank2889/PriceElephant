/**
 * Sitemap Import Service
 * 
 * Import products by crawling sitemap.xml URLs
 * Alternative to Channable for customers without feed
 * Uses HybridScraper for intelligent, cost-optimized product detection
 */

const HybridScraper = require('../crawlers/hybrid-scraper');
const db = require('../config/database');
const ShopifyIntegration = require('../integrations/shopify');

// Dynamic import for ES Module compatibility
let Sitemapper;
async function getSitemapper() {
  if (!Sitemapper) {
    const module = await import('sitemapper');
    Sitemapper = module.default;
  }
  return Sitemapper;
}

class SitemapImportService {
  constructor(customerId) {
    this.customerId = customerId;
    this.scraper = new HybridScraper();
    this.shopify = new ShopifyIntegration();
  }

  /**
   * Import products from sitemap URL
   * @param {string} sitemapUrl - URL to sitemap.xml
   * @param {object} options - Import options
   * @returns {object} Import results
   */
  async importFromSitemap(sitemapUrl, options = {}) {
    const {
      maxProducts = 500,
      productUrlPattern = null,
      onProgress = null
    } = options;

    console.log(`[SitemapImport] Starting intelligent product detection from: ${sitemapUrl}`);
    console.log(`[SitemapImport] Max products target: ${maxProducts}`);

    // Helper to send progress updates
    const sendProgress = (data) => {
      if (onProgress) {
        onProgress(data);
      }
    };

    try {
      sendProgress({
        stage: 'fetching',
        message: 'Sitemap wordt opgehaald...',
        percentage: 5
      });

      // Get Sitemapper class via dynamic import
      const SitemapperClass = await getSitemapper();
      const sitemap = new SitemapperClass({
        url: sitemapUrl,
        timeout: 15000
      });

      const { sites } = await sitemap.fetch();
      console.log(`[SitemapImport] Found ${sites.length} URLs in sitemap`);

      sendProgress({
        stage: 'parsing',
        message: `${sites.length} URLs gevonden in sitemap`,
        percentage: 10,
        totalUrls: sites.length
      });

      let candidateUrls = sites;
      
      if (productUrlPattern) {
        const regex = new RegExp(productUrlPattern, 'i');
        candidateUrls = sites.filter(url => regex.test(url));
        console.log(`[SitemapImport] Pre-filtered to ${candidateUrls.length} candidate URLs`);
        
        sendProgress({
          stage: 'filtering',
          message: `${candidateUrls.length} URLs na filtering`,
          percentage: 15,
          candidateUrls: candidateUrls.length
        });
      }

      console.log(`[SitemapImport] Starting intelligent product detection with HybridScraper...`);

      sendProgress({
        stage: 'scanning',
        message: 'Intelligente scan gestart...',
        percentage: 20
      });

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
        
        // Calculate real-time percentage (20% reserved for final steps)
        const scanProgress = Math.floor(20 + (i / candidateUrls.length) * 60);
        
        sendProgress({
          stage: 'scanning',
          message: `Scan ${i + 1}/${Math.min(candidateUrls.length, maxProducts)} - ${url.substring(0, 50)}...`,
          percentage: scanProgress,
          scanned: results.scanned,
          detectedProducts: results.detectedProducts,
          created: results.created,
          currentUrl: url
        });
        
        console.log(`[SitemapImport] [${i+1}/${candidateUrls.length}] Scanning: ${url}`);

        try {
          const scrapedData = await this.scraper.scrapeProduct(url, null, null, null);
          
          if (!scrapedData || !scrapedData.price || !scrapedData.title) {
            console.log(`[SitemapImport] ❌ Not a product page (no price/title found)`);
            results.skipped++;
            
            sendProgress({
              stage: 'scanning',
              message: `❌ Geen product: ${url.substring(0, 50)}...`,
              percentage: scanProgress,
              scanned: results.scanned,
              detectedProducts: results.detectedProducts,
              skipped: results.skipped
            });
            
            continue;
          }

          console.log(`[SitemapImport] ✅ Product detected: ${scrapedData.title} - €${scrapedData.price}`);
          results.detectedProducts++;
          productsFound++;

          sendProgress({
            stage: 'scanning',
            message: `✅ Product gevonden: ${scrapedData.title}`,
            percentage: scanProgress,
            scanned: results.scanned,
            detectedProducts: results.detectedProducts,
            productName: scrapedData.title,
            price: scrapedData.price
          });

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
                original_price: scrapedData.originalPrice || existing.original_price,
                discount_percentage: scrapedData.discountPercentage || existing.discount_percentage,
                discount_badge: scrapedData.discountBadge || existing.discount_badge,
                has_free_shipping: scrapedData.hasFreeShipping || existing.has_free_shipping,
                shipping_info: scrapedData.shippingInfo || existing.shipping_info,
                in_stock: scrapedData.inStock !== false,
                image_url: scrapedData.imageUrl || existing.image_url,
                brand: scrapedData.brand || existing.brand,
                rating: scrapedData.rating || existing.rating,
                review_count: scrapedData.reviewCount || existing.review_count,
                stock_level: scrapedData.stockLevel || existing.stock_level,
                delivery_time: scrapedData.deliveryTime || existing.delivery_time,
                bundle_info: scrapedData.bundleInfo || existing.bundle_info,
                updated_at: new Date()
              });
            
            results.updated++;
            console.log(`[SitemapImport] Updated: ${scrapedData.title}${scrapedData.discountPercentage ? ` (-${scrapedData.discountPercentage}%)` : ''}`);
          } else {
            const [newProduct] = await db('products').insert({
              customer_id: this.customerId,
              product_name: scrapedData.title,
              product_ean: null,
              product_sku: null,
              own_price: scrapedData.price,
              original_price: scrapedData.originalPrice || null,
              discount_percentage: scrapedData.discountPercentage || null,
              discount_badge: scrapedData.discountBadge || null,
              has_free_shipping: scrapedData.hasFreeShipping || false,
              shipping_info: scrapedData.shippingInfo || null,
              product_url: url,
              in_stock: scrapedData.inStock !== false,
              brand: scrapedData.brand || null,
              category: null,
              image_url: scrapedData.imageUrl || null,
              rating: scrapedData.rating || null,
              review_count: scrapedData.reviewCount || null,
              stock_level: scrapedData.stockLevel || null,
              delivery_time: scrapedData.deliveryTime || null,
              bundle_info: scrapedData.bundleInfo || null,
              import_source: 'sitemap',
              created_at: new Date()
            }).returning('*');
            
            results.created++;
            results.products.push(newProduct);
            const badges = [];
            if (scrapedData.imageUrl) badges.push('🖼️');
            if (scrapedData.discountPercentage) badges.push(`-${scrapedData.discountPercentage}%`);
            if (scrapedData.hasFreeShipping) badges.push('🚚 Free');
            if (scrapedData.rating) badges.push(`⭐${scrapedData.rating}`);
            if (scrapedData.brand) badges.push(scrapedData.brand);
            console.log(`[SitemapImport] Created: ${scrapedData.title} ${badges.join(' ')}`);
            
            // Auto-sync to Shopify
            try {
              const shopifyProduct = await this.shopify.createProduct({
                title: scrapedData.title,
                description: `${scrapedData.brand || 'Product'} - imported from sitemap`,
                brand: scrapedData.brand,
                price: scrapedData.price,
                imageUrl: scrapedData.imageUrl,
                tags: ['PriceElephant', `customer-${this.customerId}`, scrapedData.brand].filter(Boolean)
              });
              
              // Update with Shopify product ID
              await db('products')
                .where({ id: newProduct.id })
                .update({ 
                  shopify_product_id: shopifyProduct.id,
                  updated_at: new Date()
                });
              
              console.log(`[SitemapImport] ✅ Synced to Shopify: ${shopifyProduct.id}`);
            } catch (shopifyError) {
              console.error(`[SitemapImport] ⚠️ Shopify sync failed: ${shopifyError.message}`);
              // Continue even if Shopify sync fails - product is still in DB
            }
            
            sendProgress({
              stage: 'saving',
              message: `💾 Opgeslagen: ${scrapedData.title}`,
              percentage: scanProgress,
              created: results.created,
              updated: results.updated
            });
          }

        } catch (error) {
          console.error(`[SitemapImport] Error scanning ${url}:`, error.message);
          console.error(`[SitemapImport] Error stack:`, error.stack);
          results.errors.push({
            url,
            error: error.message,
            stack: error.stack?.substring(0, 200) // First 200 chars of stack
          });
          results.skipped++;
          
          sendProgress({
            stage: 'scanning',
            message: `⚠️ Error: ${error.message.substring(0, 50)}`,
            percentage: scanProgress,
            errors: results.errors.length,
            lastError: error.message
          });
        }
      }

      sendProgress({
        stage: 'finalizing',
        message: 'Import afronden...',
        percentage: 90
      });

      const scraperStats = this.scraper.getStats();
      results.scrapingStats = {
        direct: scraperStats.directSuccess || 0,
        freeProxy: scraperStats.freeProxySuccess || 0,
        paidProxy: scraperStats.paidProxySuccess || 0,
        aiVision: scraperStats.aiVisionSuccess || 0,
        totalCost: parseFloat(scraperStats.totalCost) || 0
      };

      sendProgress({
        stage: 'complete',
        message: '✅ Import voltooid!',
        percentage: 100,
        results: {
          scanned: results.scanned,
          detectedProducts: results.detectedProducts,
          created: results.created,
          updated: results.updated,
          skipped: results.skipped,
          errors: results.errors.length
        }
      });

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
