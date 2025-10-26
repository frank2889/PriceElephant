/**
 * Test Simple Hybrid Scraper
 * Tests 4-tier fallback + price alerts
 */

require('dotenv').config();
const SimpleHybridScraper = require('../crawlers/simple-hybrid-scraper');

async function test() {
  console.log('🧪 Testing Simple Hybrid Scraper\n');
  
  const scraper = new SimpleHybridScraper();
  const testUrl = 'https://www.coolblue.nl/product/938461/apple-iphone-15-pro-128gb-naturel-titanium.html';

  try {
    console.log(`URL: ${testUrl}\n`);
    
    const result = await scraper.scrape(testUrl, 'coolblue');
    
    console.log('\n✅ RESULT:');
    console.log(`   Title: ${result.title}`);
    console.log(`   Price: €${result.price}`);
    console.log(`   Stock: ${result.inStock ? 'In stock' : 'Out of stock'}`);
    console.log(`   Tier: ${result.tier}`);
    console.log(`   Cost: €${result.cost}`);
    
    console.log('\n📊 STATS:');
    const stats = scraper.getStats();
    console.log(`   Total: ${stats.total}`);
    console.log(`   Direct: ${stats.direct}`);
    console.log(`   Free Proxy: ${stats.freeProxy}`);
    console.log(`   WebShare: ${stats.webshare}`);
    console.log(`   AI Vision: ${stats.aiVision}`);
    console.log(`   Failures: ${stats.failures}`);
    console.log(`   Avg Cost: €${stats.avgCost}`);
    console.log(`   Success Rate: ${stats.successRate}%`);
    
    console.log('\n✅ Test complete!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  } finally {
    process.exit(0);
  }
}

test();
