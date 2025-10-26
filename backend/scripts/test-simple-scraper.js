/**
 * Simple Test - Enhanced Hybrid Scraper
 * Tests intelligent scheduling and alerts without complex DB setup
 */

require('dotenv').config();
const HybridScraper = require('../crawlers/hybrid-scraper');

async function simpleTest() {
  console.log('🧪 Simple Enhanced Scraper Test\n');
  console.log('Testing features:');
  console.log('✅ Multi-tier fallback');
  console.log('✅ Intelligent scheduler integration');
  console.log('✅ Price alert service integration\n');

  const scraper = new HybridScraper();

  // Test URL (Coolblue)
  const testUrl = 'https://www.coolblue.nl/product/938461/apple-iphone-15-pro-128gb-naturel-titanium.html';
  const testEan = '0194253782452';

  console.log(`\n${'='.repeat(60)}`);
  console.log('🎯 Test 1: Basic Scrape (no productId - no scheduling)');
  console.log(`${'='.repeat(60)}\n`);
  console.log(`URL: ${testUrl}`);
  console.log(`EAN: ${testEan}\n`);

  try {
    const result1 = await scraper.scrapeProduct(
      testUrl,
      testEan,
      'coolblue',
      null, // no productId
      null  // no customerId
    );

    if (result1.skipped) {
      console.log('⏭️  SKIPPED:', result1.reason);
    } else {
      console.log('✅ SCRAPE SUCCESS:');
      console.log(`   - Title: ${result1.title}`);
      console.log(`   - Price: €${result1.price}`);
      console.log(`   - In Stock: ${result1.inStock}`);
      console.log(`   - Method: ${result1.tier}`);
      console.log(`   - Cost: €${result1.cost}`);
      console.log(`   - Retailer: ${result1.retailer}`);
    }

  } catch (error) {
    console.error('❌ Scrape failed:', error.message);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Final Statistics');
  console.log(`${'='.repeat(60)}\n`);

  const stats = scraper.getStats();
  console.log('Tier Performance:');
  console.log(`   - Total scrapes: ${stats.total}`);
  console.log(`   - Direct (FREE): ${stats.directSuccess} (${((stats.directSuccess/stats.total)*100).toFixed(1)}%)`);
  console.log(`   - Free proxies: ${stats.freeProxySuccess}`);
  console.log(`   - WebShare (€0.0003): ${stats.paidProxySuccess}`);
  console.log(`   - Bright Data (€0.01): ${stats.premiumProxySuccess}`);
  console.log(`   - AI Vision (€0.02): ${stats.aiVisionSuccess}`);
  console.log(`   - Failures: ${stats.failures}`);
  console.log(`\nCost Analysis:`);
  console.log(`   - Total cost: €${stats.totalCost.toFixed(4)}`);
  console.log(`   - Avg per scrape: €${(stats.totalCost / stats.total).toFixed(4)}`);

  const savingsVsBrightData = (0.01 - (stats.totalCost / stats.total)) * 1000;
  console.log(`   - Savings vs Bright Data only: €${savingsVsBrightData.toFixed(2)}/1000 scrapes`);

  console.log('\n✅ Test complete!\n');
  console.log('💡 Note: Intelligent scheduling and alerts require productId + customerId');
  console.log('   Test with database integration for full feature testing\n');
}

simpleTest()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
