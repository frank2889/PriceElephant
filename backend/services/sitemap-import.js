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
const cleanupOrphanedProducts = require('../scripts/cleanup-orphaned-products');

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
      onProgress = null,
      isCancelled = () => false,
      resumeFromPage = null // NEW: Resume from specific page
    } = options;

    console.log(`[SitemapImport] Starting intelligent product detection from: ${sitemapUrl}`);
    console.log(`[SitemapImport] Max products target: ${maxProducts}`);

    // Step 1: Cleanup orphaned products BEFORE import
    console.log(`[SitemapImport] 🧹 Step 1: Cleaning up orphaned products...`);
    sendProgress({
      stage: 'cleanup',
      message: 'Verwijderen van verouderde producten...',
      percentage: 2
    });
    
    try {
      const cleanupResults = await cleanupOrphanedProducts(this.customerId);
      console.log(`[SitemapImport] ✅ Cleanup complete: deleted ${cleanupResults.deleted} orphaned products`);
      sendProgress({
        stage: 'cleanup',
        message: `${cleanupResults.deleted} verouderde producten verwijderd`,
        percentage: 5
      });
    } catch (cleanupError) {
      console.error(`[SitemapImport] ⚠️ Cleanup warning: ${cleanupError.message}`);
      // Continue with import even if cleanup fails
    }

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

      let { sites } = await sitemap.fetch();
      console.log(`[SitemapImport] Found ${sites.length} URLs in sitemap`);

      // Check if this is a sitemap index (contains other sitemaps)
      if (sites.length > 0 && sites[0].includes('.xml')) {
        const firstUrl = sites[0];
        // Check if URLs are sitemap files (not product URLs)
        const isSitemapIndex = sites.every(url => 
          url.endsWith('.xml') || url.includes('sitemap')
        );
        
        if (isSitemapIndex) {
          console.log(`[SitemapImport] 🔍 Detected sitemap index with ${sites.length} sub-sitemaps`);
          
          // Try to find product sitemap
          const productSitemap = sites.find(url => 
            url.includes('product') || 
            url.includes('artikel') || 
            url.includes('items')
          );
          
          if (productSitemap) {
            console.log(`[SitemapImport] ✅ Found product sitemap: ${productSitemap}`);
            sendProgress({
              stage: 'parsing',
              message: `Sitemap index gedetecteerd, gebruik product sitemap...`,
              percentage: 8
            });
            
            // Fetch the product sitemap
            const productSitemapParser = new SitemapperClass({
              url: productSitemap,
              timeout: 15000
            });
            const productResult = await productSitemapParser.fetch();
            sites = productResult.sites;
            console.log(`[SitemapImport] Found ${sites.length} product URLs in ${productSitemap}`);
          } else {
            console.log(`[SitemapImport] ⚠️ No product sitemap found, using all sub-sitemaps`);
          }
        }
      }

      sendProgress({
        stage: 'parsing',
        message: `${sites.length} URLs gevonden in sitemap`,
        percentage: 10,
        totalUrls: sites.length
      });

      let cancellationNotified = false;
      const notifyCancelled = (payload = {}) => {
        if (cancellationNotified) return;
        cancellationNotified = true;
        sendProgress({
          stage: 'cancelled',
          message: 'Import gestopt op verzoek van gebruiker',
          cancelled: true,
          ...payload
        });
      };

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

      console.log(`[SitemapImport] Starting FAST URL pre-filter...`);

      sendProgress({
        stage: 'pre-filtering',
        message: 'Snelle URL analyse (categorie paginas filteren)...',
        percentage: 15
      });

      // FAST PRE-FILTER: URL pattern analysis only (no browser, instant)
      const productUrlCandidates = [];
      const categoryPatterns = [
        '/categor', '/collection', '/shop/', '/products/', '/zoeken',
        '/search', '/filter', '/browse', '/overzicht', '/alle-',
        '?page=', '&page=', '/page/', '?q=', '&q=',
        '/tag/', '/tags/', '/brand/', '/brands/', '/merk/'
      ];
      
      for (const url of candidateUrls) {
        const urlLower = url.toLowerCase();
        const isCategory = categoryPatterns.some(pattern => urlLower.includes(pattern));
        
        if (!isCategory) {
          productUrlCandidates.push(url);
        }
      }
      
      console.log(`[SitemapImport] Fast pre-filter: ${candidateUrls.length} URLs → ${productUrlCandidates.length} potential products (${candidateUrls.length - productUrlCandidates.length} categories filtered)`);

      sendProgress({
        stage: 'pre-filtering',
        message: `${productUrlCandidates.length} potentiële producten na snelle filtering`,
        percentage: 20,
        preScanFiltered: candidateUrls.length - productUrlCandidates.length,
        candidateUrls: productUrlCandidates.length
      });

      console.log(`[SitemapImport] Starting intelligent product detection with HybridScraper...`);

      sendProgress({
        stage: 'scanning',
        message: 'Intelligente scan gestart...',
        percentage: 25
      });

      const results = {
        created: 0,
        updated: 0,
        skipped: 0,
        preScanFiltered: candidateUrls.length - productUrlCandidates.length, // Already filtered
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
      
      // Rate limiting: wait between requests to avoid overwhelming Railway resources
      const delayBetweenRequests = 2000; // 2 seconds between scrapes
      
      // Use pre-filtered URLs instead of all candidate URLs
      for (let i = 0; i < productUrlCandidates.length && productsFound < maxProducts; i++) {
        if (isCancelled()) {
          console.log('[SitemapImport] Cancellation detected before scanning URL index', i);
          results.cancelled = true;
          notifyCancelled({
            percentage: Math.floor(25 + (i / productUrlCandidates.length) * 55),
            scanned: results.scanned,
            detectedProducts: results.detectedProducts
          });
          break;
        }

        const url = productUrlCandidates[i];
        results.scanned++;
        
        // Calculate real-time percentage (25% to 80% for scanning)
        const scanProgress = Math.floor(25 + (i / productUrlCandidates.length) * 55);
        
        sendProgress({
          stage: 'scanning',
          message: `Scan ${i + 1}/${Math.min(productUrlCandidates.length, maxProducts)} - ${url.substring(0, 50)}...`,
          percentage: scanProgress,
          scanned: results.scanned,
          detectedProducts: results.detectedProducts,
          created: results.created,
          currentUrl: url
        });
        
        console.log(`[SitemapImport] [${i+1}/${productUrlCandidates.length}] Scraping: ${url}`);

        try {
          // Skip pre-scan in scrapeProduct (already done via URL patterns)
          const scrapedData = await this.scraper.scrapeProduct(url, null, null, null, true);
          
          // Rate limiting: wait before next request
          if (i < productUrlCandidates.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
          }

          if (isCancelled()) {
            console.log('[SitemapImport] Cancellation detected after scraping URL', url);
            results.cancelled = true;
            notifyCancelled({
              percentage: Math.floor(25 + (i / productUrlCandidates.length) * 55),
              scanned: results.scanned,
              detectedProducts: results.detectedProducts
            });
            break;
          }
          
          if (!scrapedData || !scrapedData.price || !scrapedData.title) {
          if (results.cancelled && !cancellationNotified) {
            notifyCancelled({
              percentage: 100,
              scanned: results.scanned,
              detectedProducts: results.detectedProducts
            });
          }

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
              shopify_customer_id: this.customerId,
              product_url: url
            })
            .first();

          if (existing) {
            await db('products')
              .where({ id: existing.id })
              .update({
                product_name: scrapedData.title,
                product_ean: scrapedData.ean || existing.product_ean,
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
                active: true,
                updated_at: new Date()
              });
            
            results.updated++;
            console.log(`[SitemapImport] Updated: ${scrapedData.title}${scrapedData.discountPercentage ? ` (-${scrapedData.discountPercentage}%)` : ''}`);

            if (!existing.shopify_product_id) {
              try {
                const shopifyProduct = await this.shopify.createProduct({
                  title: scrapedData.title,
                  description: `${scrapedData.brand || 'Product'} - imported from sitemap`,
                  brand: scrapedData.brand,
                  price: scrapedData.price,
                  imageUrl: scrapedData.imageUrl,
                  tags: ['PriceElephant', `customer-${this.customerId}`, scrapedData.brand].filter(Boolean)
                });

                await db('products')
                  .where({ id: existing.id })
                  .update({
                    shopify_product_id: shopifyProduct.id,
                    updated_at: new Date()
                  });

                console.log(`[SitemapImport] ♻️ Recreated Shopify product ${shopifyProduct.id} for ${scrapedData.title}`);
              } catch (shopifyError) {
                console.error(`[SitemapImport] ⚠️ Shopify resync failed: ${shopifyError.message}`);
              }
            }
          } else {
            const [newProduct] = await db('products').insert({
              shopify_customer_id: this.customerId,
              product_name: scrapedData.title,
              product_ean: scrapedData.ean || null,
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
              active: true,
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
          // Check if this is a pre-scan filter (category page detected)
          const isPreScanFilter = error.message.includes('Not a product page');
          
          if (isPreScanFilter) {
            console.log(`[SitemapImport] 🔍 Pre-scan filtered: ${url} - ${error.message}`);
            results.skipped++;
            results.preScanFiltered++; // Track pre-scan filters separately
            
            sendProgress({
              stage: 'scanning',
              message: `🔍 Gefilterd: category/listing page`,
              percentage: scanProgress,
              scanned: results.scanned,
              skipped: results.skipped,
              preScanFiltered: results.preScanFiltered
            });
          } else {
            // Real error (not a pre-scan filter)
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
          preScanFiltered: results.preScanFiltered,
          errors: results.errors.length
        }
      });

      console.log(`[SitemapImport] ✅ Complete!`);
      console.log(`[SitemapImport] Scanned: ${results.scanned} URLs`);
      console.log(`[SitemapImport] Products detected: ${results.detectedProducts}`);
      console.log(`[SitemapImport] Created: ${results.created}, Updated: ${results.updated}`);
      console.log(`[SitemapImport] Skipped: ${results.skipped} (Pre-scan filtered: ${results.preScanFiltered})`);
      console.log(`[SitemapImport] Errors: ${results.errors.length}`);
      console.log(`[SitemapImport] Scraping cost: €${results.scrapingStats.totalCost.toFixed(4)}`);

      return results;

    } catch (error) {
      throw new Error(`Sitemap import failed: ${error.message}`);
    }
  }
}

module.exports = SitemapImportService;
