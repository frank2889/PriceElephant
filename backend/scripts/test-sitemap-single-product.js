/**
 * Test sitemap import for a single product
 * Helps debug why products aren't being created
 */

require('dotenv').config();
const SitemapImportService = require('../services/sitemap-import');

const customerId = '8557353828568';
const testUrl = 'https://www.hobo.nl/marantz-cd-60-cd-speler-zilver.html'; // A product not yet in DB

(async () => {
  console.log('🧪 Testing sitemap import for single product...\n');
  console.log(`Customer: ${customerId}`);
  console.log(`Test URL: ${testUrl}\n`);
  
  try {
    const service = new SitemapImportService(customerId);
    
    // Initialize Shopify (this should load customer config)
    await service._initShopify();
    
    if (!service.shopify) {
      console.error('❌ Shopify not initialized!');
      process.exit(1);
    }
    
    console.log('✅ Shopify initialized\n');
    
    // Try to scrape the product
    console.log('🔍 Scraping product...');
    const scrapedData = await service.scraper.scrapeProduct(testUrl, null, null, null, true);
    
    if (!scrapedData || !scrapedData.price || !scrapedData.title) {
      console.error('❌ Scraping failed or incomplete data:');
      console.error('  Title:', scrapedData?.title || 'MISSING');
      console.error('  Price:', scrapedData?.price || 'MISSING');
      process.exit(1);
    }
    
    console.log('✅ Product scraped successfully:');
    console.log(`  Title: ${scrapedData.title}`);
    console.log(`  Price: €${scrapedData.price}`);
    console.log(`  Brand: ${scrapedData.brand || 'N/A'}`);
    console.log(`  Image: ${scrapedData.imageUrl ? 'Yes' : 'No'}\n`);
    
    // This is what the sitemap import would do:
    console.log('📝 Would create in database with:');
    console.log(`  shopify_customer_id: ${customerId}`);
    console.log(`  product_name: ${scrapedData.title}`);
    console.log(`  own_price: ${scrapedData.price}`);
    console.log(`  product_url: ${testUrl}\n`);
    
    console.log('📝 Would create in Shopify via:');
    console.log(`  service.shopify.createProduct({...})\n`);
    
    console.log('✅ Test complete - sitemap import should work!');
    console.log('If products are not being created, check:');
    console.log('1. Are products being detected? (check "detected" count)');
    console.log('2. Are they already in DB? (would update instead of create)');
    console.log('3. Check Railway logs for Shopify API errors');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
  
  process.exit(0);
})();
