/**
 * Test Adaptive Throttling
 * 
 * Demonstrates how adaptive throttling improves scraping efficiency:
 * - Faster on lenient sites (Bol.com)
 * - Slower on strict sites (Coolblue)
 * - Self-healing on rate limits
 */

require('dotenv').config();
const HybridScraper = require('../crawlers/hybrid-scraper');

async function testAdaptiveThrottling() {
  const scraper = new HybridScraper();
  
  console.log('🧪 Testing Adaptive Throttling\n');
  console.log('This will scrape 5 products and show how delays adapt per retailer\n');
  
  // Test URLs (mix of lenient and strict retailers)
  const testProducts = [
    { name: 'Bol.com Product 1', url: 'https://www.bol.com/nl/nl/p/test-product/123456789', retailer: 'bol' },
    { name: 'Coolblue Product 1', url: 'https://www.coolblue.nl/product/123456', retailer: 'coolblue' },
    { name: 'Bol.com Product 2', url: 'https://www.bol.com/nl/nl/p/test-product-2/987654321', retailer: 'bol' },
    { name: 'Coolblue Product 2', url: 'https://www.coolblue.nl/product/654321', retailer: 'coolblue' },
    { name: 'Amazon Product 1', url: 'https://www.amazon.nl/dp/B08TEST123', retailer: 'amazon' }
  ];
  
  console.log('📊 Initial throttler state:');
  console.log('All retailers start at 2000ms delay\n');
  
  for (let i = 0; i < testProducts.length; i++) {
    const product = testProducts[i];
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔄 Scraping ${i + 1}/${testProducts.length}: ${product.name}`);
    console.log(`${'='.repeat(80)}\n`);
    
    try {
      const result = await scraper.scrapeProduct(product.url, null, product.retailer);
      
      console.log(`\n✅ Success:`, {
        tier: result.tier,
        cost: `€${result.cost}`,
        responseTime: `${result.responseTime}ms`
      });
      
    } catch (error) {
      console.log(`\n❌ Failed: ${error.message}`);
    }
    
    // Show current throttler state after each request
    const throttlerStats = scraper.throttler.getStats(product.retailer === 'bol' ? 'Bol.com' : 
                                                       product.retailer === 'coolblue' ? 'Coolblue' : 
                                                       'Amazon.nl');
    
    console.log('\n📈 Throttler updated for', throttlerStats.retailer);
    console.log('   Current delay:', throttlerStats.currentDelay + 'ms');
    console.log('   Error rate:', throttlerStats.errorRate);
    console.log('   Success rate:', throttlerStats.successRate);
    console.log('   Avg response time:', throttlerStats.avgResponseTime);
  }
  
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('📊 FINAL THROTTLING STATS');
  console.log(`${'='.repeat(80)}\n`);
  
  const finalStats = scraper.getStats();
  
  console.log('Overall Performance:');
  console.log(`  Total scrapes: ${finalStats.total}`);
  console.log(`  Success rate: ${finalStats.successRate}`);
  console.log(`  Total cost: ${finalStats.totalCost}`);
  console.log(`  Avg cost per scrape: ${finalStats.avgCostPerScrape}\n`);
  
  console.log('Per-Retailer Throttling:');
  if (finalStats.throttlingStats && finalStats.throttlingStats.length > 0) {
    finalStats.throttlingStats.forEach(stats => {
      console.log(`\n  ${stats.retailer}:`);
      console.log(`    Current delay: ${stats.currentDelay}ms`);
      console.log(`    Error rate: ${stats.errorRate}`);
      console.log(`    Success rate: ${stats.successRate}`);
      console.log(`    Total requests: ${stats.totalRequests}`);
      console.log(`    Avg response time: ${stats.avgResponseTime}`);
    });
  }
  
  console.log('\n\n💡 Key Observations:');
  console.log('   - Lenient sites (Bol.com): delay should DECREASE over time');
  console.log('   - Strict sites (Coolblue): delay should INCREASE on errors');
  console.log('   - Rate limited sites (429): delay should DOUBLE exponentially');
  console.log('   - This is ADAPTIVE - it learns and optimizes automatically!\n');
  
  await scraper.close();
}

// Run test
if (require.main === module) {
  testAdaptiveThrottling()
    .then(() => {
      console.log('✅ Test completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Test failed:', err);
      process.exit(1);
    });
}

module.exports = testAdaptiveThrottling;
