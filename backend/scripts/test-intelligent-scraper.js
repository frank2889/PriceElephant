/**
 * Test Intelligent Scraper
 */

require('dotenv').config();
const IntelligentScraper = require('../crawlers/intelligent-scraper');

async function test() {
  console.log('🧪 Testing Intelligent AI Scraper\n');
  console.log('Strategy:');
  console.log('1️⃣ Try learned selectors (FREE)');
  console.log('2️⃣ AI analyzes HTML → generates selectors (€0.001)');
  console.log('3️⃣ Try AI selectors');
  console.log('4️⃣ Vision fallback if needed (€0.02)\n');

  const scraper = new IntelligentScraper();
  
  const testUrls = [
    'https://www.coolblue.nl/product/938461/apple-iphone-15-pro-128gb-naturel-titanium.html',
    'https://www.bol.com/nl/nl/p/apple-iphone-15-pro-128gb-naturel-titanium/9300000152967075/'
  ];

  for (const url of testUrls) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Testing: ${url}`);
    console.log('='.repeat(70) + '\n');

    try {
      const result = await scraper.scrape(url);
      
      console.log('\n✅ SUCCESS:');
      console.log(`   Title: ${result.title}`);
      console.log(`   Price: €${result.price}`);
      console.log(`   Stock: ${result.inStock ? 'In stock' : 'Out of stock'}`);
      console.log(`   Method: ${result.method}`);
      console.log(`   Cost: €${result.cost}`);

      // Try again to test caching
      console.log('\n🔄 Testing again (should use cached selectors)...\n');
      const result2 = await scraper.scrape(url);
      console.log(`   Method: ${result2.method} (should be "cached")`);
      console.log(`   Cost: €${result2.cost} (should be 0)`);
      
    } catch (error) {
      console.error('\n❌ FAILED:', error.message);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('📊 FINAL STATS');
  console.log('='.repeat(70));
  
  const stats = scraper.getStats();
  console.log(`\nTotal scrapes: ${stats.total}`);
  console.log(`Cached (FREE): ${stats.cached} (${((stats.cached/stats.total)*100).toFixed(0)}%)`);
  console.log(`HTML Analysis: ${stats.htmlAnalysis} (€0.001 each)`);
  console.log(`Vision Fallback: ${stats.visionFallback} (€0.02 each)`);
  console.log(`\nTotal cost: €${stats.totalCost.toFixed(4)}`);
  console.log(`Avg cost: €${stats.avgCost}/scrape`);
  console.log(`Success rate: ${stats.successRate}%`);
  
  console.log(`\n💡 INSIGHT:`);
  console.log(`   First scrape: €0.001-0.02 (AI learns)`);
  console.log(`   Next scrapes: FREE (uses learned selectors)`);
  console.log(`   Cost per product: €0.001 one-time + FREE forever`);
  console.log(`   500 products = €0.50 one-time, then FREE! 🎉\n`);

  process.exit(0);
}

test();
